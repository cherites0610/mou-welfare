// 管理端（docs/backend.md §8.7）：總覽統計、福利人工修正、LLM 用量、使用者（唯讀）、稽核紀錄。
// 查看使用者詳情、修改福利、重新結構化都會寫入 admin_audit。
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import {
  account,
  adminAudit,
  favorites,
  families,
  familyMembers,
  llmCalls,
  llmPause,
  session,
  user,
  welfareAttachments,
  welfarePrograms as w,
  welfareSources,
} from '../../db/schema/index.ts'
import { ApiError } from '../../lib/errors.ts'
import type { Queue } from '../../lib/queue.ts'

export type Admin = { id: string; email: string; ip: string | null }

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null)
const num = (v: unknown) => Number(v ?? 0)
const page = (p: { page: number; limit: number }) => ({ limit: p.limit, offset: (p.page - 1) * p.limit })

export async function audit(db: Db, admin: Admin, action: string, targetType: string, targetId: string, detail: Record<string, unknown> = {}) {
  await db.insert(adminAudit).values({ adminId: admin.id, adminEmail: admin.email, action, targetType, targetId, detail, ip: admin.ip })
}

// ---------------- 總覽 ----------------

export async function overview(db: Db) {
  const byCity = await db
    .select({ city: w.city, status: w.status, n: count() })
    .from(w)
    .where(sql`${w.status} <> 'removed'`)
    .groupBy(w.city, w.status)
  const cities = new Map<string, Record<string, number>>()
  for (const r of byCity) {
    const c = cities.get(r.city) ?? { active: 0, rejected: 0, expired: 0, pending: 0 }
    c[r.status] = r.n
    cities.set(r.city, c)
  }

  const [structure] = await db.execute<Record<string, string>>(sql`
    select count(*) filter (where structured_by = 'llm') as llm,
           count(*) filter (where structured_by = 'rules') as rules,
           count(*) filter (where structured_by is null) as unstructured,
           count(*) filter (where structure_error is not null) as errors,
           count(*) filter (where status_override is not null) as overridden,
           count(*) filter (where reviewed_at is not null) as reviewed
    from welfare_programs where status <> 'removed'`)
  const versions = await db
    .select({ model: w.structuredModel, promptVersion: w.structuredPromptVersion, n: count() })
    .from(w)
    .where(sql`${w.status} <> 'removed'`)
    .groupBy(w.structuredModel, w.structuredPromptVersion)
    .orderBy(desc(count()))

  const daily = await db.execute<Record<string, string>>(sql`
    select (created_at at time zone 'Asia/Taipei')::date::text as day, count(*) as calls, count(*) filter (where not ok) as errors,
           coalesce(sum(input_tokens), 0) as input, coalesce(sum(output_tokens), 0) as output,
           coalesce(sum(thoughts_tokens), 0) as thoughts, coalesce(sum(cost_usd), 0) as cost
    from llm_calls where created_at >= now() - interval '30 days' group by 1 order by 1`)
  const [llmTotal] = await db.execute<Record<string, string>>(sql`
    select coalesce(sum(cost_usd), 0) as cost, coalesce(sum(input_tokens), 0) as input, coalesce(sum(output_tokens), 0) as output, count(*) as calls
    from llm_calls`)
  const [pause] = await db.select().from(llmPause).limit(1)

  const [users] = await db.execute<Record<string, string>>(sql`
    select count(*) as total, count(*) filter (where email_verified) as verified,
           count(*) filter (where created_at >= now() - interval '7 days') as new7d,
           count(*) filter (where created_at >= now() - interval '30 days') as new30d,
           count(*) filter (where is_subscribed) as subscribed
    from "user"`)
  const [[fav], [fam]] = await Promise.all([db.select({ n: count() }).from(favorites), db.select({ n: count() }).from(families)])

  const sites = await db.execute<Record<string, string>>(sql`
    select s.site_id, count(distinct s.program_id) as programs, max(s.last_seen_at) as last_seen
    from welfare_sources s join welfare_programs p on p.id = s.program_id and p.status <> 'removed'
    group by 1 order by 1`)
  const [ingest] = await db.execute<{ last: string | null }>(sql`select max(received_at) as last from ingest_log`)

  return {
    welfare: {
      byCity: [...cities].map(([city, c]) => ({ city, active: c.active ?? 0, rejected: c.rejected ?? 0, expired: c.expired ?? 0, pending: c.pending ?? 0 }))
        .sort((a, b) => b.active + b.rejected + b.expired + b.pending - (a.active + a.rejected + a.expired + a.pending)),
      structure: {
        llm: num(structure?.llm), rules: num(structure?.rules), unstructured: num(structure?.unstructured),
        errors: num(structure?.errors), overridden: num(structure?.overridden), reviewed: num(structure?.reviewed),
      },
      versions: versions.map((v) => ({ model: v.model, promptVersion: v.promptVersion, count: v.n })),
    },
    llm: {
      paused: pause ? { at: iso(pause.pausedAt)!, reason: pause.reason.slice(0, 200), probedAt: iso(pause.probedAt) } : null,
      daily: daily.map((d) => ({
        day: d.day!, calls: num(d.calls), errors: num(d.errors), inputTokens: num(d.input), outputTokens: num(d.output),
        thoughtsTokens: num(d.thoughts), costUsd: num(d.cost),
      })),
      total: { calls: num(llmTotal?.calls), inputTokens: num(llmTotal?.input), outputTokens: num(llmTotal?.output), costUsd: num(llmTotal?.cost) },
    },
    users: {
      total: num(users?.total), verified: num(users?.verified), new7d: num(users?.new7d), new30d: num(users?.new30d),
      subscribed: num(users?.subscribed), favorites: fav!.n, families: fam!.n,
    },
    sources: {
      sites: sites.map((s) => ({ siteId: s.site_id!, programs: num(s.programs), lastSeenAt: iso(s.last_seen) })),
      lastIngestAt: iso(ingest?.last),
    },
  }
}

