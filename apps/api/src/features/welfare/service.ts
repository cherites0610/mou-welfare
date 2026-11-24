// 福利搜尋與詳情（docs/backend.md §8.2）。
// 先用 SQL 篩選與排序，再只對當頁資料做資格比對（v1 把全部資料載入記憶體才分頁）。
import {
  heldIdentities,
  IDENTITY_COMPATIBILITY,
  type Identity,
  type MatchProfile,
  type MatchResult,
  match,
  TOPICS,
  topicFromSlug,
} from '@mou-welfare/shared'
import { and, arrayOverlaps, asc, count, desc, eq, ilike, inArray, or, type SQL, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { favorites, PUBLIC_STATUSES, welfareAttachments, welfarePrograms as w } from '../../db/schema/index.ts'
import { type FamilyMatch, type FamilyProfile, matchFamily } from '../family/service.ts'

export type SearchParams = {
  q?: string | undefined
  cities?: string[] | undefined
  categories?: string[] | undefined
  topic?: string | undefined
  page: number
  limit: number
}

export type WelfareSummary = {
  id: string
  name: string
  city: string
  categories: string[]
  identities: string[]
  summary: string
  publishedAt: string | null
  deadline: string | null
  match: MatchResult | null
  familyMatches: FamilyMatch[] | null
}

const summaryColumns = {
  id: w.id,
  name: w.name,
  city: w.city,
  categories: w.categories,
  identities: w.identities,
  summary: w.summary,
  publishedAt: w.publishedAt,
  deadline: w.deadline,
}

/** LIKE 的萬用字元要跳脫，避免使用者輸入 % 或 _ 改變查詢意義 */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

/** 使用者能滿足的「要求身分」：自己具備的，加上相容規則涵蓋的（例：低收入戶 → 也滿足中低收入戶） */
export function satisfiableIdentities(profile: MatchProfile, today: Date): Identity[] {
  const held = heldIdentities(profile, today)
  const out = new Set<Identity>(held)
  for (const [req, alts] of Object.entries(IDENTITY_COMPATIBILITY) as [Identity, readonly Identity[]][]) {
    if (alts.some((a) => held.has(a))) out.add(req)
  }
  return [...out]
}

// 主題的關鍵字是程式裡的常數（不是使用者輸入），以參數傳給 PostgreSQL 的正規表示式比對
const topicMatch = (pattern: string) => sql`(${w.name} ~ ${pattern} or ${w.summary} ~ ${pattern})`

function filters(p: SearchParams): SQL | undefined {
  const conds: SQL[] = [eq(w.status, 'active')]
  if (p.cities?.length) conds.push(inArray(w.city, p.cities))
  // R3：多類別福利以任一類別篩選都要找得到（陣列重疊，不是 IN）
  if (p.categories?.length) conds.push(arrayOverlaps(w.categories, p.categories))
  if (p.q) {
    const pattern = `%${escapeLike(p.q)}%`
    conds.push(or(ilike(w.name, pattern), ilike(w.summary, pattern))!)
  }
  const topic = p.topic ? topicFromSlug(p.topic) : undefined
  if (topic) conds.push(topicMatch(topic.pattern))
  return and(...conds)
}

export async function searchPrograms(
  db: Db,
  p: SearchParams,
  profile: MatchProfile | null,
  today: Date = new Date(),
  family: FamilyProfile[] | null = null,
): Promise<{ data: WelfareSummary[]; total: number }> {
  const where = filters(p)
  // 置頂（只在符合篩選條件的結果裡）→ R4：有身分限制的福利排前面；登入時再把「使用者可能符合」的排前面；家庭模式再把「家人可能符合」的排前面
  //（v1 的權重是「本人分數 × 1000 + 家人最高分」：本人優先，其次家人）
  const order: SQL[] = [sql`${w.pinnedAt} desc nulls last`, desc(sql`cardinality(${w.identities}) > 0`)]
  if (profile) {
    const mine = satisfiableIdentities(profile, today)
    if (mine.length) order.push(desc(arrayOverlaps(w.identities, mine)))
  }
  if (family?.length) {
    const theirs = [...new Set(family.flatMap((m) => satisfiableIdentities(m, today)))]
    if (theirs.length) order.push(desc(arrayOverlaps(w.identities, theirs)))
  }
  order.push(sql`${w.publishedAt} desc nulls last`, asc(w.id))

  const [rows, [totalRow]] = await Promise.all([
    db
      .select(summaryColumns)
      .from(w)
      .where(where)
      .orderBy(...order)
      .limit(p.limit)
      .offset((p.page - 1) * p.limit),
    db.select({ n: count() }).from(w).where(where),
  ])
  return {
    data: rows.map((r) => ({
      ...r,
      match: profile ? match(profile, r.identities, today) : null,
      familyMatches: family ? matchFamily(family, r.identities, today) : null,
    })),
    total: totalRow?.n ?? 0,
  }
}

export async function getProgram(
  db: Db,
  id: string,
  profile: MatchProfile | null,
  userId: string | null,
  family: FamilyProfile[] | null = null,
) {
  const [row] = await db
    .select({
      ...summaryColumns,
      requirements: w.requirements,
      rewards: w.rewards,
      contentMd: w.contentMd,
      sourceUrl: w.sourceUrl,
      status: w.status,
    })
    .from(w)
    .where(eq(w.id, id))
  if (!row || !isPublic(row.status)) return null

  const [attachments, fav] = await Promise.all([
    db
      .select({ name: welfareAttachments.name, url: welfareAttachments.url })
      .from(welfareAttachments)
      .where(eq(welfareAttachments.programId, id)),
    userId
      ? db
          .select({ n: count() })
          .from(favorites)
          .where(and(eq(favorites.userId, userId), eq(favorites.programId, id)))
      : Promise.resolve(null),
  ])
  const { status: _status, ...rest } = row
  return {
    ...rest,
    expired: row.status === 'expired',
    attachments,
    isFavorite: fav ? (fav[0]?.n ?? 0) > 0 : null,
    match: profile ? match(profile, row.identities) : null,
    familyMatches: family ? matchFamily(family, row.identities) : null,
  }
}

export const isPublic = (status: string) => (PUBLIC_STATUSES as readonly string[]).includes(status)

/** sitemap 用：所有上架中福利的 id 與最後更新時間 */
export async function listSitemap(db: Db) {
  return db
    .select({ id: w.id, updatedAt: w.updatedAt })
    .from(w)
    .where(eq(w.status, 'active'))
    .orderBy(asc(w.id))
}

export function profileOf(u: { birthday?: string | null; gender?: string | null; identities?: string[] | null } | null) {
  return u ? { birthday: u.birthday ?? null, gender: u.gender ?? null, identities: u.identities ?? [] } : null
}

/** 主題頁用的筆數（只算上架中）：縣市 × 類別、人生階段主題 */
export async function topicCounts(db: Db) {
  const active = eq(w.status, 'active')
  const [cityRows, pairs, [topicRow]] = await Promise.all([
    db.select({ city: w.city, n: count() }).from(w).where(active).groupBy(w.city),
    db.execute<{ city: string; category: string; n: number }>(
      sql`select ${w.city} as city, c as category, count(*)::int as n
          from ${w}, unnest(${w.categories}) as c where ${active} group by 1, 2`,
    ),
    db
      .select(Object.fromEntries(TOPICS.map((t) => [t.slug, sql<number>`count(*) filter (where ${topicMatch(t.pattern)})::int`])))
      .from(w)
      .where(active),
  ])
  return {
    cities: cityRows.map((r) => ({
      city: r.city,
      total: r.n,
      categories: Object.fromEntries(pairs.filter((p) => p.city === r.city).map((p) => [p.category, Number(p.n)])),
    })),
    topics: TOPICS.map((t) => ({ slug: t.slug, total: Number(topicRow?.[t.slug] ?? 0) })),
  }
}
