<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { Icon } from '@iconify/vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// 電腦版選單：首頁、常見問題、用戶
const desktopMenuItems = [
  { path: '/welfares', name: '首頁', icon: 'mdi:home-search-outline' },
  { path: '/family', name: '常見問題', icon: 'mdi:frequently-asked-questions' },
  { path: '/profile', name: '用戶', icon: 'mdi:account-circle-outline' },
]

// 手機版選單：首頁、阿哞、用戶
const mobileMenuItems = [
  { path: '/chat', name: '阿哞', icon: 'mdi:robot-happy-outline' }, 
  { path: '/welfares', name: '首頁', icon: 'majesticons:home-line' },
  { path: '/profile', name: '用戶', icon: 'ph:user-list' },
]

// 判斷當前路徑是否激活
const isActive = (path: string) => route.path.startsWith(path)

// 登出邏輯
const handleLogout = async () => {
  await userStore.userLogout()
  router.push('/login')
}

// 頁面標題 & 用戶名
const userName = computed(() => userStore.userInfo?.email || 'User')
</script>

<template>
  <div class="min-h-screen w-full flex flex-col">
    <header
      class="hidden md:flex h-16 bg-mygreen sticky top-0 z-50 px-6 items-center justify-between shadow-sm"
    >
      <div class="flex items-center gap-2 cursor-pointer select-none" @click="router.push('/')">
        <Icon icon="mdi:home-heart" class="text-white text-3xl" />
      </div>

      <nav class="flex items-center gap-6">
        <router-link
          v-for="item in desktopMenuItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-2 px-4 py-2 duration-200 group"
          :class="
            isActive(item.path)
              ? ' text-white border-b'
              : ' text-white hover:bg-gray-100 hover:text-gray-900'
          "
        >
          <span>{{ item.name }}</span>
        </router-link>
      </nav>

      <div class="flex items-center">
        <el-dropdown>
          <span
            class="flex items-center gap-2 cursor-pointer text-white hover:text-gray-900 transition-colors"
          >
            <span class="font-medium text-sm">{{ userName }}</span>
            <Icon icon="mdi:chevron-down" />
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="router.push('/profile')">
                <div class="flex items-center gap-2">
                  <Icon icon="mdi:card-account-details-outline" class="text-lg" />
                  <span>個人資料</span>
                </div>
              </el-dropdown-item>

              <el-dropdown-item divided @click="handleLogout">
                <div class="flex items-center gap-2 text-red-500">
                  <Icon icon="mdi:logout" class="text-lg" />
                  <span>登出</span>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <main class="flex-1 w-full max-w-7xl mx-auto p-4 pb-24 md:p-6 md:pb-6">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['WelfareList', 'Chat']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>

    <nav
      class="md:hidden fixed bottom-0 w-full bg-white border-t border-gray-200 flex justify-around items-center z-50 pb-[env(safe-area-inset-bottom)] h-[calc(3.8rem+env(safe-area-inset-bottom))]"
    >
      <router-link
        v-for="item in mobileMenuItems"
        :key="item.path"
        :to="item.path"
        class="flex flex-col items-center justify-center w-full h-full transition-colors duration-200"
        :class="isActive(item.path) ? 'text-mygreen' : 'text-gray-400 hover:text-gray-600'"
      >
        <Icon :icon="item.icon" class="text-2xl mb-1" />

        <span class="text-[10px] font-medium">{{ item.name }}</span>
      </router-link>
    </nav>
  </div>
</template>
