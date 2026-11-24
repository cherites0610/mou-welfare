// welfare-structure：結構化 → embedding → 寫回（docs/backend.md §8.4）。
// 工作內容只有 programId；重複執行是安全的（hash 沒變就略過），所以不需要佇列層級的去重。
import { and, eq, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { welfareAttachments, welfarePrograms as w } from '../db/schema/index.ts'
import { LLMStructurer, RuleStructurer, type Structurer } from '../features/welfare/structure.ts'
import type { Env } from '../env.ts'
import { GeminiLLM, type LLM, type UsageRecorder } from '../lib/llm/index.ts'
import type { Queue } from '../lib/queue.ts'

export type StructureOutcome = 'done' | 'skipped' | 'missing'

export function createStructurer(env: Env, recorder?: UsageRecorder): { structurer: Structurer; llm: LLM | null } {
  const driver = env.LLM_DRIVER ?? (env.GEMINI_API_KEY ? 'gemini' : 'rules')
  if (driver === 'gemini') {
    const llm = new GeminiLLM(env.GEMINI_API_KEY!, env.GEMINI_MODEL, env.GEMINI_EMBED_MODEL, undefined, recorder)
    return { structurer: new LLMStructurer(llm), llm }
  }
  return { structurer: new RuleStructurer(), llm: null }
}

/** 用來做 embedding 的文字：名稱、摘要、資格、補助內容 */
export function embeddingText(p: { name: string; city: string; summary: string; requirements: string[]; rewards: string[] }) {
  return [`${p.city} ${p.name}`, p.summary, ...p.requirements, ...p.rewards].join('\n')
}

export async function structureProgram(
  db: Db,
  structurer: Structurer,
  llm: LLM | null,
  programId: string,
  today: string = new Date().toISOString().slice(0, 10),
  /** 改 prompt 或換模型後手動重做（scripts/restructure.ts）：內容沒變也重做，但只限 LLM，規則不能覆蓋 LLM 的結果 */
  opts: { force?: boolean } = {},
): Promise<StructureOutcome> {
  const [p] = await db.select().from(w).where(eq(w.id, programId))
  if (!p) return 'missing'
  if (p.status === 'removed') return 'skipped'
  const force = opts.force && structurer.kind === 'llm'
  // 內容沒變就不重做；改回規則時也不覆蓋 LLM 已經做好的結果（2026-11-22 Gemini 額度用完、改回 rules 時發生過）
  if (!force && p.structuredHash === p.contentHash && (p.structuredBy === structurer.kind || p.structuredBy === 'llm')) {
    return 'skipped'
  }

  const attachments = await db
    .select({ name: welfareAttachments.name, text: welfareAttachments.text })
    .from(welfareAttachments)
    .where(eq(welfareAttachments.programId, programId))

  let r: Awaited<ReturnType<Structurer['structure']>>
  let embedding: number[] | null = null
  try {
    r = await structurer.structure({
      programId,
      title: p.name,
      city: p.city,
      contentMd: p.contentMd,
      attachments,
      sourceFields: p.sourceFields,
    })
    // 人工判為福利的也要有 embedding，才搜尋得到
    if (llm && (p.statusOverride ? p.statusOverride === 'active' : r.isIndividualWelfare)) {
      embedding = (await llm.embed([embeddingText({ ...r, city: p.city })], { purpose: 'embed', programId }))[0] ?? null
    }
  } catch (e) {
    await db
      .update(w)
      .set({ structureError: String(e instanceof Error ? e.message : e).slice(0, 500) })
      .where(eq(w.id, programId))
    throw e // 交給 pg-boss 重試
  }

  // 人工判定優先（docs/admin.md）：判為 rejected 就維持 rejected；判為 active 時仍依截止日變 expired
  // 精選福利（src/curated）的截止日是人工寫的，不用結構化的結果
  const curatedDeadline = p.sourceKind === 'curated' ? p.sourceFields.deadline : undefined
  const deadline = typeof curatedDeadline === 'string' ? curatedDeadline : r.deadline
  const individual = p.statusOverride ? p.statusOverride === 'active' : r.isIndividualWelfare
  const status = !individual ? 'rejected' : deadline && deadline < today ? 'expired' : 'active'
  // 只在內容沒有再被更新的情況下寫回；被更新的話，新的工作會處理
  const updated = await db
    .update(w)
    .set({
      name: r.name,
      summary: r.summary,
      categories: r.categories,
      identities: r.identities,
      requirements: r.requirements,
      rewards: r.rewards,
      deadline,
      embedding,
      status,
      structuredHash: p.contentHash,
      structuredBy: r.by,
      structuredAt: new Date(),
      structuredModel: r.model ?? null,
      structuredPromptVersion: r.promptVersion ?? null,
      structureError: null,
    })
    .where(and(eq(w.id, programId), p.contentHash ? eq(w.contentHash, p.contentHash) : isNull(w.contentHash)))
    .returning({ id: w.id })
  return updated.length ? 'done' : 'skipped'
}

/** 佇列裡已經有等待、重試或執行中的工作的福利（pg-boss 還沒建立時回傳空集合） */
export async function alreadyQueued(db: Db): Promise<Set<string>> {
  const [exists] = await db.execute<{ ok: boolean }>(sql`select to_regclass('pgboss.job') is not null as ok`)
  if (!exists?.ok) return new Set()
  const rows = await db.execute<{ id: string }>(
    sql`select distinct data->>'programId' as id from pgboss.job
        where name = 'welfare-structure' and state in ('created', 'retry', 'active')`,
  )
  return new Set(rows.map((r) => r.id))
}

/**
 * 啟動時補送工作：內容和結構化結果不一致的（工作遺失），以及改用 LLM 後、之前由規則結構化的。
 * 一次最多送 limit 筆，其餘下次啟動再補。
 */
export async function backfill(db: Db, queue: Queue, structurer: Structurer, limit = 1000): Promise<number> {
  const stale = or(
    isNull(w.structuredHash),
    ne(w.structuredHash, w.contentHash),
    structurer.kind === 'llm' ? eq(w.structuredBy, 'rules') : sql`false`,
  )
  const rows = await db
    .select({ id: w.id })
    .from(w)
    .where(and(notInArray(w.status, ['removed']), stale))
    .orderBy(w.updatedAt)
    .limit(limit)
  // 每次重啟都會執行；已經在佇列裡的不重複送（2026-11-22 曾因多次重啟累積約 2,200 個重複工作）
  const queued = await alreadyQueued(db)
  const todo = rows.filter((r) => !queued.has(r.id))
  for (const r of todo) await queue.send('welfare-structure', { programId: r.id })
  return todo.length
}
