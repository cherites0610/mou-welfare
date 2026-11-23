// 顯示格式：時間一律用台北時間。
export const STATUS_LABEL: Record<string, string> = {
  active: '可搜尋', rejected: '非福利', expired: '已截止', pending: '待結構化', removed: '已下架',
}
export const STATUS_TYPE: Record<string, 'success' | 'danger' | 'info' | 'warning'> = {
  active: 'success', rejected: 'danger', expired: 'info', pending: 'warning', removed: 'info',
}
export const ACTION_LABEL: Record<string, string> = {
  'welfare.update': '修改福利', 'welfare.restructure': '重新結構化', 'user.view': '查看使用者',
}
export const PURPOSE_LABEL: Record<string, string> = { structure: '結構化', embed: 'Embedding', probe: '額度探測', chat: '聊天' }

const dtf = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})
export const fmtTime = (v: string | null | undefined) => (v ? dtf.format(new Date(v)) : '—')
export const fmtNum = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('en-US'))
export const fmtUsd = (v: number | null | undefined, digits = 4) => (v === null || v === undefined ? '—' : `$${v.toFixed(digits)}`)
export const fmtTokens = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v))

// 爬蟲（docs/admin.md §4.6）
export const RUN_STATUS_LABEL: Record<string, string> = { running: '執行中', ok: '正常', warning: '有異常', interrupted: '中斷' }
export const RUN_STATUS_TYPE: Record<string, 'success' | 'danger' | 'info' | 'warning' | 'primary'> = {
  running: 'primary', ok: 'success', warning: 'warning', interrupted: 'danger',
}
export const HEALTH_LABEL: Record<string, string> = { ok: '正常', degraded: '數量異常', blocked: '無法連線', failed: '程式錯誤' }
export const HEALTH_TYPE: Record<string, 'success' | 'danger' | 'warning'> = { ok: 'success', degraded: 'warning', blocked: 'danger', failed: 'danger' }
export const TRIGGER_LABEL: Record<string, string> = { schedule: '排程', manual: '手動' }
/** 兩個時間的間隔，例如「1 小時 25 分」 */
export const fmtDuration = (from: string | null | undefined, to: string | null | undefined) => {
  if (!from || !to) return '—'
  const m = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000))
  return m >= 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m} 分`
}
