// 除了登入頁，都要是 Email 已驗證的管理者。API 端（access.ts 的 'admin'）也會再檢查，這裡只是導向。
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return
  const admin = useAdmin()
  if (admin.value) return
  const { data } = await useAuth().getSession()
  const u = data?.user as AdminUser | undefined
  if (!u) return navigateTo({ path: '/login', query: { next: to.fullPath } })
  if (u.role !== 'admin' || !u.emailVerified) return navigateTo({ path: '/login', query: { denied: '1' } })
  admin.value = u
})
