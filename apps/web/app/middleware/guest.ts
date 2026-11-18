// 登入、註冊、忘記密碼：已登入時直接回首頁（v1 router.beforeEach）
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  const { data } = await useAuth().getSession()
  if (data) return navigateTo('/welfares')
})
