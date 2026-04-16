<script setup lang="ts">
import AvatarUploader from '@/components/common/AvatarUploader.vue'
import { useUserStore } from '@/stores/user'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

const GENDER_OPTIONS = ['男性', '女性']
const CITY_OPTIONS = [
  '台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣',
  '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣', '嘉義市',
  '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣',
  '台東縣', '澎湖縣', '金門縣', '連江縣',
]
const IDENTITY_OPTIONS = [
  '20歲以下', '20歲-65歲', '65歲以上',
  '中低收入戶', '低收入戶', '榮民',
  '身心障礙者', '原住民', '外籍配偶家庭',
]

const loading = ref(false)
const errorMsg = ref('')

const form = reactive({
  name: userInfo.value?.name ?? '',
  gender: userInfo.value?.gender ?? '',
  city: userInfo.value?.city ?? '',
  identities: [...(userInfo.value?.identities ?? [])],
  isSubscribed: userInfo.value?.isSubscribed ?? false,
  avatarUrl: userInfo.value?.avatarUrl ?? '',
})

const [initYear = '', initMonth = '', initDay = ''] = (userInfo.value?.birthday ?? '').split('-')
const birthdayYear = ref(initYear)
const birthdayMonth = ref(initMonth ? String(Number(initMonth)) : '')
const birthdayDay = ref(initDay ? String(Number(initDay)) : '')

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

const previewName = computed(() => form.name || userInfo.value?.email?.split('@')[0] || '未命名用戶')

const toggleIdentity = (option: string) => {
  const idx = form.identities.indexOf(option)
  if (idx === -1) {
    form.identities.push(option)
  } else {
    form.identities.splice(idx, 1)
  }
}

const handleSave = async () => {
  const userId = userInfo.value?.id
  if (!userId) return

  loading.value = true
  errorMsg.value = ''

  try {
    await userStore.userUpdateProfile(userId, {
      name: form.name || undefined,
      birthday: birthday.value || undefined,
      gender: form.gender || undefined,
      city: form.city || undefined,
      identities: form.identities,
      isSubscribed: form.isSubscribed,
      avatarUrl: form.avatarUrl || undefined,
    })
    ElMessage.success('個人資料已更新')
    router.back()
  } catch (err: any) {
    errorMsg.value = err.message || '更新失敗，請稍後再試'
  } finally {
    loading.value = false
  }
}

const handleCancel = () => router.back()
</script>

