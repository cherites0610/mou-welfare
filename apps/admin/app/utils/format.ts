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
