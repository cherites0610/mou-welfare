<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import { Icon } from '@iconify/vue'
const route = useRoute()

// 手機版選單：首頁、阿哞、用戶
const mobileMenuItems = [
  {
    path: '/chat',
    name: '阿哞',
    icon: 'https://storage.googleapis.com/mou-welfare/web/black-fv.png',
    activeIcon: 'https://storage.googleapis.com/mou-welfare/web/fv.png'
  },
  {
    path: '/welfares',
    name: '首頁',
    icon: 'majesticons:home-line',
    activeIcon: 'majesticons:home'
  },
  {
    path: '/profile',
    name: '用戶',
    icon: 'ph:user-list',
    activeIcon: 'ph:user-list-fill'
  },
]

const getMenuIcon = (item: any) => {
  return isActive(item.path) && item.activeIcon ? item.activeIcon : item.icon
}

// 判斷當前路徑是否激活
const isActive = (path: string) => route.path.startsWith(path)

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
      <router-link v-for="item in mobileMenuItems" :key="item.path" :to="item.path"
        class="flex flex-col items-center justify-center w-full h-full transition-colors duration-200"
        :class="isActive(item.path) ? 'text-mygreen' : 'text-gray-400 hover:text-gray-600'">
        <template v-if="getMenuIcon(item).includes('http')">
          <img :src="getMenuIcon(item)" class="w-6 h-6 mb-1 object-contain" />
        </template>

        <template v-else>
          <Icon :icon="getMenuIcon(item)" class="text-2xl mb-1" />
        </template>

        <span class="text-[10px] font-medium">{{ item.name }}</span>
      </router-link>
    </nav>
  </div>
</template>
