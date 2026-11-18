// Better Auth 前端（API 的 /v1/auth/*）。session cookie 屬於 API 網域，所以一律帶 credentials。
import { createAuthClient } from 'better-auth/vue'

let client: ReturnType<typeof createAuthClient> | null = null

export function useAuth() {
  if (!client) {
    const { public: cfg } = useRuntimeConfig()
    client = createAuthClient({
      baseURL: cfg.apiBase,
      basePath: '/v1/auth',
      fetchOptions: { credentials: 'include' },
    })
  }
  return client
}

/** 目前登入狀態（reactive）。只在瀏覽器端有效 */
export function useSession() {
  return useAuth().useSession()
}

/** 前端頁面的完整網址（給驗證信、重設密碼信的 callbackURL 使用） */
export function absoluteUrl(path: string) {
  return new URL(path, window.location.origin).toString()
}
