// Better Auth 前端（API 的 /v1/auth/*），和使用者網站共用同一套帳號。
import { createAuthClient } from 'better-auth/vue'

let client: ReturnType<typeof createAuthClient> | null = null

export function useAuth() {
  if (!client) {
    const { public: cfg } = useRuntimeConfig()
    client = createAuthClient({ baseURL: cfg.apiBase, basePath: '/v1/auth', fetchOptions: { credentials: 'include' } })
  }
  return client
}

export type AdminUser = { id: string; name: string; email: string; role: string; emailVerified: boolean }

/** 目前的管理者（middleware 確認過才會有值） */
export const useAdmin = () => useState<AdminUser | null>('admin', () => null)
