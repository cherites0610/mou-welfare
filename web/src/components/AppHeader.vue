<script setup lang="ts">
import { useSession } from '@/composables/useSession'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const { clearSession } = useSession()

const publicMenuItems = [
  { path: '/welfares', name: '首頁', icon: 'mdi:home-search-outline' },
  { path: '/question', name: '常見問題', icon: 'mdi:frequently-asked-questions' },
]

const authMenuItems = [
  { path: '/profile', name: '用戶', icon: 'mdi:account-circle-outline' },
]

const desktopMenuItems = computed(() =>
  userStore.token ? [...publicMenuItems, ...authMenuItems] : publicMenuItems
)

const isActive = (path: string) => route.path.startsWith(path)

const handleLogout = async () => {
  await userStore.userLogout()
  clearSession()
}

const userName = computed(() => userStore.userInfo?.email || 'User')
</script>

<template>
  <header class="w-full bg-mygreen sticky top-0 z-50 shadow-sm">
      <div class="max-w-7xl mx-auto h-16 px-6 flex items-center justify-between">
        <div class="flex items-center gap-2 cursor-pointer select-none" @click="router.push('/')">
          <img src="https://storage.googleapis.com/mou-welfare/web/meta.png" alt="Logo" class="w-8 h-8 rounded-md" />
        </div>

        <nav class="flex items-center gap-6">
          <router-link
            v-for="item in desktopMenuItems"
            :key="item.path"
            :to="item.path"
            class="flex items-center gap-2 px-4 py-2 duration-200 group"
            :class="isActive(item.path) ? 'text-white border-b' : 'text-white hover:bg-gray-100 hover:text-gray-900'"
          >
            <span>{{ item.name }}</span>
          </router-link>
        </nav>

        <div class="flex items-center">
          <template v-if="userStore.token">
            <el-dropdown>
              <span class="flex items-center gap-2 cursor-pointer text-white hover:text-gray-900 transition-colors">
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
          </template>
          <template v-else>
            <button @click="router.push({ name: 'Login' })"
              class="flex items-center gap-1.5 px-4 py-1.5 bg-white text-mygreen font-bold text-sm rounded-full hover:bg-green-50 transition-colors">
              <Icon icon="mdi:login" class="text-base" />
              登入
            </button>
          </template>
        </div>
      </div>
  </header>
</template>