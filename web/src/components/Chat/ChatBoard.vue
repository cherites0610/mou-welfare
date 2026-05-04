<script setup lang="ts">
import { useChatStore } from '@/stores/chat'
import { useFamilyStore } from '@/stores/family'
import { useUserStore } from '@/stores/user'
import { useWelfareStore } from '@/stores/welfare'
import type { WelfareResponse } from '@/api/welfare/model'
import { Icon } from '@iconify/vue'
import DOMPurify from 'dompurify'
import { ElMessage } from 'element-plus'
import { marked } from 'marked'
import { storeToRefs } from 'pinia'
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

marked.setOptions({ breaks: true })

const renderMarkdown = (content: string): string => {
  return DOMPurify.sanitize(marked.parse(content) as string)
}

// --- Props & Emits ---
const props = defineProps<{
  isMobile?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// --- State ---
const router = useRouter()
const userStore = useUserStore()
const chatStore = useChatStore()
const welfareStore = useWelfareStore()
const familyStore = useFamilyStore()
const { familyList } = storeToRefs(familyStore)
const selectedFamilyId = ref<string | null>(null)
const showFamilyPanel = ref(false)

const handleRagSourceClick = (source: WelfareResponse) => {
  welfareStore.setCurrentWelfare(source)
  router.push({ name: 'WelfareDetail', params: { id: source.id } })
}
const { messages, sending, currentSessionId, sessions, loading } = storeToRefs(chatStore)

const messageContainer = ref<HTMLElement | null>(null)
const chatInput = ref('')
const autoApplyProfile = ref(true)
const showSessionPanel = ref(false)

const toggleSessionPanel = async () => {
  showSessionPanel.value = !showSessionPanel.value
  if (showSessionPanel.value) {
    await chatStore.loadSessions()
  }
}

const handleSwitchSession = async (sessionId: string) => {
  showSessionPanel.value = false
  await chatStore.switchSession(sessionId)
}

const handleRemoveSession = async (e: Event, sessionId: string) => {
  e.stopPropagation()
  await chatStore.removeSession(sessionId)
}

// --- Methods ---

// 自動捲動到底部
const scrollToBottom = async () => {
  await nextTick()
  if (messageContainer.value) {
    messageContainer.value.scrollTo({
      top: messageContainer.value.scrollHeight,
      behavior: 'smooth'
    })
  }
}

// 監聽訊息列表變動，自動捲動
watch(
  messages,
  () => {
    scrollToBottom()
  },
  { deep: true }
)

// 初始化邏輯
onMounted(async () => {
  if (currentSessionId.value) {
    try {
      await chatStore.switchSession(currentSessionId.value)
    } catch (error) {
      console.error('Failed to load chat session:', error)
      chatStore.initNewSession()
    }
  } else {
    chatStore.initNewSession()
  }
  scrollToBottom()
  await familyStore.loadFamilies()
})

// 發送訊息
const handleSendMessage = async () => {
  const content = chatInput.value.trim()
  if (!content || sending.value) return

  chatInput.value = '' // 先清空輸入框，提升體驗

  try {
    // 呼叫 Store Action
    await chatStore.sendMsg({
      message: content,
      userId: userStore.userInfo?.id,
      autoApplyProfile: autoApplyProfile.value,
      familyId: selectedFamilyId.value || undefined,
    })
  } catch (error) {
    console.error('Send message failed:', error)
    ElMessage.error('訊息發送失敗，請稍後再試')
  }
}

// RAG 來源紅綠燈
const getRagLightDot = (light?: string) => {
  switch (light) {
    case 'GREEN': return 'bg-green-500'
    case 'YELLOW': return 'bg-yellow-400'
    default: return 'bg-red-400'
  }
}

const getRagLightBorder = (light?: string) => {
  switch (light) {
    case 'GREEN': return 'border-green-300'
    case 'YELLOW': return 'border-yellow-300'
    default: return 'border-gray-200'
  }
}

const getRagLightLabel = (light?: string) => {
  switch (light) {
    case 'GREEN': return '高度符合'
    case 'YELLOW': return '部分符合'
    default: return '參考資料'
  }
}

// 處理 Header 動作
const handleHeaderAction = () => {
  if (props.isMobile) {
    router.back()
  } else {
    emit('close')
  }
}
</script>

<template>
  <div class="flex flex-col bg-white overflow-hidden" :class="isMobile ? 'min-h-screen w-full' : 'h-full w-full'">

    <div class="hidden md:flex bg-[#84cc16] p-4 items-center justify-between shadow-sm shrink-0 z-10">
      <div class="flex items-center gap-3">
        <div>
          <h3 class="font-bold text-white text-lg">阿哞 AI 助理</h3>
          <div class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-green-300 animate-pulse"></span>
            <span class="text-xs text-green-50 font-medium">
              {{ sending ? '阿哞思考中...' : '在線中' }}
            </span>
          </div>
        </div>
      </div>

      <button @click="handleHeaderAction"
        class="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-1 transition">
        <Icon :icon="isMobile ? 'mingcute:left-line' : 'mingcute:down-line'" class="text-2xl" />
      </button>
    </div>

    <div ref="messageContainer" class="bg-gray-50 scroll-smooth" :class="isMobile
      ? 'h-screen overflow-y-auto pt-4 pb-[calc(80px+3.8rem+env(safe-area-inset-bottom))]'
      : 'flex-1 overflow-y-auto'">
      <div class="p-4 space-y-6">

        <div v-if="messages.length === 0"
          class="flex flex-col items-center justify-center text-gray-400 space-y-4 opacity-70"
          :class="isMobile ? 'h-[60vh]' : 'h-full'">
          <img src="https://storage.googleapis.com/mou-welfare/web/meta.png" class="w-20 h-20 grayscale opacity-50" />
          <p class="text-sm">嗨！我是阿哞，有什麼福利問題都可以問我喔！</p>
          <div class="flex gap-2">
            <span
              class="text-xs bg-white border border-gray-200 px-3 py-1 rounded-full cursor-pointer hover:text-[#84cc16] hover:border-[#84cc16]"
              @click="chatInput = '育兒津貼'; handleSendMessage()">育兒津貼</span>
            <span
              class="text-xs bg-white border border-gray-200 px-3 py-1 rounded-full cursor-pointer hover:text-[#84cc16] hover:border-[#84cc16]"
              @click="chatInput = '租屋補助'; handleSendMessage()">租屋補助</span>
          </div>
        </div>

        <div v-for="msg in messages" :key="msg.id" class="flex gap-3"
          :class="msg.role === 'user' ? 'flex-row-reverse' : ''">

          <div v-if="msg.role === 'assistant'"
            class="w-8 h-8 rounded-full bg-white border border-gray-200 p-0.5 shrink-0 self-start mt-1">
            <img src="https://storage.googleapis.com/mou-welfare/web/logo.png" class="w-full h-full object-contain" />
          </div>

          <div class="max-w-[85%] space-y-2">
            <div v-if="msg.role === 'system'"
              class="text-center text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1 mx-auto w-fit">
              {{ msg.content }}
            </div>

            <div v-else-if="msg.role === 'user'"
              class="px-4 py-3 rounded-2xl rounded-tr-none text-[15px] leading-relaxed shadow-sm break-words whitespace-pre-wrap bg-[#84cc16] text-white">
              {{ msg.content }}
            </div>

            <div v-else
              class="prose prose-sm max-w-none px-4 py-3 rounded-2xl rounded-tl-none text-[15px] leading-relaxed shadow-sm break-words bg-white text-gray-800 border border-gray-100"
              v-html="renderMarkdown(msg.content)" />

            <div v-if="msg.role === 'assistant' && msg.metadata?.isConverged && msg.metadata?.ragSources?.length"
              class="space-y-2">
              <div class="text-xs text-gray-400 font-bold ml-1 flex items-center gap-1">
                <Icon icon="mingcute:book-2-line" />
                參考資料來源：
              </div>
              <div class="grid gap-2">
                <button v-for="source in msg.metadata.ragSources" :key="source.id" type="button"
                  class="block w-full bg-white p-3 rounded-xl border hover:shadow-md transition-all group text-left"
                  :class="getRagLightBorder(source.match?.light)" @click="handleRagSourceClick(source)">
                  <div class="flex items-center gap-1.5 mb-1">
                    <span v-if="source.match?.light" class="w-2 h-2 rounded-full shrink-0"
                      :class="getRagLightDot(source.match.light)" />
                    <span class="text-[10px] font-medium text-gray-400">
                      {{ getRagLightLabel(source.match?.light) }}
                    </span>
                  </div>
                  <div class="text-xs font-bold text-[#84cc16] line-clamp-1 group-hover:underline">
                    {{ source.name }}
                  </div>
                  <div v-if="source.match?.reasons?.length" class="text-xs text-gray-500 mt-1 line-clamp-2">
                    {{ source.match.reasons.join('・') }}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="sending" class="flex gap-3">
          <div class="w-8 h-8 rounded-full bg-white border border-gray-200 p-0.5 shrink-0 self-start">
            <img src="https://storage.googleapis.com/mou-welfare/web/logo.png"
              class="w-full h-full object-contain opacity-50" />
          </div>
          <div
            class="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1">
            <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
            <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
            <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
          </div>
        </div>

      </div>
    </div>

<div class="chat-footer p-3 bg-white border-t border-gray-100 transition-all">
      <div class="flex items-center justify-end gap-2 px-1 pb-2">
        <button type="button" @click="chatStore.initNewSession()" :disabled="sending"
          class="flex items-center gap-1 text-xs text-gray-400 hover:text-[#84cc16] disabled:opacity-40 disabled:cursor-not-allowed transition-colors mr-auto">
          <Icon icon="mingcute:add-circle-line" class="text-base" />
          新對話
        </button>
        <div v-if="familyList.length > 0" class="relative">
          <button type="button"
            class="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors" :class="selectedFamilyId
              ? 'bg-green-50 border-green-300 text-[#84cc16]'
              : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-gray-300'"
            @click="showFamilyPanel = !showFamilyPanel">
            <Icon icon="mingcute:group-line" class="text-sm shrink-0" />
            <span class="max-w-16 truncate">
              {{selectedFamilyId ? familyList.find(f => f.id === selectedFamilyId)?.name : '不帶家庭'}}
            </span>
            <Icon icon="mingcute:down-line" class="text-xs shrink-0 transition-transform"
              :class="showFamilyPanel ? 'rotate-180' : ''" />
          </button>

          <Transition name="slide-up">
            <div v-if="showFamilyPanel"
              class="absolute bottom-full left-0 mb-1.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50 min-w-32">
              <button type="button"
                class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors"
                :class="!selectedFamilyId ? 'text-[#84cc16] font-bold bg-green-50' : 'text-gray-500'"
                @click="selectedFamilyId = null; showFamilyPanel = false">
                <Icon icon="mingcute:user-3-line" class="text-sm shrink-0" />
                不帶家庭
              </button>
              <div class="h-px bg-gray-100" />
              <button v-for="f in familyList" :key="f.id" type="button"
                class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors"
                :class="selectedFamilyId === f.id ? 'text-[#84cc16] font-bold bg-green-50' : 'text-gray-700'"
                @click="selectedFamilyId = f.id; showFamilyPanel = false">
                <Icon icon="mingcute:group-line" class="text-sm shrink-0" />
                <span class="truncate">{{ f.name }}</span>
              </button>
            </div>
          </Transition>
        </div>
        <span class="text-xs text-gray-500">是否套用個人資料</span>
        <button type="button" @click="autoApplyProfile = !autoApplyProfile"
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
          :class="autoApplyProfile ? 'bg-[#84cc16]' : 'bg-gray-200'">
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200"
            :class="autoApplyProfile ? 'translate-x-4' : 'translate-x-0'" />
        </button>
      </div>
      <!-- 歷史對話面板 -->
      <Transition name="slide-up">
        <div v-if="showSessionPanel"
          class="absolute left-0 right-0 bottom-full mb-2 mx-3 bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden z-50">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span class="text-xs font-bold text-gray-500">歷史對話</span>
            <Icon icon="mingcute:close-line" class="text-base text-gray-400 cursor-pointer hover:text-gray-600"
              @click="showSessionPanel = false" />
          </div>
          <div class="max-h-52 overflow-y-auto">
            <div v-if="loading" class="flex justify-center items-center py-6">
              <Icon icon="line-md:loading-loop" class="text-xl text-gray-400" />
            </div>
            <div v-else-if="sessions.length === 0" class="text-center text-xs text-gray-400 py-6">
              尚無歷史對話
            </div>
            <button v-else v-for="session in sessions" :key="session.id" type="button"
              class="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
              :class="session.id === currentSessionId ? 'bg-green-50' : ''" @click="handleSwitchSession(session.id)">
              <div class="flex items-center gap-2 min-w-0">
                <Icon icon="mingcute:chat-2-line" class="text-base shrink-0"
                  :class="session.id === currentSessionId ? 'text-[#84cc16]' : 'text-gray-400'" />
                <span class="text-sm text-gray-700 truncate">{{ session.title || '未命名對話' }}</span>
              </div>
              <Icon icon="mingcute:delete-2-line"
                class="text-base text-gray-300 hover:text-red-400 shrink-0 transition-colors"
                @click="handleRemoveSession($event, session.id)" />
            </button>
          </div>
        </div>
      </Transition>

      <div
        class="flex items-end gap-2 bg-gray-50 rounded-2xl px-3 py-2 border border-transparent focus-within:border-green-200 focus-within:bg-white transition-all">
        <button type="button" class="p-1 pb-2 transition-colors"
          :class="showSessionPanel ? 'text-[#84cc16]' : 'text-gray-400 hover:text-[#84cc16]'"
          @click="toggleSessionPanel">
          <Icon icon="mingcute:history-line" class="text-xl" />
        </button>

        <textarea v-model="chatInput" rows="1" placeholder="輸入你想查詢的福利..."
          class="chat-input flex-1 bg-transparent border-none outline-none text-sm resize-none max-h-20 py-2 text-gray-700 placeholder:text-gray-400"
          @keydown.enter.prevent="handleSendMessage"></textarea>

        <button @click="handleSendMessage" class="p-1.5 rounded-full transition-all mb-0.5"
          :class="chatInput.trim() && !sending ? 'bg-[#84cc16] text-white shadow-md hover:bg-[#72b012]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
          :disabled="!chatInput.trim() || sending">
          <Icon v-if="sending" icon="line-md:loading-loop" class="text-lg" />
          <Icon v-else icon="mingcute:send-plane-fill" class="text-lg" />
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

.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

@media screen and (max-width: 768px) {
  .chat-input {
    font-size: 16px !important;
  }
}

/* Markdown 渲染樣式 */
:deep(.prose) {
  color: inherit;
}

:deep(.prose p) {
  margin: 0 0 0.5em;
}

:deep(.prose p:last-child) {
  margin-bottom: 0;
}

:deep(.prose h1),
:deep(.prose h2),
:deep(.prose h3) {
  font-weight: 700;
  margin: 0.75em 0 0.25em;
  line-height: 1.3;
}

:deep(.prose h1) {
  font-size: 1.15em;
}

:deep(.prose h2) {
  font-size: 1.05em;
}

:deep(.prose h3) {
  font-size: 1em;
}

:deep(.prose ul),
:deep(.prose ol) {
  margin: 0.4em 0;
  padding-left: 1.4em;
}

:deep(.prose li) {
  margin: 0.2em 0;
}

:deep(.prose strong) {
  font-weight: 700;
}

:deep(.prose em) {
  font-style: italic;
}

:deep(.prose code) {
  background: #f3f4f6;
  color: #374151;
  padding: 0.15em 0.35em;
  border-radius: 4px;
  font-size: 0.85em;
  font-family: ui-monospace, monospace;
}

:deep(.prose pre) {
  background: #1f2937;
  color: #e5e7eb;
  padding: 0.75em 1em;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.5em 0;
}

:deep(.prose pre code) {
  background: none;
  color: inherit;
  padding: 0;
  font-size: 0.82em;
}

:deep(.prose blockquote) {
  border-left: 3px solid #84cc16;
  padding-left: 0.75em;
  color: #6b7280;
  margin: 0.5em 0;
}

:deep(.prose a) {
  color: #84cc16;
  text-decoration: underline;
}

:deep(.prose hr) {
  border-color: #e5e7eb;
  margin: 0.75em 0;
}

:deep(.prose table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85em;
  margin: 0.5em 0;
}

:deep(.prose th),
:deep(.prose td) {
  border: 1px solid #e5e7eb;
  padding: 0.4em 0.6em;
  text-align: left;
}

:deep(.prose th) {
  background: #f9fafb;
  font-weight: 700;
}

@media screen and (max-width: 768px) {
  .chat-footer {
    position: fixed !important;
    left: 0;
    width: 100%;
    z-index: 40;
    /* 這裡使用原生 css 的 calc，就不會有 Tailwind 語法失效的問題 */
    bottom: calc(3.8rem + env(safe-area-inset-bottom));
  }
}

/* 💻 電腦版：懸浮視窗內，正常待在底部即可 */
@media screen and (min-width: 769px) {
  .chat-footer {
    position: relative;
    flex-shrink: 0;
  }
}
</style>
