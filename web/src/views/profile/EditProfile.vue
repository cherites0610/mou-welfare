<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

const GENDER_OPTIONS = ['男性', '女性']
const IDENTITY_OPTIONS = [
  '20歲以下',
  '20歲-65歲',
  '65歲以上',
  '中低收入戶',
  '低收入戶',
  '榮民',
  '身心障礙者',
  '原住民',
  '外籍配偶家庭',
]

const loading = ref(false)
const errorMsg = ref('')

const form = reactive({
  name: userInfo.value?.name ?? '',
  birthday: userInfo.value?.birthday ?? '',
  gender: userInfo.value?.gender ?? '',
  address: userInfo.value?.address ?? '',
  identities: [...(userInfo.value?.identities ?? [])],
  isSubscribed: userInfo.value?.isSubscribed ?? false,
})

const handleSave = async () => {
  const userId = userInfo.value?.id
  if (!userId) return

  loading.value = true
  errorMsg.value = ''

  try {
    await userStore.userUpdateProfile(userId, {
      name: form.name || undefined,
      birthday: form.birthday || undefined,
      gender: form.gender || undefined,
      address: form.address || undefined,
      identities: form.identities,
      isSubscribed: form.isSubscribed,
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
  <div class="min-h-screen bg-white pb-10 font-sans text-gray-800">
    <div class="max-w-2xl mx-auto px-4 pt-6 md:pt-10">

      <!-- Header -->
      <div class="flex items-center gap-3 mb-8">
        <button
          @click="handleCancel"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Icon icon="mingcute:arrow-left-line" class="text-2xl" />
        </button>
        <h1 class="text-2xl font-bold text-gray-800">編輯個人資料</h1>
      </div>

      <!-- Form Card -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-6">

        <!-- 姓名 -->
        <div class="space-y-2">
          <label class="text-sm font-bold text-gray-600">姓名</label>
          <el-input
            v-model="form.name"
            placeholder="請輸入姓名"
            size="large"
            class="w-full"
          />
        </div>

        <!-- 生日 -->
        <div class="space-y-2">
          <label class="text-sm font-bold text-gray-600">生日</label>
          <el-date-picker
            v-model="form.birthday"
            type="date"
            placeholder="請選擇生日"
            format="YYYY/MM/DD"
            value-format="YYYY-MM-DD"
            size="large"
            class="w-full"
          />
        </div>

        <!-- 性別 -->
        <div class="space-y-2">
          <label class="text-sm font-bold text-gray-600">性別</label>
          <div class="flex gap-4">
            <label
              v-for="option in GENDER_OPTIONS"
              :key="option"
              class="flex items-center gap-2 cursor-pointer select-none"
            >
              <input
                type="radio"
                v-model="form.gender"
                :value="option"
                class="accent-[#84cc16] w-4 h-4"
              />
              <span class="text-sm text-gray-700">{{ option }}</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                v-model="form.gender"
                value=""
                class="accent-[#84cc16] w-4 h-4"
              />
              <span class="text-sm text-gray-400">不設定</span>
            </label>
          </div>
        </div>

        <!-- 身分別 -->
        <div class="space-y-2">
          <label class="text-sm font-bold text-gray-600">身分別（可複選）</label>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            <label
              v-for="option in IDENTITY_OPTIONS"
              :key="option"
              class="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-lg border border-gray-100 hover:border-[#84cc16] transition-colors"
              :class="form.identities.includes(option) ? 'border-[#84cc16] bg-green-50' : ''"
            >
              <input
                type="checkbox"
                v-model="form.identities"
                :value="option"
                class="accent-[#84cc16] w-4 h-4 shrink-0"
              />
              <span class="text-sm text-gray-700">{{ option }}</span>
            </label>
          </div>
        </div>

        <!-- 地址 -->
        <div class="space-y-2">
          <label class="text-sm font-bold text-gray-600">地址</label>
          <el-input
            v-model="form.address"
            placeholder="請輸入地址"
            size="large"
            class="w-full"
          />
        </div>

        <!-- 訂閱通知 -->
        <div class="flex items-center justify-between py-2">
          <div>
            <p class="text-sm font-bold text-gray-700">訂閱通知</p>
            <p class="text-xs text-gray-400 mt-0.5">接收最新福利資訊推播</p>
          </div>
          <el-switch
            v-model="form.isSubscribed"
            active-color="#84cc16"
          />
        </div>

        <!-- Error -->
        <p v-if="errorMsg" class="text-sm text-red-500 text-center">{{ errorMsg }}</p>

        <!-- Actions -->
        <div class="flex gap-3 pt-2">
          <button
            @click="handleCancel"
            class="flex-1 border border-gray-200 text-gray-500 font-bold py-3 rounded-full hover:bg-gray-50 transition-colors duration-200"
          >
            取消
          </button>
          <button
            @click="handleSave"
            :disabled="loading"
            class="flex-1 bg-[#84cc16] text-white font-bold py-3 rounded-full hover:bg-green-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ loading ? '儲存中...' : '儲存' }}
          </button>
        </div>

      </div>
    </div>
  </div>
</template>
