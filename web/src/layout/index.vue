<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// 選單設定
const menuItems = [
  { path: '/welfares', name: '福利搜尋', icon: '🔍' },
  { path: '/chat', name: 'AI 助理', icon: '🤖' },
  { path: '/family', name: '我的家庭', icon: '🏠' },
  { path: '/profile', name: '個人設定', icon: '👤' }
]

// 判斷當前路徑是否激活 (包含子路徑)
const isActive = (path: string) => {
  return route.path.startsWith(path)
}

// 登出邏輯
const handleLogout = async () => {
  await userStore.userLogout()
  router.push('/login')
}

// 取得當前頁面標題
const pageTitle = computed(() => route.meta.title || '福利系統')

// 取得使用者名稱 (若無則顯示預設)
const userName = computed(() => userStore.userInfo?.email || 'User')
</script>

<template>
  <div class="layout-container">
    <aside class="sidebar">
      <div class="logo-area">
        <h2>福利小幫手</h2>
      </div>

      <nav class="nav-menu">
        <router-link
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
        >
          <span class="icon">{{ item.icon }}</span>
          <span class="text">{{ item.name }}</span>
        </router-link>
      </nav>

      <div class="user-area">
        <div class="user-info">
          <span>{{ userName }}</span>
        </div>
        <button class="logout-btn" @click="handleLogout">登出</button>
      </div>
    </aside>

    <main class="main-content">
      <header class="top-header">
        <h3>{{ pageTitle }}</h3>
      </header>

      <div class="page-view">
        <router-view v-slot="{ Component }">
          <keep-alive :include="['WelfareList', 'Chat']">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* 基礎 Layout 樣式 - 你可以隨意替換成 Tailwind 或 ElementPlus */

.layout-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: #f5f7fa;
  color: #333;
}

/* Sidebar */
.sidebar {
  width: 260px;
  background-color: #ffffff;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.logo-area {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #e0e0e0;
  color: #409eff;
}

.nav-menu {
  flex: 1;
  padding: 20px 0;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 12px 24px;
  color: #606266;
  text-decoration: none;
  transition: all 0.3s;
  cursor: pointer;
  font-size: 16px;
}

.nav-item:hover {
  background-color: #f0f9eb;
  color: #409eff;
}

.nav-item.active {
  background-color: #ecf5ff;
  color: #409eff;
  border-right: 3px solid #409eff;
}

.nav-item .icon {
  margin-right: 12px;
}

.user-area {
  padding: 20px;
  border-top: 1px solid #e0e0e0;
  text-align: center;
}

.user-info {
  margin-bottom: 10px;
  font-weight: bold;
  color: #303133;
}

.logout-btn {
  width: 100%;
  padding: 8px;
  background-color: #f56c6c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.logout-btn:hover {
  background-color: #f78989;
}

/* Main Content */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 防止整個頁面捲動 */
}

.top-header {
  height: 64px;
  background-color: #ffffff;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  padding: 0 24px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}

.page-view {
  flex: 1;
  padding: 24px;
  overflow-y: auto; /* 內容區獨立捲動 */
}
</style>
