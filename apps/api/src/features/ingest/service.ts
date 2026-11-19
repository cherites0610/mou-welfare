// 爬蟲推送（docs/scraper.md §7）：以 program_key upsert；內容沒變不重新結構化。
import type { IngestItem, IngestRemove } from '@mou-welfare/shared'
import { and, eq, inArray, notExists, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { ingestLog, welfareAttachments, welfarePrograms as w, welfareSources } from '../../db/schema/index.ts'
import type { Queue } from '../../lib/queue.ts'

export type IngestAction = 'created' | 'updated' | 'unchanged'

/** Postgres 的 text 不能存 NUL；爬蟲端也會過濾，這裡再擋一次，避免單筆資料讓整個請求 500 */
const clean = (s: string) => s.replaceAll('\u0000', '')

export async function ingest(db: Db, queue: Queue, item: IngestItem): Promise<{ id: string; action: IngestAction }> {
  const url = item.source.url
  const fields = {
    city: item.source.city,
    siteId: item.source.site_id,
    sourceUrl: url,
    sourceKind: item.source.kind,
    contentMd: clean(item.content_md),
    contentHash: item.content_hash,
    sourceFields: item.structured,
    publishedAt: item.published_at,
  }

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: w.id, contentHash: w.contentHash, status: w.status })
      .from(w)
      .where(eq(w.programKey, item.program_key))
      .for('update')

    let id: string
    let action: IngestAction
    if (!existing) {
      const [row] = await tx
        .insert(w)
        .values({ programKey: item.program_key, name: clean(item.title), status: 'pending', ...fields })
        .returning({ id: w.id })
      id = row!.id
      action = 'created'
    } else if (existing.contentHash === item.content_hash && existing.status !== 'removed') {
      id = existing.id
      action = 'unchanged'
    } else {
      id = existing.id
      action = 'updated'
      // 下架後又出現：回到待結構化；其他狀態維持原樣，舊的結構化結果在新結果出來前繼續顯示
      await tx
        .update(w)
        .set({ ...fields, ...(existing.status === 'removed' ? { status: 'pending' as const } : {}) })
        .where(eq(w.id, id))
    }

    if (action !== 'unchanged') {
      await tx.delete(welfareAttachments).where(eq(welfareAttachments.programId, id))
      if (item.attachments.length) {
        await tx
          .insert(welfareAttachments)
          .values(item.attachments.map((a) => ({ programId: id, name: clean(a.name), url: a.url, text: clean(a.text) })))
      }
    }
    // 來源網址可能從別的福利移過來（標題改了 → program_key 不同），以最新的推送為準
    await tx
      .insert(welfareSources)
      .values({ url, programId: id, siteId: item.source.site_id, contentHash: item.content_hash })
      .onConflictDoUpdate({
        target: welfareSources.url,
        set: { programId: id, contentHash: item.content_hash, lastSeenAt: sql`now()` },
      })
    await tx.insert(ingestLog).values({ programKey: item.program_key, sourceUrl: url, action, contentHash: item.content_hash })
    return { id, action }
  })

  if (result.action !== 'unchanged') await queue.send('welfare-structure', { programId: result.id })
  return result
}

export async function remove(db: Db, req: IngestRemove): Promise<{ removedSources: number; removedPrograms: number }> {
  return db.transaction(async (tx) => {
    const gone = await tx
      .delete(welfareSources)
      .where(and(eq(welfareSources.siteId, req.site_id), inArray(welfareSources.url, req.urls)))
      .returning({ url: welfareSources.url, programId: welfareSources.programId })
    if (!gone.length) return { removedSources: 0, removedPrograms: 0 }

    // 只有「所有來源網址都下架」的福利才標為 removed
    const ids = [...new Set(gone.map((g) => g.programId))]
    const removed = await tx
      .update(w)
      .set({ status: 'removed' })
      .where(
        and(
          inArray(w.id, ids),
          notExists(tx.select({ one: sql`1` }).from(welfareSources).where(eq(welfareSources.programId, w.id))),
        ),
      )
      .returning({ id: w.id, programKey: w.programKey })
    const keyOf = new Map(removed.map((r) => [r.id, r.programKey]))
    await tx.insert(ingestLog).values(
      gone.map((g) => ({ programKey: keyOf.get(g.programId) ?? null, sourceUrl: g.url, action: 'removed' as const })),
    )
    return { removedSources: gone.length, removedPrograms: removed.length }
  })
}