// ---------------- 福利 ----------------

export type WelfareFilter = {
  q?: string | undefined
  city?: string | undefined
  status?: (typeof w.status.enumValues)[number] | undefined
  structuredBy?: 'llm' | 'rules' | 'none' | undefined
  reviewed?: boolean | undefined
  error?: boolean | undefined
  page: number
  limit: number
}

export async function listWelfare(db: Db, f: WelfareFilter) {
  const conds: SQL[] = []
  if (f.q) conds.push(or(ilike(w.name, `%${f.q}%`), ilike(w.programKey, `%${f.q}%`), sql`${w.id}::text = ${f.q}`)!)
  if (f.city) conds.push(eq(w.city, f.city))
  if (f.status) conds.push(eq(w.status, f.status))
  if (f.structuredBy === 'none') conds.push(isNull(w.structuredBy))
  else if (f.structuredBy) conds.push(eq(w.structuredBy, f.structuredBy))
  if (f.reviewed !== undefined) conds.push(f.reviewed ? isNotNull(w.reviewedAt) : isNull(w.reviewedAt))
  if (f.error !== undefined) conds.push(f.error ? isNotNull(w.structureError) : isNull(w.structureError))
  const where = conds.length ? and(...conds) : undefined
  const { limit, offset } = page(f)
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: w.id, name: w.name, city: w.city, siteId: w.siteId, status: w.status, statusOverride: w.statusOverride,
        categories: w.categories, identities: w.identities, summary: w.summary, deadline: w.deadline,
        structuredBy: w.structuredBy, structuredModel: w.structuredModel, structuredAt: w.structuredAt,
        hasError: sql<boolean>`${w.structureError} is not null`, reviewedAt: w.reviewedAt, pinnedAt: w.pinnedAt,
        sourceUrl: w.sourceUrl, updatedAt: w.updatedAt,
      })
      .from(w)
      .where(where)
      .orderBy(desc(w.updatedAt), w.id)
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(w).where(where),
  ])
  return {
    data: rows.map((r) => ({ ...r, structuredAt: iso(r.structuredAt), reviewedAt: iso(r.reviewedAt), pinnedAt: iso(r.pinnedAt), updatedAt: iso(r.updatedAt)! })),
    total: total!.n,
  }
}

export async function getWelfare(db: Db, id: string) {
  const [p] = await db.select().from(w).where(eq(w.id, id))
  if (!p) throw new ApiError(404, 'not_found', '找不到這個福利')
  const [attachments, sources, calls, history] = await Promise.all([
    db.select({ name: welfareAttachments.name, url: welfareAttachments.url, text: welfareAttachments.text })
      .from(welfareAttachments).where(eq(welfareAttachments.programId, id)),
    db.select({ url: welfareSources.url, siteId: welfareSources.siteId, firstSeenAt: welfareSources.firstSeenAt, lastSeenAt: welfareSources.lastSeenAt })
      .from(welfareSources).where(eq(welfareSources.programId, id)),
    db.select().from(llmCalls).where(eq(llmCalls.programId, id)).orderBy(desc(llmCalls.id)).limit(50),
    db.select().from(adminAudit).where(and(eq(adminAudit.targetType, 'welfare'), eq(adminAudit.targetId, id))).orderBy(desc(adminAudit.id)).limit(50),
  ])
  const { embedding, ...rest } = p
  return {
    ...rest,
    hasEmbedding: embedding !== null,
    structuredAt: iso(p.structuredAt), reviewedAt: iso(p.reviewedAt), pinnedAt: iso(p.pinnedAt),
    createdAt: iso(p.createdAt)!, updatedAt: iso(p.updatedAt)!,
    attachments: attachments.map((a) => ({ name: a.name, url: a.url, text: a.text ?? '' })),
    sources: sources.map((s) => ({ ...s, firstSeenAt: iso(s.firstSeenAt)!, lastSeenAt: iso(s.lastSeenAt)! })),
    llmCalls: calls.map(callOut),
    history: history.map(auditOut),
  }
}

