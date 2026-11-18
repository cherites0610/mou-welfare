<!-- 個人設定（完整版面於後續實作；目前提供個人資訊與登出） -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'

definePageMeta({ middleware: 'auth' })
useHead({ title: '個人設定 | 哞福利' })

const router = useRouter()
const session = useSession()
const user = computed(() => session.value.data?.user)

const handleLogout = async () => {
  await useAuth().signOut()
  router.push('/welfares')
}
</script>

<template>
  <div class="min-h-screen bg-white pb-10 font-sans text-gray-800">
    <div class="bg-white md:rounded-3xl p-6 md:p-8 mb-8 border-b md:border border-gray-100 flex items-center gap-4">
      <div class="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-50 p-1 border border-gray-100 shrink-0 overflow-hidden">
        <img :src="user?.image || '/meta.png'" class="w-full h-full rounded-full object-cover bg-white" />
      </div>
      <div class="min-w-0">
        <h1 class="text-2xl md:text-3xl font-bold text-gray-800 truncate">{{ user?.name }}</h1>
        <p class="text-sm text-gray-400 truncate">{{ user?.email }}</p>
      </div>
    </div>

    <div class="px-2 md:px-0">
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
        <button @click="router.push('/register/profile')" class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left">
          <Icon icon="mingcute:edit-line" class="text-xl text-gray-400" />
          <span class="font-bold text-gray-800 flex-1">編輯個人資料</span>
          <Icon icon="mingcute:right-line" class="text-gray-300" />
        </button>
        <button @click="handleLogout" class="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition text-left">
          <Icon icon="mingcute:exit-line" class="text-xl text-red-400" />
          <span class="font-bold text-red-500">登出</span>
        </button>
      </div>
    </div>
  </div>
</template>
