// LIFF 自動登入（沿用 v1 App.vue 的行為；docs/backend.md §8.5.1）。
// 只在 LINE 內透過 LIFF 網址開啟時執行：取 LIFF 的 ID Token 交給 Better Auth（POST /v1/auth/sign-in/social），
// API 端向 LINE /verify 驗證，aud 必須是 LINE_CHANNEL_ID。一般瀏覽器完全不會載入 LIFF SDK。
const RETRY_KEY = 'liff:relogin'

export default defineNuxtPlugin((nuxtApp) => {
  const { liffId } = useRuntimeConfig().public
  if (!liffId || !/\bLine\//i.test(navigator.userAgent)) return

  // 不阻塞首頁渲染：掛載後才載入 SDK
  nuxtApp.hook('app:mounted', () => {
    void nuxtApp.runWithContext(() => signInWithLiff(liffId, nuxtApp.$router))
  })
})

async function signInWithLiff(liffId: string, router: ReturnType<typeof useRouter>) {
  // composable 要在第一個 await 之前取得（之後就不在 Nuxt context 內）
  const auth = useAuth()
  const { refresh } = useMe()
  const { default: liff } = await import('@line/liff')
  try {
    await liff.init({ liffId })
  } catch {
    return
  }
  if (!liff.isInClient()) return

  if ((await auth.getSession()).data) return
  if (!liff.isLoggedIn()) return liff.login({ redirectUri: location.href })

  const token = liff.getIDToken()
  if (!token) return
  const { error } = await auth.signIn.social({ provider: 'line', idToken: { token } })
  if (error) {
    // ID Token 過期：登出 LIFF 再登入一次換新的；只重試一次，避免無限轉址
    if (error.code === 'INVALID_TOKEN' && !sessionStorage.getItem(RETRY_KEY)) {
      sessionStorage.setItem(RETRY_KEY, '1')
      liff.logout()
      return liff.login({ redirectUri: location.href })
    }
    sessionStorage.removeItem(RETRY_KEY)
    return router.replace({ path: '/login', query: { error: error.code === 'OAUTH_LINK_ERROR' ? 'account_not_linked' : 'liff' } })
  }
  sessionStorage.removeItem(RETRY_KEY)
  // 新帳號先填個人資料；否則留在原頁面（例如從 LINE 分享的福利連結進來）
  const me = await refresh().catch(() => null)
  if (me && needsProfile(me)) router.replace('/register/profile')
  else if (['/login', '/register'].includes(router.currentRoute.value.path)) router.replace('/welfares')
}
