<script setup lang="ts">
import AuthCard from '@/components/auth/AuthCard.vue'
import AvatarUploader from '@/components/common/AvatarUploader.vue'
import { useAppInit } from '@/composables/useAppInit'
import { useUserStore } from '@/stores/user'
import { Icon } from '@iconify/vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const userStore = useUserStore()
const { initAppData, startFamilyPolling } = useAppInit()

const loading = ref(false)
const errorMsg = ref('')

const GENDER_OPTIONS = ['男性', '女性']
const CITY_OPTIONS = [
  '台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣',
  '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣', '嘉義市',
  '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣',
  '台東縣', '澎湖縣', '金門縣', '連江縣',
]
const IDENTITY_OPTIONS = [
  '20歲以下', '20歲-65歲', '65歲以上', '中低收入戶', '低收入戶',
  '榮民', '身心障礙者', '原住民', '外籍配偶家庭',
]

const form = reactive({
  name: '',
  gender: '',
  city: '',
  identities: [] as string[],
  isSubscribed: false,
  avatarUrl: '',
})

const birthdayYear = ref('')
const birthdayMonth = ref('')
const birthdayDay = ref('')

const currentYear = new Date().getFullYear()
const yearOptions = Array.from({ length: currentYear - 1923 }, (_, i) => currentYear - i)
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
const daysInSelectedMonth = computed(() => {
  if (!birthdayYear.value || !birthdayMonth.value) return 31
  return new Date(Number(birthdayYear.value), Number(birthdayMonth.value), 0).getDate()
})
const dayOptions = computed(() => Array.from({ length: daysInSelectedMonth.value }, (_, i) => i + 1))

watch(daysInSelectedMonth, (max) => {
  if (birthdayDay.value && Number(birthdayDay.value) > max) birthdayDay.value = ''
})

const birthday = computed(() => {
  if (!birthdayYear.value || !birthdayMonth.value || !birthdayDay.value) return ''
  return `${birthdayYear.value}-${String(birthdayMonth.value).padStart(2, '0')}-${String(birthdayDay.value).padStart(2, '0')}`
})

const AGE_IDENTITIES = ['20歲以下', '20歲-65歲', '65歲以上'] as const

const age = computed(() => {
  if (!birthday.value) return null
  const today = new Date()
  const birth = new Date(birthday.value)
  let years = today.getFullYear() - birth.getFullYear()
  const notReachedBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (notReachedBirthday) years--
  return years
})

watch(age, (val) => {
  const identities = form.identities.filter(i => !AGE_IDENTITIES.includes(i as typeof AGE_IDENTITIES[number]))
  if (val === null) {
    form.identities = identities
    return
  }
  if (val < 20) identities.unshift('20歲以下')
  else if (val <= 65) identities.unshift('20歲-65歲')
  else identities.unshift('65歲以上')
  form.identities = identities
})

interface AuthState {
  flow: string
  oauthCode?: string
  email?: string
  password?: string
  verificationCode?: string
}

let authState: AuthState | null = null

onMounted(() => {
  const raw = sessionStorage.getItem('mou_auth_state')
  if (!raw) {
    router.replace('/register')
    return
  }
  authState = JSON.parse(raw)
  if (authState?.flow !== 'register') {
    router.replace('/register')
  }
})

const toggleIdentity = (option: string) => {
  const idx = form.identities.indexOf(option)
  if (idx === -1) {
    form.identities.push(option)
  } else {
    form.identities.splice(idx, 1)
  }
}

