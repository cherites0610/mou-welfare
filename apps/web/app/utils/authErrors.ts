// Better Auth 錯誤代碼 → 中文訊息
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: '帳號或密碼錯誤',
  EMAIL_NOT_VERIFIED: '信箱尚未驗證，請先點擊驗證信中的連結',
  USER_ALREADY_EXISTS: '此信箱已註冊',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '此信箱已註冊',
  PASSWORD_TOO_SHORT: '密碼至少需要 8 個字元',
  PASSWORD_TOO_LONG: '密碼過長',
  INVALID_EMAIL: '信箱格式不正確',
  INVALID_TOKEN: '連結無效或已過期，請重新申請',
}

export function authErrorMessage(err: { code?: string; status?: number; message?: string } | null | undefined, fallback: string) {
  if (!err) return fallback
  if (err.status === 429) return '嘗試次數過多，請稍後再試'
  return (err.code && MESSAGES[err.code]) || fallback
}
