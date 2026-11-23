<script setup lang="ts">
const route = useRoute()
const admin = useAdmin()
const menu = [
  { path: '/', label: '總覽', icon: 'mdi:view-dashboard-outline' },
  { path: '/welfare', label: '福利', icon: 'mdi:file-document-multiple-outline' },
  { path: '/llm', label: 'LLM 用量', icon: 'mdi:robot-outline' },
  { path: '/users', label: '使用者', icon: 'mdi:account-group-outline' },
  { path: '/audit', label: '稽核紀錄', icon: 'mdi:shield-search' },
]
const active = computed(() => menu.find((m) => (m.path === '/' ? route.path === '/' : route.path.startsWith(m.path)))?.path ?? '/')

async function logout() {
  await useAuth().signOut()
  admin.value = null
  await navigateTo('/login')
}
</script>

<template>
  <div v-if="route.path === '/login'"><slot /></div>
  <div v-else class="flex min-h-screen">
    <aside class="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div class="flex items-center gap-2 px-4 h-14 border-b border-gray-200">
        <img src="/logo.png" alt="" class="h-7" />
        <span class="font-bold">哞福利後台</span>
      </div>
      <nav class="flex-1 py-2">
        <NuxtLink
          v-for="m in menu"
          :key="m.path"
          :to="m.path"
          class="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50"
          :class="active === m.path ? 'text-mygreen-300 font-bold bg-[#f4fae6]' : 'text-gray-700'"
        >
          <Icon :icon="m.icon" class="text-lg" />{{ m.label }}
        </NuxtLink>
      </nav>
      <div class="p-4 border-t border-gray-200 text-xs text-gray-500">
        <div class="truncate mb-2">{{ admin?.email }}</div>
        <el-button size="small" @click="logout">登出</el-button>
      </div>
    </aside>
    <main class="flex-1 min-w-0 p-6"><slot /></main>
  </div>
</template>
