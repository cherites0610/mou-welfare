// 精選福利同步（src/curated）：API 啟動時寫進資料庫。
// 走和爬蟲相同的 ingest（內容沒變不重新結構化）；人工判定為福利（不讓 LLM 判成雜訊），精選的置頂。
import { createHash } from 'node:crypto'
import { and, eq, isNull, like, ne, notInArray } from 'drizzle-orm'
import { CURATED, type CuratedProgram } from '../curated/index.ts'
import type { Db } from '../db/client.ts'
import { welfarePrograms as w } from '../db/schema/index.ts'
import { ingest } from '../features/ingest/service.ts'
import type { Queue } from '../lib/queue.ts'

const PREFIX = 'curated:'

export async function syncCurated(db: Db, queue: Queue, programs: CuratedProgram[] = CURATED): Promise<void> {
  const keys = programs.map((p) => PREFIX + p.slug)
  const now = Date.now()
  for (const [i, p] of programs.entries()) {
    const { id } = await ingest(db, queue, {
      source: { site_id: 'curated', city: p.city, url: p.sourceUrl, kind: 'curated' },
      program_key: PREFIX + p.slug,
      title: p.title,
      published_at: p.publishedAt,
      content_md: p.contentMd,
      attachments: [],
      structured: p.deadline ? { deadline: p.deadline } : {},
      classification: { type: 'program', confidence: 1 },
      content_hash: `sha256:${createHash('sha256').update(`${p.title}\n${p.sourceUrl}\n${p.deadline ?? ''}\n${p.contentMd}`).digest('hex')}`,
    })
    await db.update(w).set({ statusOverride: 'active', reviewNote: '精選福利（src/curated）' }).where(eq(w.id, id))
    // 置頂時間只在第一次設定（越晚越前面；清單前面的時間較晚），重啟不改變順序
    if (p.featured) await db.update(w).set({ pinnedAt: new Date(now - i * 1000) }).where(and(eq(w.id, id), isNull(w.pinnedAt)))
    else await db.update(w).set({ pinnedAt: null }).where(eq(w.id, id))
  }
  // 從清單移除的：下架
  await db
    .update(w)
    .set({ status: 'removed', pinnedAt: null })
    .where(and(like(w.programKey, `${PREFIX}%`), keys.length ? notInArray(w.programKey, keys) : undefined, ne(w.status, 'removed')))
}
