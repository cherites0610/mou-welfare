// 呼叫 API（session cookie 在 API 網域，一律帶 credentials），錯誤統一轉成中文訊息。
type ApiError = { error?: { code?: string; message?: string } }

export function useApi() {
  const { public: cfg } = useRuntimeConfig()
  return $fetch.create({
    baseURL: cfg.apiBase,
    credentials: 'include',
    onResponseError({ response }) {
      const msg = (response._data as ApiError | undefined)?.error?.message
      throw new Error(msg || `請求失敗（${response.status}）`)
    },
  })
}
