// 需登入的頁面：未登入導向登入頁，登入後回到原頁面（v1 router 的 requiresAuth）
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const { data } = await useAuth().getSession()
  if (!data) return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
})
