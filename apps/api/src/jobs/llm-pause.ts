// LLM 額度不足時暫停結構化、定期探測、恢復後自動補做（docs/backend.md §8.4.1）。
// 暫停狀態存在 llm_pause 表：重啟後仍維持暫停，/health 也讀得到。
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { llmPause } from '../db/schema/index.ts'

export const STRUCTURE_PAUSE = 'welfare-structure'
/** 暫停中每隔多久探測一次。探測只送幾個 token，費用可以忽略 */
export const PROBE_MS = 10 * 60_000

export class LLMPause {
  private paused = false

  constructor(
    private readonly db: Db,
    private readonly opts: {
      /** 送一個極小的請求；丟出錯誤代表仍不可用 */
      probe: () => Promise<unknown>
      /** 恢復後重新開始處理佇列並補送工作 */
      onResume: () => Promise<void>
      notify: (subject: string, text: string) => Promise<void>
      name?: string
    },
  ) {}

  private get name() {
    return this.opts.name ?? STRUCTURE_PAUSE
  }

  get isPaused() {
    return this.paused
  }

  /** 從資料庫讀回暫停狀態（啟動時呼叫） */
  async load(): Promise<boolean> {
    const [row] = await this.db.select().from(llmPause).where(eq(llmPause.name, this.name))
    this.paused = !!row
    return this.paused
  }

  /** 進入暫停；已經暫停時回傳 false（避免重複通知） */
  async pause(reason: string): Promise<boolean> {
    if (this.paused) return false
    this.paused = true
    const rows = await this.db
      .insert(llmPause)
      .values({ name: this.name, reason: reason.slice(0, 500) })
      .onConflictDoNothing()
      .returning({ name: llmPause.name })
    if (!rows.length) return false
    console.warn(`[llm] paused ${this.name}: ${reason.slice(0, 200)}`)
    await this.safeNotify(
      '【哞福利】Gemini 額度不足，福利結構化已暫停',
      `福利結構化呼叫 Gemini 時回報額度不足或超過限制，已自動暫停。\n\n錯誤：${reason.slice(0, 300)}\n\n` +
        `儲值或調整用量上限後不需要任何操作：系統每 ${PROBE_MS / 60_000} 分鐘會自動檢查一次，恢復後接著處理尚未完成的福利。`,
    )
    return true
  }

  /** 暫停中才探測；成功就恢復並回傳 true */
  async probe(): Promise<boolean> {
    if (!this.paused) return false
    try {
      await this.opts.probe()
    } catch {
      await this.db.update(llmPause).set({ probedAt: sql`now()` }).where(eq(llmPause.name, this.name))
      return false
    }
    await this.db.delete(llmPause).where(eq(llmPause.name, this.name))
    this.paused = false
    console.log(`[llm] resumed ${this.name}`)
    await this.opts.onResume()
    await this.safeNotify('【哞福利】Gemini 已恢復，福利結構化繼續進行', '探測請求成功，已恢復處理並重新排入尚未完成的福利。')
    return true
  }

  private async safeNotify(subject: string, text: string) {
    await this.opts.notify(subject, text).catch((e) => console.error('[llm] notify failed', e))
  }
}