<template>
  <div class="min-h-screen bg-gray-50 font-sans">
    <div class="max-w-5xl mx-auto px-4 py-6 md:py-10">

      <!-- Page Header -->
      <div class="flex items-center gap-3 mb-8 lg:hidden">
        <button @click="handleCancel"
          class="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-colors shadow-sm">
          <Icon icon="mingcute:arrow-left-line" class="text-lg" />
        </button>
        <h1 class="text-xl md:text-2xl font-bold text-gray-800">編輯個人資料</h1>
      </div>

      <!-- Main Grid -->
      <div class="flex flex-col md:flex-row gap-6 items-start">

        <!-- Left: Profile Preview (desktop sidebar) -->
        <aside class="w-full md:w-64 md:shrink-0">
          <div
            class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col items-center gap-4 md:sticky md:top-6">
            <AvatarUploader v-model="form.avatarUrl" />
            <div class="text-center">
              <p class="text-base font-bold text-gray-800">{{ previewName }}</p>
              <p v-if="form.city || form.gender" class="text-xs text-gray-400 mt-1">
                {{ [form.gender, form.city].filter(Boolean).join(' · ') }}
              </p>
            </div>
            <div v-if="form.identities.length > 0" class="flex flex-wrap justify-center gap-1.5">
              <span v-for="id in form.identities" :key="id"
                class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700">
                {{ id }}
              </span>
            </div>
            <p v-else class="text-xs text-gray-400">尚未選擇身分別</p>

            <!-- Desktop save/cancel -->
            <div class="hidden md:flex flex-col gap-2 w-full mt-2">
              <button @click="handleSave" :disabled="loading"
                class="w-full bg-[#84cc16] text-white font-bold py-2.5 rounded-full hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm">
                {{ loading ? '儲存中...' : '儲存變更' }}
              </button>
              <button @click="handleCancel"
                class="w-full border border-gray-200 text-gray-500 font-bold py-2.5 rounded-full hover:bg-gray-50 transition-colors text-sm">
                取消
              </button>
            </div>
          </div>
        </aside>

        <!-- Right: Form -->
        <div class="flex-1 min-w-0 space-y-4">

          <!-- 基本資料 -->
          <section class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="px-5 pt-5 pb-3">
              <p class="text-xs font-bold text-gray-400 uppercase tracking-widest">基本資料</p>
            </div>

            <div class="px-5 pb-4">
              <label class="block text-xs font-bold text-gray-500 mb-1.5">姓名</label>
              <el-input v-model="form.name" placeholder="請輸入姓名" size="large" class="w-full" />
            </div>

            <div class="mx-5 border-t border-gray-50" />

            <div class="px-5 py-4">
              <label class="block text-xs font-bold text-gray-500 mb-1.5">生日</label>
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

            <div class="mx-5 border-t border-gray-50" />

            <div class="px-5 py-4">
              <label class="block text-xs font-bold text-gray-500 mb-3">性別</label>
              <div class="flex flex-wrap gap-2">
                <button v-for="option in GENDER_OPTIONS" :key="option"
                  @click="form.gender = form.gender === option ? '' : option"
                  class="px-5 py-2 rounded-full text-sm font-bold border transition-all duration-150" :class="form.gender === option
                    ? 'bg-[#84cc16] text-white border-[#84cc16] shadow-sm'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-[#84cc16] hover:text-[#84cc16]'">
                  {{ option }}
                </button>
                <button @click="form.gender = ''"
                  class="px-5 py-2 rounded-full text-sm font-bold border transition-all duration-150" :class="form.gender === ''
                    ? 'bg-gray-100 text-gray-600 border-gray-200'
                    : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300'">
                  不設定
                </button>
              </div>
            </div>

            <div class="mx-5 border-t border-gray-50" />

            <div class="px-5 py-4">
              <label class="block text-xs font-bold text-gray-500 mb-1.5">城市</label>
              <el-select v-model="form.city" placeholder="請選擇城市" size="large" class="w-full" clearable>
                <el-option v-for="city in CITY_OPTIONS" :key="city" :label="city" :value="city" />
              </el-select>
            </div>
          </section>

          <!-- 身分別 -->
          <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">身分別</p>
            <div class="flex flex-wrap gap-2">
              <button v-for="option in IDENTITY_OPTIONS" :key="option" @click="toggleIdentity(option)"
                class="px-4 py-2 rounded-full text-sm font-bold border transition-all duration-150" :class="form.identities.includes(option)
                  ? 'bg-[#84cc16] text-white border-[#84cc16] shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-[#84cc16] hover:text-[#84cc16]'">
                {{ option }}
              </button>
            </div>
            <p class="text-xs text-gray-400 mt-3">可複選，點擊選取或取消</p>
          </section>

          <!-- 通知設定 -->
          <section class="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div class="px-5 py-4 flex items-center justify-between">
              <div>
                <p class="text-sm font-bold text-gray-800">訂閱通知</p>
                <p class="text-xs text-gray-400 mt-0.5">接收最新福利資訊推播</p>
              </div>
              <el-switch v-model="form.isSubscribed" active-color="#84cc16" />
            </div>
          </section>

          <!-- Error -->
          <p v-if="errorMsg" class="text-sm text-red-500 text-center px-2">{{ errorMsg }}</p>

          <!-- Mobile Actions -->
          <div class="flex gap-3 pt-2 md:hidden">
            <button @click="handleCancel"
              class="flex-1 border border-gray-200 text-gray-500 font-bold py-3.5 rounded-full hover:bg-gray-50 transition-colors text-sm">
              取消
            </button>
            <button @click="handleSave" :disabled="loading"
              class="flex-1 bg-[#84cc16] text-white font-bold py-3.5 rounded-full hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm">
              {{ loading ? '儲存中...' : '儲存變更' }}
            </button>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>
