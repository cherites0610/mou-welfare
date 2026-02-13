<script setup lang="ts">
import { ref, nextTick, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import { useChatStore } from '@/stores/chat' // 引入您提供的 Chat Store
import { ElMessage } from 'element-plus'

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
const { messages, sending, currentSessionId } = storeToRefs(chatStore) // 使用 Pinia 狀態

const messageContainer = ref<HTMLElement | null>(null)
const chatInput = ref('')

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
    })
  } catch (error) {
    console.error('Send message failed:', error)
    ElMessage.error('訊息發送失敗，請稍後再試')
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
  <div 
    class="flex flex-col bg-white overflow-hidden" 
    :class="isMobile ? 'min-h-screen w-full' : 'h-full w-full'"
  >
    
    <div 
      class="hidden md:flex bg-[#84cc16] p-4 items-center justify-between shadow-sm shrink-0 z-10"
    >
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
      
      <button 
        @click="handleHeaderAction" 
        class="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-1 transition"
      >
        <Icon :icon="isMobile ? 'mingcute:left-line' : 'mingcute:down-line'" class="text-2xl" />
      </button>
    </div>

    <div 
      ref="messageContainer" 
      class="bg-gray-50 scroll-smooth"
      :class="isMobile 
        ? 'h-screen overflow-y-auto pt-4 pb-[calc(80px+3.8rem+env(safe-area-inset-bottom))]' 
        : 'flex-1 overflow-y-auto'"
    >
      <div class="p-4 space-y-6">
        
        <div v-if="messages.length === 0" class="flex flex-col items-center justify-center text-gray-400 space-y-4 opacity-70" :class="isMobile ? 'h-[60vh]' : 'h-full'">
           <img src="https://storage.googleapis.com/mou-welfare/web/meta.png" class="w-20 h-20 grayscale opacity-50" />
           <p class="text-sm">嗨！我是阿哞，有什麼福利問題都可以問我喔！</p>
           <div class="flex gap-2">
              <span class="text-xs bg-white border border-gray-200 px-3 py-1 rounded-full cursor-pointer hover:text-[#84cc16] hover:border-[#84cc16]" @click="chatInput='育兒津貼';handleSendMessage()">育兒津貼</span>
              <span class="text-xs bg-white border border-gray-200 px-3 py-1 rounded-full cursor-pointer hover:text-[#84cc16] hover:border-[#84cc16]" @click="chatInput='租屋補助';handleSendMessage()">租屋補助</span>
           </div>
        </div>

        <div v-for="msg in messages" :key="msg.id" class="flex gap-3" :class="msg.role === 'user' ? 'flex-row-reverse' : ''">
          
          <div v-if="msg.role === 'assistant'" class="w-8 h-8 rounded-full bg-white border border-gray-200 p-0.5 shrink-0 self-start mt-1">
            <img src="https://storage.googleapis.com/mou-welfare/web/logo.png" class="w-full h-full object-contain" />
          </div>

          <div class="max-w-[85%] space-y-2">
             <div v-if="msg.role === 'system'" class="text-center text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1 mx-auto w-fit">
               {{ msg.content }}
             </div>

             <div 
              v-else
              class="px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm break-words whitespace-pre-wrap"
              :class="msg.role === 'user' ? 'bg-[#84cc16] text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'"
            >
              {{ msg.content }}
            </div>

             <div v-if="msg.role === 'assistant' && msg.metadata?.ragSources?.length" class="space-y-2">
               <div class="text-xs text-gray-400 font-bold ml-1 flex items-center gap-1">
                 <Icon icon="mingcute:book-2-line" />
                 參考資料來源：
               </div>
               <div class="grid gap-2">
                 <a 
                   v-for="source in msg.metadata.ragSources" 
                   :key="source.id"
                   :href="source.uri"
                   target="_blank"
                   class="block bg-white p-3 rounded-xl border border-gray-200 hover:border-green-400 hover:shadow-md transition-all group text-left"
                 >
                   <div class="text-xs font-bold text-[#84cc16] mb-1 line-clamp-1 group-hover:underline">
                     {{ source.title }}
                   </div>
                   <div class="text-xs text-gray-500 line-clamp-2">
                     {{ source.snippet }}
                   </div>
                 </a>
               </div>
             </div>
          </div>
        </div>

        <div v-if="sending" class="flex gap-3">
           <div class="w-8 h-8 rounded-full bg-white border border-gray-200 p-0.5 shrink-0 self-start">
              <img src="https://storage.googleapis.com/mou-welfare/web/logo.png" class="w-full h-full object-contain opacity-50" />
           </div>
           <div class="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1">
              <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
              <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
              <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
           </div>
        </div>

      </div>
    </div>

    <div 
      class="p-3 bg-white border-t border-gray-100 transition-all"
      :class="isMobile 
        ? 'fixed left-0 w-full z-40 bottom-[calc(3.8rem+env(safe-area-inset-bottom))]' 
        : 'shrink-0'"
    >
      <div class="flex items-end gap-2 bg-gray-50 rounded-2xl px-3 py-2 border border-transparent focus-within:border-green-200 focus-within:bg-white transition-all">
        <button class="text-gray-400 hover:text-[#84cc16] p-1 pb-2 transition-colors">
          <Icon icon="mingcute:add-circle-line" class="text-xl" />
        </button>
        
        <textarea 
          v-model="chatInput"
          rows="1"
          placeholder="輸入你想查詢的福利..."
          class="chat-input flex-1 bg-transparent border-none outline-none text-sm resize-none max-h-20 py-2 text-gray-700 placeholder:text-gray-400"
          @keydown.enter.prevent="handleSendMessage"
        ></textarea>
        
        <button 
          @click="handleSendMessage"
          class="p-1.5 rounded-full transition-all mb-0.5"
          :class="chatInput.trim() && !sending ? 'bg-[#84cc16] text-white shadow-md hover:bg-[#72b012]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
          :disabled="!chatInput.trim() || sending"
        >
          <Icon v-if="sending" icon="line-md:loading-loop" class="text-lg" />
          <Icon v-else icon="mingcute:send-plane-fill" class="text-lg" />
        </button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}
@media screen and (max-width: 768px) {
  .chat-input {
    font-size: 16px !important; /* 強制設定為 16px，防止 iOS 縮放 */
  }
}
</style>