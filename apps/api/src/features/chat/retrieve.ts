// 聊天的混合檢索（docs/backend.md §8.9）：一條 SQL 算語意分數（pgvector cosine）與關鍵字分數，
// 取前 20 筆做資格比對，綠燈加分後取前 6 筆。問題的 embedding 失敗或沒有 LLM 時只用關鍵字與條件。
import { type MatchProfile, match } from '@mou-welfare/shared'
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { welfarePrograms as w } from '../../db/schema/index.ts'
import { type FamilyProfile, matchFamily } from '../family/service.ts'
import { satisfiableIdentities, type WelfareSummary } from '../welfare/service.ts'
import { type ChatFilters, parseQuery } from './parse.ts'

export type Source = WelfareSummary & { requirements: string[]; rewards: string[]; score: number }

export const CANDIDATES = 20
export const TOP_K = 6
/** 分數低於第一名的這個比例就不列（避免硬湊 6 筆不相關的） */
export const RELATIVE_CUTOFF = 0.6
const SEMANTIC_WEIGHT = 0.7
const LIGHT_BONUS = { GREEN: 0.04, YELLOW: 0.02, RED: 0 } as const

/**
 * 關鍵字分數用的二字詞。pg_trgm 把整句中文當成一個詞，「育兒津貼」對「臺北市育兒津貼補助」只有 0.4，
 * 所以改用「問題的二字詞有幾成出現在名稱／摘要」。
 */
export function keywordGrams(keywords: string, max = 24): string[] {
  const grams = new Set<string>()
  for (const seg of keywords.split(/[^\p{L}\p{N}]+/u)) {
    const chars = [...seg]
    if (chars.length === 1) continue
    for (let i = 0; i + 2 <= chars.length; i++) grams.add(chars.slice(i, i + 2).join(''))
  }
  return [...grams].slice(0, max)
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

export type RetrieveInput = {
  filters: ChatFilters
  /** 問題（filters.query）的 embedding；null＝只用關鍵字 */
  embedding: number[] | null
  profile: MatchProfile | null
  family: FamilyProfile[] | null
  today?: Date
  limit?: number
}

export async function retrieve(db: Db, input: RetrieveInput): Promise<Source[]> {
  const { filters, embedding, profile, family } = input
  const today = input.today ?? new Date()
  const grams = keywordGrams(parseQuery(filters.query).keywords)

  // 關鍵字分數：名稱命中的比例（權重 1）＋摘要命中的比例（權重 0.5），正規化到 0–1
  const hits = (col: typeof w.name | typeof w.summary) =>
    grams.length
      ? sql.join(
          grams.map((g) => sql`(${col} like ${`%${escapeLike(g)}%`})::int`),
          sql` + `,
        )
      : sql`0`
  const kw = grams.length ? sql`((${hits(w.name)}) + 0.5 * (${hits(w.summary)}))::float / ${grams.length * 1.5}` : sql`0::float`
  const sem = embedding ? sql`coalesce(1 - (${w.embedding} <=> ${`[${embedding.join(',')}]`}::vector), 0)` : null
  let score: SQL = sem ? sql`${SEMANTIC_WEIGHT} * ${sem} + ${1 - SEMANTIC_WEIGHT} * ${kw}` : kw

  // 加權：福利要求的身分與問題提到的（含相容規則）重疊、類別相符、使用者（或家人）可能符合
  const asked = satisfiableIdentities({ identities: filters.identities }, today)
  if (asked.length) score = sql`${score} + 0.05 * (${w.identities} && ${sql.param(asked)}::text[])::int`
  if (filters.categories.length) score = sql`${score} + 0.03 * (${w.categories} && ${sql.param(filters.categories)}::text[])::int`
  const mine = new Set([...(profile ? satisfiableIdentities(profile, today) : []), ...(family ?? []).flatMap((m) => satisfiableIdentities(m, today))])
  if (mine.size) score = sql`${score} + 0.03 * (${w.identities} && ${sql.param([...mine])}::text[])::int`

  const conds: SQL[] = [eq(w.status, 'active')]
  if (filters.cities.length) conds.push(inArray(w.city, filters.cities))

  const rows = await db
    .select({
      id: w.id,
      name: w.name,
      city: w.city,
      categories: w.categories,
      identities: w.identities,
      summary: w.summary,
      publishedAt: w.publishedAt,
      deadline: w.deadline,
      requirements: w.requirements,
      rewards: w.rewards,
      score: sql<number>`(${score})::float`.as('score'),
    })
    .from(w)
    .where(and(...conds))
    .orderBy(sql`score desc`, w.id)
    .limit(CANDIDATES)

  const ranked = rows
    .map((r) => {
      const m = profile ? match(profile, r.identities, today) : null
      return {
        ...r,
        match: m,
        familyMatches: family ? matchFamily(family, r.identities, today) : null,
        // 綠燈加分；家庭模式時看本人與家人裡最好的燈號
        final: r.score + bestBonus(m?.light, family ? matchFamily(family, r.identities, today).map((f) => f.match.light) : []),
      }
    })
    .sort((a, b) => b.final - a.final)

  const top = ranked[0]?.score ?? 0
  return ranked
    .filter((r) => r.score >= top * RELATIVE_CUTOFF)
    .slice(0, input.limit ?? TOP_K)
    .map(({ final: _f, ...r }) => r)
}

function bestBonus(mine: keyof typeof LIGHT_BONUS | undefined, family: (keyof typeof LIGHT_BONUS)[]): number {
  return Math.max(0, ...[mine, ...family].filter((l) => l !== undefined).map((l) => LIGHT_BONUS[l]))
}
