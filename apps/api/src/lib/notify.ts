// 系統通知（寄到 ALERT_EMAIL；未設定時只記 log）與去重。docs/backend.md §8.4.2
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { alertState } from '../db/schema/index.ts'
import type { Mailer } from './mail/index.ts'

export type Notify = (subject: string, text: string) => Promise<void>

export function createNotify(mailer: Mailer | undefined, to: string | undefined): Notify {
  return async (subject, text) => {
    if (!mailer || !to) {
      console.warn(`[notify] ${subject}`)
      return
    }
    await mailer.send({ to, subject, text, html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>` })
  }
}

/**
 * 同一個狀況只通知一次：key 相同且 value 沒變時，距離上次超過 repeatMs 才再寄（repeatMs 未給＝不重寄）。
 * 回傳是否有寄出。寄信失敗只記 log，不影響呼叫端。
 */
export async function notifyOnce(db: Db, notify: Notify, key: string, value: string, subject: string, text: string, repeatMs?: number) {
  const [prev] = await db.select().from(alertState).where(eq(alertState.key, key))
  if (prev && prev.value === value && (repeatMs === undefined || Date.now() - prev.sentAt.getTime() < repeatMs)) return false
  try {
    await notify(subject, text)
  } catch (e) {
    console.error('[notify] failed', e)
    return false
  }
  await db
    .insert(alertState)
    .values({ key, value, sentAt: new Date() })
    .onConflictDoUpdate({ target: alertState.key, set: { value, sentAt: new Date() } })
  return true
}

/** 狀況解除時清掉，下次再發生會重新通知 */
export async function clearAlert(db: Db, key: string) {
  await db.delete(alertState).where(eq(alertState.key, key))
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