const handleSubmit = async () => {
  if (!authState) return

  loading.value = true
  errorMsg.value = ''

  try {
    if (authState.oauthCode) {
      await userStore.userRegister({
        email: authState.email!,
        password: authState.password!,
        oauthCode: authState.oauthCode,
        name: form.name || undefined,
        birthday: birthday.value || undefined,
        gender: form.gender || undefined,
        city: form.city || undefined,
        identities: form.identities.length ? form.identities : undefined,
        isSubscribed: form.isSubscribed,
        avatarUrl: form.avatarUrl || undefined,
      })
      await initAppData()
      startFamilyPolling()
    } else {
      await userStore.userRegister({
        email: authState.email!,
        password: authState.password!,
        verificationCode: authState.verificationCode!,
        name: form.name || undefined,
        birthday: birthday.value || undefined,
        gender: form.gender || undefined,
        city: form.city || undefined,
        identities: form.identities.length ? form.identities : undefined,
        isSubscribed: form.isSubscribed,
        avatarUrl: form.avatarUrl || undefined,
      })
      await userStore.userLogin({ email: authState.email!, password: authState.password! })
    }
    sessionStorage.removeItem('mou_auth_state')
    ElMessage.success('帳號創建成功，歡迎加入！')
    router.push('/')
  } catch (err: any) {
    errorMsg.value = err.message || '創建帳號失敗，請確認驗證碼是否正確'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthCard>
    <div class="flex items-center gap-2 mb-6">
      <button @click="router.back()"
        class="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-colors">
        <Icon icon="mingcute:arrow-left-line" class="text-lg" />
      </button>
      <h2 class="text-xl font-bold text-gray-800">填寫個人資料</h2>
    </div>

    <form @submit.prevent="handleSubmit" class="space-y-5">

      <!-- 頭像 -->
      <div class="flex flex-col items-center gap-2">
        <AvatarUploader v-model="form.avatarUrl" />
        <p class="text-xs text-gray-400">點擊上傳頭像（選填）</p>
      </div>

      <!-- 姓名 -->
      <div class="space-y-1.5">
        <label class="block text-xs font-bold text-gray-500">姓名</label>
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Icon icon="mingcute:user-line" class="text-lg" />
          </span>
          <input v-model="form.name" type="text" placeholder="請輸入姓名"
            class="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-mygreen transition-colors" />
        </div>
      </div>

      <!-- 生日 -->
      <div class="space-y-1.5">
        <label class="block text-xs font-bold text-gray-500">生日</label>
        <div class="flex gap-2">
          <el-select v-model="birthdayYear" placeholder="年" size="large" class="flex-1">
            <el-option v-for="y in yearOptions" :key="y" :label="`${y}年`" :value="String(y)" />
          </el-select>
          <el-select v-model="birthdayMonth" placeholder="月" size="large" class="flex-[0.6]">
            <el-option v-for="m in monthOptions" :key="m" :label="`${m}月`" :value="String(m)" />
          </el-select>
          <el-select v-model="birthdayDay" placeholder="日" size="large" class="flex-[0.6]" :disabled="!birthdayMonth">
            <el-option v-for="d in dayOptions" :key="d" :label="`${d}日`" :value="String(d)" />
          </el-select>
        </div>
      </div>

      <!-- 性別 -->
      <div class="space-y-2">
        <label class="block text-xs font-bold text-gray-500">性別</label>
        <div class="flex flex-wrap gap-2">
          <button v-for="option in GENDER_OPTIONS" :key="option" type="button"
            @click="form.gender = form.gender === option ? '' : option"
            class="px-5 py-2 rounded-full text-sm font-bold border transition-all duration-150" :class="form.gender === option
              ? 'bg-[#84cc16] text-white border-[#84cc16] shadow-sm'
              : 'bg-white text-gray-500 border-gray-200 hover:border-[#84cc16] hover:text-[#84cc16]'">
            {{ option }}
          </button>
          <button type="button" @click="form.gender = ''"
            class="px-5 py-2 rounded-full text-sm font-bold border transition-all duration-150" :class="form.gender === ''
              ? 'bg-gray-100 text-gray-600 border-gray-200'
              : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300'">
            不設定
          </button>
        </div>
      </div>

      <!-- 城市 -->
      <div class="space-y-1.5">
        <label class="block text-xs font-bold text-gray-500">城市</label>
        <el-select v-model="form.city" placeholder="請選擇城市" size="large" class="w-full" clearable>
          <el-option v-for="city in CITY_OPTIONS" :key="city" :label="city" :value="city" />
        </el-select>
      </div>

      <!-- 身分別 -->
      <div class="space-y-2">
        <label class="block text-xs font-bold text-gray-500">身分別（可複選）</label>
        <div class="flex flex-wrap gap-2">
          <button v-for="option in IDENTITY_OPTIONS" :key="option" type="button" @click="toggleIdentity(option)"
            class="px-4 py-1.5 rounded-full text-xs font-bold border transition-all duration-150" :class="form.identities.includes(option)
              ? 'bg-[#84cc16] text-white border-[#84cc16] shadow-sm'
              : 'bg-white text-gray-500 border-gray-200 hover:border-[#84cc16] hover:text-[#84cc16]'">
            {{ option }}
          </button>
        </div>
      </div>

      <!-- 訂閱通知 -->
      <div class="flex items-center justify-between py-1">
        <div>
          <p class="text-sm font-bold text-gray-700">訂閱通知</p>
          <p class="text-xs text-gray-400 mt-0.5">接收最新福利資訊推播</p>
        </div>
        <el-switch v-model="form.isSubscribed" active-color="#84cc16" />
      </div>

      <p v-if="errorMsg" class="text-red-500 text-xs text-center">{{ errorMsg }}</p>

      <button type="submit" :disabled="loading"
        class="w-full py-3 bg-[#84cc16] hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full transition-colors shadow-sm">
        {{ loading ? '創建中...' : '完成創建' }}
      </button>
    </form>
  </AuthCard>
</template>
