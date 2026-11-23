// 福利正文（爬蟲抽出的 Markdown）→ HTML。
// 正文來自外部政府網站：關閉原始 HTML（html: false 會把 <script> 等跳脫成文字），避免 XSS。
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

// 外部連結另開分頁
const defaultLinkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

export function renderMarkdown(src: string): string {
  return md.render(src)
}

const CITATION = /\[\[([0-9a-f-]{36})\]\]/g
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * 阿哞的回答：Markdown 加上引用。[[福利 id]] 換成編號小標（對應下方福利卡的編號，data-welfare-id 由元件攔截點擊、站內換頁）；
 * 不在這則回答福利卡裡的 id 直接移除。API 已經過濾過，這裡再擋一次。
 */
export function renderChat(src: string, sources: { id: string; name: string }[]): string {
  const index = new Map(sources.map((s, i) => [s.id, i]))
  // 先換成 Markdown 不會處理的記號，render 後再換成連結（render 前插 HTML 會被 html: false 跳脫）
  const marked = src.replace(CITATION, (_m, id: string) => (index.has(id) ? `⟦${id}⟧` : ''))
  return md.render(marked).replace(/⟦([0-9a-f-]{36})⟧/g, (_m, id: string) => {
    const i = index.get(id)!
    return `<a href="/welfares/${id}" data-welfare-id="${id}" class="chat-cite" title="${escapeHtml(sources[i]!.name)}">${i + 1}</a>`
  })
}