export type WelfarePatch = { statusOverride?: 'active' | 'rejected' | null; note?: string | null; pinned?: boolean }

/**
 * 人工修正：設定 statusOverride 會立刻改變狀態，之後的結構化也不會蓋掉。
 * 改為 active 但沒有 embedding（之前被判為非福利），或取消覆寫時，排入一次重新結構化（約 0.0024 美元）。
 */
export async function updateWelfare(db: Db, queue: Queue, admin: Admin, id: string, patch: WelfarePatch) {
  const [p] = await db.select().from(w).where(eq(w.id, id))
  if (!p) throw new ApiError(404, 'not_found', '找不到這個福利')
  if (p.status === 'removed') throw new ApiError(409, 'conflict', '已下架的福利不能修改')
  const set: Partial<typeof w.$inferInsert> = {}
  let requeue = false
  if (patch.statusOverride !== undefined) {
    set.statusOverride = patch.statusOverride
    set.reviewedBy = admin.id
    set.reviewedAt = new Date()
    if (patch.statusOverride === 'rejected') set.status = 'rejected'
    else if (patch.statusOverride === 'active') {
      const today = new Date().toISOString().slice(0, 10)
      set.status = p.deadline && p.deadline < today ? 'expired' : 'active'
      requeue = p.embedding === null
    } else requeue = true // 取消覆寫：交給結構化重新判斷
  }
  if (patch.note !== undefined) set.reviewNote = patch.note
  if (patch.pinned !== undefined) set.pinnedAt = patch.pinned ? new Date() : null
  if (!Object.keys(set).length) throw new ApiError(400, 'invalid_request', '沒有要修改的欄位')
  await db.update(w).set(set).where(eq(w.id, id))
  if (requeue) await queue.send('welfare-structure', { programId: id, force: true })
  await audit(db, admin, 'welfare.update', 'welfare', id, {
    before: { status: p.status, statusOverride: p.statusOverride, reviewNote: p.reviewNote, pinned: p.pinnedAt !== null },
    patch,
    requeued: requeue,
  })
  return getWelfare(db, id)
}

export async function restructure(db: Db, queue: Queue, admin: Admin, id: string) {
  const [p] = await db.select({ id: w.id, status: w.status }).from(w).where(eq(w.id, id))
  if (!p) throw new ApiError(404, 'not_found', '找不到這個福利')
  if (p.status === 'removed') throw new ApiError(409, 'conflict', '已下架的福利不能重新結構化')
  await queue.send('welfare-structure', { programId: id, force: true })
  await audit(db, admin, 'welfare.restructure', 'welfare', id)
}

// ---------------- LLM 用量 ----------------

const callOut = (c: typeof llmCalls.$inferSelect) => ({
  id: c.id, at: iso(c.createdAt)!, purpose: c.purpose, programId: c.programId, model: c.model, promptVersion: c.promptVersion,
  attempt: c.attempt, inputTokens: c.inputTokens, outputTokens: c.outputTokens, thoughtsTokens: c.thoughtsTokens,
  latencyMs: c.latencyMs, ok: c.ok, errorKind: c.errorKind, error: c.error, costUsd: c.costUsd,
})

export async function llmUsage(db: Db, days: number) {
  const since = sql`now() - make_interval(days => ${days})`
  const rows = await db.execute<Record<string, string>>(sql`
    select (created_at at time zone 'Asia/Taipei')::date::text as day, purpose, model,
           count(*) as calls, count(*) filter (where not ok) as errors,
           coalesce(sum(input_tokens), 0) as input, coalesce(sum(output_tokens), 0) as output,
           coalesce(sum(thoughts_tokens), 0) as thoughts, coalesce(sum(cost_usd), 0) as cost, round(avg(latency_ms)) as latency
    from llm_calls where created_at >= ${since} group by 1, 2, 3 order by 1 desc, 2, 3`)
  const errors = await db.execute<Record<string, string>>(sql`
    select error_kind, count(*) as n, max(created_at) as last, (array_agg(error order by id desc))[1] as sample
    from llm_calls where created_at >= ${since} and not ok group by 1 order by 2 desc`)
  const top = await db.execute<Record<string, string>>(sql`
    select c.program_id, p.name, p.city, count(*) as calls, coalesce(sum(c.cost_usd), 0) as cost
    from llm_calls c left join welfare_programs p on p.id = c.program_id
    where c.created_at >= ${since} and c.program_id is not null group by 1, 2, 3 order by 5 desc limit 20`)
  return {
    rows: rows.map((r) => ({
      day: r.day!, purpose: r.purpose!, model: r.model!, calls: num(r.calls), errors: num(r.errors), inputTokens: num(r.input),
      outputTokens: num(r.output), thoughtsTokens: num(r.thoughts), costUsd: num(r.cost), avgLatencyMs: num(r.latency),
    })),
    errors: errors.map((e) => ({ kind: e.error_kind ?? 'unknown', count: num(e.n), lastAt: iso(e.last)!, sample: (e.sample ?? '').slice(0, 300) })),
    topPrograms: top.map((t) => ({ programId: t.program_id!, name: t.name ?? '（已刪除）', city: t.city ?? '', calls: num(t.calls), costUsd: num(t.cost) })),
  }
}

