<!-- 阿哞聊天：沿用 v1 web/src/components/Chat/ChatBoard.vue（手機 /chat 全頁、桌機福利列表右下浮動視窗）。docs/backend.md §8.9 -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import type { ChatMessage, ChatSource } from '~/composables/useChat'

const props = defineProps<{ isMobile?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const { sessions, currentId, messages, quota, sending, loading, loadSessions, open, reset, remove, send } = useChat()
const { families, load: loadFamilies } = useFamilies()

const input = ref('')
const useProfile = ref(true)
const familyId = ref<string | null>(null)
const showFamilyPanel = ref(false)
const showSessionPanel = ref(false)
const container = ref<HTMLElement | null>(null)

const remaining = computed(() => (quota.value ? Math.max(0, quota.value.limit - quota.value.used) : null))
const SUGGESTIONS = ['育兒津貼', '身障租屋補助', '老人假牙補助', '急難救助']

const scrollToBottom = async () => {
  await nextTick()
  container.value?.scrollTo({ top: container.value.scrollHeight, behavior: 'smooth' })
}
watch(messages, scrollToBottom, { deep: true })

onMounted(async () => {
  await Promise.all([
    loadSessions().catch(() => {}),
    loadFamilies().catch(() => {}),
    currentId.value ? open(currentId.value).catch(() => reset()) : Promise.resolve(),
  ])
  scrollToBottom()
})

const submit = async (text = input.value) => {
  const content = text.trim()
  if (!content || sending.value) return
  if (remaining.value === 0) {
    ElMessage.warning('今天的次數已經用完了，明天再來問阿哞吧！')
    return
  }
  input.value = ''
  await send(content, { familyId: familyId.value, useProfile: useProfile.value })
}

const onKeydown = (e: KeyboardEvent) => {
  // 輸入法選字時的 Enter 不送出
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

const toggleSessionPanel = async () => {
  showSessionPanel.value = !showSessionPanel.value
  if (showSessionPanel.value) await loadSessions().catch(() => {})
}
const switchSession = async (id: string) => {
  showSessionPanel.value = false
  await open(id).catch((e: Error) => ElMessage.error(e.message))
}
const removeSession = async (id: string) => {
  await remove(id).catch((e: Error) => ElMessage.error(e.message))
}

const html = (m: ChatMessage) => renderChat(m.content, m.sources)

const goWelfare = (id: string) => {
  router.push({ path: `/welfares/${id}`, query: familyId.value ? { familyId: familyId.value } : {} })
}
// 回答裡的引用連結：攔截點擊改成站內換頁
const onContentClick = (e: MouseEvent) => {
  const a = (e.target as HTMLElement).closest('a[data-welfare-id]')
  if (!a) return
  e.preventDefault()
  goWelfare(a.getAttribute('data-welfare-id')!)
}

const LIGHT = {
  GREEN: { dot: 'bg-mygreen', border: 'border-mygreen/50', label: '可能符合' },
  YELLOW: { dot: 'bg-myyellow', border: 'border-yellow-300', label: '資料不足' },
  RED: { dot: 'bg-myred', border: 'border-gray-200', label: '可能不符合' },
} as const
const light = (s: ChatSource) => (s.match ? LIGHT[s.match.light] : null)
</script>

<template>
  <!-- 大小由外層決定（/chat 頁或浮動視窗） -->
  <div class="relative flex flex-col bg-white overflow-hidden h-full w-full">
    <!-- 標題列 -->
    <div class="bg-mygreen px-4 py-3 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <img src="/fv.png" class="w-8 h-8 object-contain bg-white rounded-full p-0.5" alt="" />
        <div>
          <h3 class="font-bold text-white">阿哞 AI 助理</h3>
          <p class="text-xs text-white/90">{{ sending ? '阿哞思考中…' : remaining !== null ? `今天還可以問 ${remaining} 則` : '在線中' }}</p>
        </div>
      </div>
      <button v-if="!isMobile" class="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-1" aria-label="關閉" @click="emit('close')">
        <Icon icon="mingcute:down-line" class="text-2xl" />
      </button>
    </div>

    <!-- 訊息 -->
    <div ref="container" class="flex-1 overflow-y-auto bg-gray-50">
      <div class="p-4 space-y-5">
        <div v-if="!messages.length && !loading" class="flex flex-col items-center justify-center text-gray-500 gap-4 py-16">
          <img src="/meta.png" class="w-20 h-20 object-contain opacity-60" alt="" />
          <p class="text-sm text-center">嗨！我是阿哞，有什麼福利問題都可以問我喔！</p>
          <div class="flex flex-wrap justify-center gap-2">
            <button v-for="s in SUGGESTIONS" :key="s" type="button"
              class="text-xs bg-white border border-gray-200 px-3 py-1 rounded-full hover:text-mygreen-300 hover:border-mygreen"
              @click="submit(s)">{{ s }}</button>
          </div>
          <p class="text-xs text-gray-400 text-center px-6">阿哞只根據網站收錄的公告回答，資格與金額請以原公告為準。</p>
        </div>
        <div v-if="loading && !messages.length" class="flex justify-center py-16">
          <Icon icon="line-md:loading-loop" class="text-2xl text-gray-400" />
        </div>

        <div v-for="m in messages" :key="m.id" class="flex gap-2" :class="m.role === 'user' ? 'flex-row-reverse' : ''">
          <img v-if="m.role === 'assistant'" src="/logo.png" class="w-8 h-8 rounded-full bg-white border border-gray-200 p-0.5 object-contain shrink-0 mt-1" alt="" />
          <div class="max-w-[85%] min-w-0 space-y-2">
            <div v-if="m.role === 'user'" class="px-4 py-2.5 rounded-2xl rounded-tr-none text-[15px] leading-relaxed whitespace-pre-wrap break-words bg-mygreen text-white">{{ m.content }}</div>
            <template v-else>
              <div v-if="m.streaming && !m.content" class="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-1">
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
              <div v-else class="chat-md px-4 py-2.5 rounded-2xl rounded-tl-none text-[15px] leading-relaxed break-words border"
                :class="m.error ? 'bg-red-50 border-red-100 text-red-600' : 'bg-white border-gray-100 text-gray-800'"
                @click="onContentClick" v-html="html(m)" />
              <p v-if="m.mode === 'fallback'" class="text-[11px] text-gray-400 ml-1">AI 暫時無法回覆，以上依條件直接列出</p>

              <div v-if="m.sources.length" class="space-y-1.5">
                <p class="text-xs text-gray-400 font-bold ml-1 flex items-center gap-1"><Icon icon="mingcute:book-2-line" />找到的福利</p>
                <button v-for="(s, i) in m.sources" :key="s.id" type="button"
                  class="block w-full bg-white p-2.5 rounded-xl border hover:shadow-md transition text-left"
                  :class="light(s)?.border ?? 'border-gray-200'" @click="goWelfare(s.id)">
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span class="chat-num">{{ i + 1 }}</span>
                    <span v-if="light(s)" class="w-2 h-2 rounded-full shrink-0" :class="light(s)!.dot" />
                    <span class="text-[10px] text-gray-400">{{ light(s)?.label ?? '未套用個人資料' }}・{{ s.city }}</span>
                    <span v-for="f in s.familyMatches ?? []" :key="f.userId" class="w-2 h-2 rounded-full" :class="LIGHT[f.match.light].dot" :title="`${f.name}：${LIGHT[f.match.light].label}`" />
                  </div>
                  <p class="text-sm font-bold text-mygreen-300 line-clamp-1">{{ s.name }}</p>
                  <p class="text-xs text-gray-500 line-clamp-2 mt-0.5">{{ s.match?.reasons.join('・') || s.summary }}</p>
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 輸入區 -->
    <div class="relative p-3 bg-white border-t border-gray-100 shrink-0">
      <Transition name="slide-up">
        <div v-if="showSessionPanel" class="absolute left-3 right-3 bottom-full mb-2 bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden z-20">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span class="text-xs font-bold text-gray-500">歷史對話</span>
            <button aria-label="關閉" @click="showSessionPanel = false"><Icon icon="mingcute:close-line" class="text-base text-gray-400" /></button>
          </div>
          <div class="max-h-60 overflow-y-auto">
            <p v-if="!sessions.length" class="text-center text-xs text-gray-400 py-6">尚無歷史對話</p>
            <div v-for="s in sessions" :key="s.id"
              class="flex items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 cursor-pointer"
              :class="s.id === currentId ? 'bg-mygreen/10' : ''" @click="switchSession(s.id)">
              <span class="text-sm text-gray-700 truncate">{{ s.title || '未命名對話' }}</span>
              <button aria-label="刪除" @click.stop="removeSession(s.id)"><Icon icon="mingcute:delete-2-line" class="text-base text-gray-300 hover:text-red-400" /></button>
            </div>
          </div>
        </div>
      </Transition>

      <div class="flex items-center gap-2 px-1 pb-2 text-xs">
        <button type="button" class="flex items-center gap-1 text-gray-400 hover:text-mygreen-300 disabled:opacity-40 mr-auto" :disabled="sending" @click="reset()">
          <Icon icon="mingcute:add-circle-line" class="text-base" />新對話
        </button>
        <div v-if="families.length" class="relative">
          <button type="button" class="flex items-center gap-1 px-2.5 py-1 rounded-full border"
            :class="familyId ? 'bg-mygreen/10 border-mygreen text-mygreen-300' : 'bg-gray-100 border-gray-200 text-gray-500'"
            @click="showFamilyPanel = !showFamilyPanel">
            <Icon icon="mingcute:group-line" class="text-sm" />
            <span class="max-w-20 truncate">{{ familyId ? families.find((f) => f.id === familyId)?.name : '不帶家庭' }}</span>
          </button>
          <div v-if="showFamilyPanel" class="absolute bottom-full right-0 mb-1.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20 min-w-32">
            <button type="button" class="w-full px-3 py-2 text-left hover:bg-gray-50" :class="!familyId ? 'text-mygreen-300 font-bold' : 'text-gray-600'"
              @click="familyId = null; showFamilyPanel = false">不帶家庭</button>
            <button v-for="f in families" :key="f.id" type="button" class="w-full px-3 py-2 text-left hover:bg-gray-50 truncate"
              :class="familyId === f.id ? 'text-mygreen-300 font-bold' : 'text-gray-700'"
              @click="familyId = f.id; showFamilyPanel = false">{{ f.name }}</button>
          </div>
        </div>
        <label class="flex items-center gap-1.5 text-gray-500 cursor-pointer">
          套用個人資料
          <el-switch v-model="useProfile" size="small" />
        </label>
      </div>

      <div class="flex items-end gap-2 bg-gray-50 rounded-2xl px-3 py-2 border border-transparent focus-within:border-mygreen/40 focus-within:bg-white">
        <button type="button" class="p-1 pb-1.5" :class="showSessionPanel ? 'text-mygreen-300' : 'text-gray-400 hover:text-mygreen-300'" aria-label="歷史對話" @click="toggleSessionPanel">
          <Icon icon="mingcute:history-line" class="text-xl" />
        </button>
        <textarea v-model="input" rows="1" maxlength="500" placeholder="輸入你想查詢的福利…"
          class="chat-input flex-1 bg-transparent outline-none text-sm resize-none max-h-24 py-1.5 text-gray-700 placeholder:text-gray-400"
          @keydown="onKeydown" />
        <button type="button" class="p-1.5 rounded-full mb-0.5"
          :class="input.trim() && !sending ? 'bg-mygreen text-white hover:bg-mygreen-200' : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
          :disabled="!input.trim() || sending" aria-label="送出" @click="submit()">
          <Icon :icon="sending ? 'line-md:loading-loop' : 'mingcute:send-plane-fill'" class="text-lg" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
/* 手機 16px 以上才不會在聚焦時自動放大 */
@media (max-width: 768px) {
  .chat-input {
    font-size: 16px;
  }
}
.chat-md :deep(p) { margin: 0 0 0.5em; }
.chat-md :deep(p:last-child) { margin-bottom: 0; }
.chat-md :deep(ul), .chat-md :deep(ol) { margin: 0.4em 0; padding-left: 1.3em; }
.chat-md :deep(ul) { list-style: disc; }
.chat-md :deep(ol) { list-style: decimal; }
.chat-md :deep(li) { margin: 0.2em 0; }
.chat-md :deep(strong) { font-weight: 700; }
.chat-md :deep(h1), .chat-md :deep(h2), .chat-md :deep(h3) { font-weight: 700; margin: 0.6em 0 0.25em; }
.chat-md :deep(a) { color: var(--color-mygreen-300); text-decoration: underline; }
.chat-md :deep(a.chat-cite),
.chat-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4em;
  height: 1.4em;
  padding: 0 0.3em;
  margin: 0 0.15em;
  border-radius: 999px;
  font-size: 0.72em;
  font-weight: 700;
  line-height: 1;
  vertical-align: 0.15em;
  color: var(--color-mygreen-300);
  background: #eef6d6;
  text-decoration: none;
}
.chat-num { margin: 0; vertical-align: baseline; font-size: 10px; }
</style>
