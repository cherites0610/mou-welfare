// 阿哞聊天（取代 v1 的 stores/chat.ts）。API：apps/api/src/features/chat/routes.ts（docs/backend.md §8.9）
// 送訊息是 POST 回 SSE，EventSource 只能 GET，所以用 fetch 讀串流自己解析。
import type { WelfareSummary } from '~/utils/welfare'

export type ChatSource = WelfareSummary & { requirements: string[]; rewards: string[] }
export type ChatSession = { id: string; title: string; familyId: string | null; createdAt: string; updatedAt: string }
export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources: ChatSource[]
  /** fallback＝LLM 不可用時的固定格式；串流中為 null */
  mode: 'llm' | 'fallback' | null
  /** 正在串流（還沒收到 done） */
  streaming?: boolean
  error?: boolean
}

export function useChat() {
  const { public: cfg } = useRuntimeConfig()
  const api = useApi()
  const sessions = useState<ChatSession[]>('chat-sessions', () => [])
  const currentId = useState<string | null>('chat-current', () => null)
  const messages = useState<ChatMessage[]>('chat-messages', () => [])
  const quota = useState<{ limit: number; used: number } | null>('chat-quota', () => null)
  const sending = useState('chat-sending', () => false)
  const loading = ref(false)

  const loadSessions = async () => {
    loading.value = true
    try {
      const res = await api<{ data: ChatSession[]; meta: { quota: { limit: number; used: number } } }>('/v1/chat/sessions')
      sessions.value = res.data
      quota.value = res.meta.quota
    } finally {
      loading.value = false
    }
  }

  const open = async (id: string) => {
    loading.value = true
    try {
      const res = await api<{ data: ChatSession & { messages: ChatMessage[] } }>(`/v1/chat/sessions/${id}`)
      currentId.value = id
      messages.value = res.data.messages
    } finally {
      loading.value = false
    }
  }

  const reset = () => {
    currentId.value = null
    messages.value = []
  }

  const remove = async (id: string) => {
    await api(`/v1/chat/sessions/${id}`, { method: 'DELETE' })
    if (currentId.value === id) reset()
    sessions.value = sessions.value.filter((s) => s.id !== id)
  }

  /** 送出訊息；第一則才建立對話。錯誤訊息直接顯示在助理的泡泡裡 */
  const send = async (content: string, opts: { familyId: string | null; useProfile: boolean }) => {
    if (sending.value) return
    sending.value = true
    messages.value.push({ id: `tmp-user-${Date.now()}`, role: 'user', content, sources: [], mode: null })
    messages.value.push({ id: `tmp-assistant-${Date.now()}`, role: 'assistant', content: '', sources: [], mode: null, streaming: true })
    // 取 reactive 的那一個，之後直接改它
    const reply = messages.value[messages.value.length - 1]!
    try {
      if (!currentId.value) {
        currentId.value = (await api<{ data: ChatSession }>('/v1/chat/sessions', { method: 'POST' })).data.id
      }
      const res = await fetch(`${cfg.apiBase}/v1/chat/sessions/${currentId.value}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, familyId: opts.familyId, useProfile: opts.useProfile }),
      })
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message || `請求失敗（${res.status}）`)
      }
      if (quota.value) quota.value.used++
      await readSSE(res.body, (event, data) => {
        if (event === 'sources') reply.sources = data.sources
        else if (event === 'delta') reply.content += data.text
        else if (event === 'done') {
          reply.id = data.messageId
          reply.content = data.content
          reply.mode = data.mode
        } else if (event === 'error') throw new Error(data.message)
      })
    } catch (e) {
      reply.content = e instanceof Error ? e.message : '訊息送出失敗，請稍後再試'
      reply.error = true
    } finally {
      reply.streaming = false
      sending.value = false
      void loadSessions().catch(() => {})
    }
  }

  return { sessions, currentId, messages, quota, sending, loading, loadSessions, open, reset, remove, send }
}

/** data 的形狀依事件不同（sources / delta / done / error） */
async function readSSE(body: ReadableStream<Uint8Array>, on: (event: string, data: any) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i)
      buf = buf.slice(i + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (data.length) on(event, JSON.parse(data.join('\n')))
    }
  }
}
