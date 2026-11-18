<!-- 沿用 v1 web/src/layout/index.vue（桌機頂部 Header + 手機底部導航） -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'

const route = useRoute()
const router = useRouter()
const session = useSession()

const mobileMenuItems = [
  { path: '/chat', name: '阿哞', icon: '/black-fv.png', activeIcon: '/fv.png', requiresAuth: true, image: true },
  { path: '/welfares', name: '首頁', icon: 'majesticons:home-line', activeIcon: 'majesticons:home', requiresAuth: false, image: false },
  { path: '/profile', name: '用戶', icon: 'ph:user-list', activeIcon: 'ph:user-list-fill', requiresAuth: true, image: false },
]

const isActive = (path: string) => route.path.startsWith(path)
const getMenuIcon = (item: (typeof mobileMenuItems)[number]) => (isActive(item.path) ? item.activeIcon : item.icon)

const handleMenuClick = (item: (typeof mobileMenuItems)[number]) => {
  if (item.requiresAuth && !session.value.data) {
    router.push({ path: '/login', query: { redirect: item.path } })
    return
  }
  router.push(item.path)
}
</script>

<template>
  <div class="min-h-screen w-full flex flex-col">
    <AppHeader class="hidden md:block" />

    <main class="flex-1 w-full max-w-7xl mx-auto pb-24 md:p-6 md:pb-6">
      <slot />
    </main>

    <nav
      class="md:hidden fixed bottom-0 w-full bg-white border-t border-gray-100 flex justify-around items-center z-50 pb-[env(safe-area-inset-bottom)] h-[calc(3.8rem+env(safe-area-inset-bottom))]"
      style="transform: translateZ(0); will-change: transform;">
      <button v-for="item in mobileMenuItems" :key="item.path"
        class="flex flex-col items-center justify-center w-full h-full transition-colors duration-200"
        :class="isActive(item.path) ? 'text-mygreen' : 'text-gray-400 hover:text-gray-600'"
        @click="handleMenuClick(item)">
        <img v-if="item.image" :src="getMenuIcon(item)" class="w-6 h-6 mb-1 object-contain" />
        <Icon v-else :icon="getMenuIcon(item)" class="text-2xl mb-1" />
        <span class="text-[10px] font-medium">{{ item.name }}</span>
      </button>
    </nav>
  </div>
</template>
