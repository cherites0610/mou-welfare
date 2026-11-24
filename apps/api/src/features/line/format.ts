// LINE Bot 的訊息格式（docs/backend.md §8.7）：回答轉成純文字、福利卡片（Flex carousel）、登入引導。
// LINE 不顯示 Markdown，引用 [[福利 id]] 換成和卡片相同的編號。
import type { LineMessage } from '../../lib/line.ts'
import type { Source } from '../chat/retrieve.ts'

/** LINE 文字訊息上限 5,000 字 */
const MAX_TEXT = 4_900
const SUMMARY_CHARS = 80
const BRAND = '#5A8700' // 網站的 mygreen-300（按鈕上的白字要夠清楚）

const LIGHT = {
  GREEN: { label: '可能符合', color: '#73AA00' },
  YELLOW: { label: '資料不足', color: '#C9A800' },
  RED: { label: '可能不符合', color: '#D06262' },
} as const

const clip = (s: string, n: number) => ([...s].length > n ? `${[...s].slice(0, n - 1).join('')}…` : s)

/** 回答的 Markdown 轉成 LINE 的純文字；[[福利 id]] 換成卡片編號 [n]，清單外的拿掉 */
export function toLineText(content: string, sources: Source[]): string {
  const index = new Map(sources.map((s, i) => [s.id, i + 1]))
  const text = content
    .replace(/\[\[([0-9a-f-]{36})\]\]/g, (_, id: string) => (index.has(id) ? `[${index.get(id)}]` : ''))
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 $2') // [文字](網址)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[ \t]*[-*][ \t]+/gm, '・')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return clip(text, MAX_TEXT)
}

export const text = (t: string): LineMessage => ({ type: 'text', text: clip(t, MAX_TEXT) })

function bubble(s: Source, n: number, webBase: string): Record<string, unknown> {
  const light = s.match ? LIGHT[s.match.light] : null
  const meta = [s.city, s.deadline ? `截止 ${s.deadline}` : ''].filter(Boolean).join(' · ')
  const body: Record<string, unknown>[] = [
    { type: 'text', text: `${n}. ${clip(s.name, 60)}`, weight: 'bold', size: 'md', wrap: true },
    { type: 'text', text: meta, size: 'xs', color: '#888888', wrap: true },
  ]
  if (light) body.push({ type: 'text', text: `● ${light.label}`, size: 'sm', color: light.color, weight: 'bold' })
  if (s.summary.trim()) body.push({ type: 'text', text: clip(s.summary.trim(), SUMMARY_CHARS), size: 'sm', color: '#555555', wrap: true })
  return {
    type: 'bubble',
    size: 'kilo',
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'button', style: 'primary', color: BRAND, height: 'sm', action: { type: 'uri', label: '查看詳情', uri: `${webBase}/welfares/${s.id}` } },
      ],
    },
  }
}

/** 福利卡片；編號和回答裡的 [n] 一致 */
export function carousel(sources: Source[], webBase: string): LineMessage | null {
  if (!sources.length) return null
  return {
    type: 'flex',
    altText: `找到 ${sources.length} 筆福利：${sources.map((s) => s.name).join('、')}`.slice(0, 390),
    contents: { type: 'carousel', contents: sources.map((s, i) => bubble(s, i + 1, webBase)) },
  }
}

/** 登入引導：用 LIFF 開啟網站，登入後 LINE Bot 就認得這個人（同一個 LINE 帳號） */
export function loginPrompt(liffId: string | undefined, webBase: string): LineMessage {
  const uri = liffId ? `https://liff.line.me/${liffId}` : `${webBase}/login`
  return {
    type: 'flex',
    altText: '登入哞福利，阿哞就能依你的條件回答',
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: '登入後回答更準', weight: 'bold', size: 'md' },
          {
            type: 'text',
            text: '用 LINE 登入哞福利、填好年齡和身分，阿哞就能幫你看符不符合資格，也能接著追問。',
            size: 'sm',
            color: '#555555',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'button', style: 'primary', color: BRAND, height: 'sm', action: { type: 'uri', label: '用 LINE 登入', uri } }],
      },
    },
  }
}