// ---------------- 使用者（唯讀） ----------------

/** 列表只放辨識用的欄位；生日、身分等個資只在詳情中提供並寫入稽核紀錄 */
export async function listUsers(db: Db, f: { q?: string | undefined; page: number; limit: number }) {
  const where = f.q ? or(ilike(user.email, `%${f.q}%`), ilike(user.name, `%${f.q}%`), eq(user.id, f.q)) : undefined
  const { limit, offset } = page(f)
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, role: user.role, createdAt: user.createdAt,
        providers: sql<string[]>`coalesce((select array_agg(distinct a.provider_id) from account a where a.user_id = "user"."id"), '{}')`,
      })
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt), user.id)
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(user).where(where),
  ])
  return { data: rows.map((r) => ({ ...r, createdAt: iso(r.createdAt)! })), total: total!.n }
}

export async function getUser(db: Db, admin: Admin, id: string) {
  const [u] = await db.select().from(user).where(eq(user.id, id))
  if (!u) throw new ApiError(404, 'not_found', '找不到這個使用者')
  const [providers, fams, [fav], [sess]] = await Promise.all([
    db.select({ providerId: account.providerId, createdAt: account.createdAt }).from(account).where(eq(account.userId, id)),
    db
      .select({ id: families.id, name: families.name, role: familyMembers.role, joinedAt: familyMembers.joinedAt })
      .from(familyMembers)
      .innerJoin(families, eq(families.id, familyMembers.familyId))
      .where(eq(familyMembers.userId, id)),
    db.select({ n: count() }).from(favorites).where(eq(favorites.userId, id)),
    db.select({ n: count(), last: sql<string | null>`max(${session.updatedAt})` }).from(session)
      .where(and(eq(session.userId, id), sql`${session.expiresAt} > now()`)),
  ])
  const memberCounts = fams.length
    ? await db.select({ familyId: familyMembers.familyId, n: count() }).from(familyMembers)
        .where(inArray(familyMembers.familyId, fams.map((f) => f.id))).groupBy(familyMembers.familyId)
    : []
  await audit(db, admin, 'user.view', 'user', id)
  return {
    id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified, image: u.image, role: u.role,
    birthday: u.birthday, gender: u.gender, city: u.city, identities: u.identities, isSubscribed: u.isSubscribed,
    createdAt: iso(u.createdAt)!, updatedAt: iso(u.updatedAt)!,
    providers: providers.map((p) => ({ providerId: p.providerId, linkedAt: iso(p.createdAt)! })),
    families: fams.map((f) => ({ id: f.id, name: f.name, role: f.role, joinedAt: iso(f.joinedAt)!, memberCount: memberCounts.find((m) => m.familyId === f.id)?.n ?? 0 })),
    favorites: fav!.n,
    activeSessions: sess!.n,
    lastActiveAt: iso(sess!.last),
  }
}

// ---------------- 稽核紀錄 ----------------

const auditOut = (a: typeof adminAudit.$inferSelect) => ({
  id: a.id, at: iso(a.at)!, adminId: a.adminId, adminEmail: a.adminEmail, action: a.action, targetType: a.targetType,
  targetId: a.targetId, detail: a.detail, ip: a.ip,
})

export async function listAudit(db: Db, f: { targetType?: string | undefined; targetId?: string | undefined; page: number; limit: number }) {
  const conds: SQL[] = []
  if (f.targetType) conds.push(eq(adminAudit.targetType, f.targetType))
  if (f.targetId) conds.push(eq(adminAudit.targetId, f.targetId))
  const where = conds.length ? and(...conds) : undefined
  const { limit, offset } = page(f)
  const [rows, [total]] = await Promise.all([
    db.select().from(adminAudit).where(where).orderBy(desc(adminAudit.id)).limit(limit).offset(offset),
    db.select({ n: count() }).from(adminAudit).where(where),
  ])
  return { data: rows.map(auditOut), total: total!.n }
}
