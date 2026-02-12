import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useWelfareStore } from '../stores/welfare'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登入', requiresAuth: false }
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('@/layout/index.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'welfares',
        name: 'WelfareList',
        component: () => import('@/views/welfare/index.vue'),
        meta: { title: '福利搜尋', keepAlive: true }
      },
      {
        path: 'welfares/detail',
        name: 'WelfareDetail',
        component: () => import('@/views/welfare/Detail.vue'),
        meta: { title: '福利詳情', requiresAuth: true },
        beforeEnter: (to, from, next) => {
          const welfareStore = useWelfareStore()
          if (!welfareStore.hasCurrentWelfare()) {
            next({ name: 'WelfareList', replace: true })
          } else {
            next()
          }
        }
      },
      {
        path: 'chat',
        name: 'Chat',
        component: () => import('@/views/chat/index.vue'),
        meta: { title: 'AI 助理', keepAlive: true }
      },
      {
        path: 'family',
        name: 'Family',
        component: () => import('@/views/family/index.vue'),
        meta: { title: '我的家庭' }
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/profile/index.vue'),
        meta: { title: '個人設定' }
      },
      {
        path: 'question',
        name: 'Question',
        component: () => import('@/views/question/index.vue'),
        meta: { title: '常見問題' }
      }
    ]
  },
  {
    path: '',
    name: 'Home',
    component: () => import('@/views/home/index.vue'),
    meta: { title: '首頁', requiresAuth: false }
  },
  {
    path: '/question',
    name: 'Question',
    component: () => import('@/views/question/index.vue'),
    meta: { title: '常見問題' }
  },
  {
    path: '/favorites',
    name: 'Favorites',
    component: () => import('@/views/favorites/index.vue'),
    meta: { title: '我的最愛' }
  },
  {
    path: '/private',
    name: 'Private',
    component: () => import('@/views/private/index.vue'),
    meta: { title: '私人頁面' }
  },
  {
    path: '/terms',
    name: 'Terms',
    component: () => import('@/views/terms/index.vue'),
    meta: { title: '服務條款' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, savedPosition) => {
    if (savedPosition) return savedPosition
    return { top: 0 }
  }
})

router.beforeEach((to, from, next) => {
  const userStore = useUserStore()

  if (to.meta.requiresAuth && !userStore.token) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else if (to.name === 'Login' && userStore.token) {
    next('/')
  } else {
    next()
  }
})

export default router
