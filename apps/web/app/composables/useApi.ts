// 呼叫 v2 API（非 /v1/auth 的部分），錯誤統一轉成中文訊息。
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
