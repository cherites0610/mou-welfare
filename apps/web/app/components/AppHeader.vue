<!-- 沿用 v1 web/src/components/AppHeader.vue -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'

const route = useRoute()
const router = useRouter()
const session = useSession()

const publicMenuItems = [
  { path: '/welfares', name: '首頁', icon: 'mdi:home-search-outline' },
  { path: '/question', name: '常見問題', icon: 'mdi:frequently-asked-questions' },
]
const authMenuItems = [{ path: '/profile', name: '用戶', icon: 'mdi:account-circle-outline' }]

const loggedIn = computed(() => !!session.value.data)
const desktopMenuItems = computed(() => (loggedIn.value ? [...publicMenuItems, ...authMenuItems] : publicMenuItems))
const isActive = (path: string) => route.path.startsWith(path)
const userName = computed(() => displayEmail(session.value.data?.user.email) || session.value.data?.user.name || 'User')

const handleLogout = async () => {
  await useAuth().signOut()
  router.push('/welfares')
}
</script>

<template>
  <header class="w-full bg-mygreen sticky top-0 z-50 shadow-sm">
    <div class="max-w-7xl mx-auto h-16 px-6 flex items-center justify-between">
      <div class="flex items-center gap-2 cursor-pointer select-none" @click="router.push('/')">
        <img src="/meta.png" alt="Logo" class="w-8 h-8 rounded-md" />
      </div>

      <nav class="flex items-center gap-6">
        <NuxtLink v-for="item in desktopMenuItems" :key="item.path" :to="item.path"
          class="flex items-center gap-2 px-4 py-2 duration-200 group"
          :class="isActive(item.path) ? 'text-white border-b' : 'text-white hover:bg-gray-100 hover:text-gray-900'">
          <span>{{ item.name }}</span>
        </NuxtLink>
      </nav>

      <div class="flex items-center">
        <ClientOnly>
          <template v-if="loggedIn">
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
            <button @click="router.push('/login')"
              class="flex items-center gap-1.5 px-4 py-1.5 bg-white text-mygreen font-bold text-sm rounded-full hover:bg-green-50 transition-colors">
              <Icon icon="mdi:login" class="text-base" />
              登入
            </button>
          </template>
        </ClientOnly>
      </div>
    </div>
  </header>
</template>
