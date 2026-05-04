<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import { useUserStore } from '@/stores/user'
import { Icon } from '@iconify/vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// 手機版選單：首頁、阿哞、用戶
const mobileMenuItems = [
  {
    path: '/chat',
    name: '阿哞',
    icon: 'https://storage.googleapis.com/mou-welfare/web/black-fv.png',
    activeIcon: 'https://storage.googleapis.com/mou-welfare/web/fv.png',
    requiresAuth: true,
  },
  {
    path: '/welfares',
    name: '首頁',
    icon: 'majesticons:home-line',
    activeIcon: 'majesticons:home',
    requiresAuth: false,
  },
  {
    path: '/profile',
    name: '用戶',
    icon: 'ph:user-list',
    activeIcon: 'ph:user-list-fill',
    requiresAuth: true,
  },
]

const getMenuIcon = (item: any) => {
  return isActive(item.path) && item.activeIcon ? item.activeIcon : item.icon
}

const isActive = (path: string) => route.path.startsWith(path)

const handleMenuClick = (item: any) => {
  if (item.requiresAuth && !userStore.token) {
    router.push({ name: 'Login', query: { redirect: item.path } })
    return
  }
  router.push(item.path)
}
</script>

<template>
  <div class="min-h-screen w-full flex flex-col">

    <AppHeader class="hidden md:block" />

    <main class="flex-1 w-full max-w-7xl mx-auto pb-24 md:p-6 md:pb-6">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['WelfareList', 'Chat']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>

    <nav
      class="md:hidden fixed bottom-0 w-full bg-white border-t border-gray-100 flex justify-around items-center z-50 pb-[env(safe-area-inset-bottom)] h-[calc(3.8rem+env(safe-area-inset-bottom))]">
      <button v-for="item in mobileMenuItems" :key="item.path"
        class="flex flex-col items-center justify-center w-full h-full transition-colors duration-200"
        :class="isActive(item.path) ? 'text-mygreen' : 'text-gray-400 hover:text-gray-600'"
        @click="handleMenuClick(item)">
        <template v-if="getMenuIcon(item).includes('http')">
          <img :src="getMenuIcon(item)" class="w-6 h-6 mb-1 object-contain" />
        </template>

        <template v-else>
          <Icon :icon="getMenuIcon(item)" class="text-2xl mb-1" />
        </template>

        <span class="text-[10px] font-medium">{{ item.name }}</span>
      </button>
    </nav>
  </div>
</template>
