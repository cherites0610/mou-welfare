<!-- 沿用 v1 web/src/views/register/Profile.vue；點擊驗證信連結後自動登入並來到此頁，送出改為 PATCH /v1/me -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { AGE_GROUPS, ageGroupOf, ageOn, CITIES, GENDERS, SPECIAL_IDENTITIES } from '@mou-welfare/shared'

definePageMeta({ layout: false, middleware: 'auth' })
useHead({ title: '填寫個人資料 | 哞福利', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const router = useRouter()
const api = useApi()
const session = useSession()

const loading = ref(false)
const errorMsg = ref('')

const IDENTITY_OPTIONS = [...AGE_GROUPS, ...SPECIAL_IDENTITIES] as const
const isAgeIdentity = (x: string) => (AGE_GROUPS as readonly string[]).includes(x)

const form = reactive({
  name: '',
  gender: '',
  city: '',
  identities: [] as string[],
  avatarUrl: '',
})

watchEffect(() => {
  const img = session.value.data?.user.image
  if (img && !form.avatarUrl) form.avatarUrl = img
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

// 年齡身分依生日自動判斷（與後端資格比對使用同一個函式）
const ageIdentity = computed(() =>
  birthday.value ? ageGroupOf(ageOn(new Date(`${birthday.value}T00:00:00Z`), new Date())) : null,
)
const isSelected = (option: string) =>
  isAgeIdentity(option) ? ageIdentity.value === option : form.identities.includes(option)

const toggleIdentity = (option: string) => {
  if (isAgeIdentity(option)) return
  const idx = form.identities.indexOf(option)
  if (idx === -1) form.identities.push(option)
  else form.identities.splice(idx, 1)
}

const handleSubmit = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    await api('/v1/me', {
      method: 'PATCH',
      body: {
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        birthday: birthday.value || null,
        gender: form.gender || null,
        city: form.city || null,
        identities: form.identities,
      },
    })
    ElMessage.success('帳號創建成功，歡迎加入！')
    router.push('/')
  } catch (err) {
    errorMsg.value = (err as Error).message || '儲存失敗，請稍後再試'
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
          <input v-model="form.name" type="text" placeholder="請輸入姓名" maxlength="50"
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
          <button v-for="option in GENDERS" :key="option" type="button"
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
          <el-option v-for="city in CITIES" :key="city" :label="city" :value="city" />
        </el-select>
      </div>

      <!-- 身分別 -->
      <div class="space-y-2">
        <label class="block text-xs font-bold text-gray-500">身分別（可複選，年齡依生日自動判斷）</label>
        <div class="flex flex-wrap gap-2">
          <button v-for="option in IDENTITY_OPTIONS" :key="option" type="button" @click="toggleIdentity(option)"
            :title="isAgeIdentity(option) ? '依生日自動判斷' : undefined"
            class="px-4 py-1.5 rounded-full text-xs font-bold border transition-all duration-150" :class="[
              isSelected(option)
                ? 'bg-[#84cc16] text-white border-[#84cc16] shadow-sm'
                : 'bg-white text-gray-500 border-gray-200 hover:border-[#84cc16] hover:text-[#84cc16]',
              isAgeIdentity(option) ? 'cursor-default' : '',
            ]">
            {{ option }}
          </button>
        </div>
      </div>

      <p v-if="errorMsg" class="text-red-500 text-xs text-center">{{ errorMsg }}</p>

      <button type="submit" :disabled="loading"
        class="w-full py-3 bg-[#84cc16] hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full transition-colors shadow-sm">
        {{ loading ? '儲存中...' : '完成創建' }}
      </button>
    </form>
  </AuthCard>
</template>
