// 第三方登入（Google / LINE；LIFF 見 plugins/liff.client.ts）。docs/backend.md §8.5.1
// 一律導回 /oauth-callback，由那裡決定去「填寫個人資料」還是回到原頁面。

export type SocialProvider = 'google' | 'line'
export const PROVIDER_LABEL: Record<SocialProvider, string> = { google: 'Google', line: 'LINE' }

/** LINE 沒有提供 email 時，後端用的替代地址（apps/api/src/lib/auth.ts）；畫面上不顯示 */
export const isPlaceholderEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith('@line.invalid')
export const displayEmail = (email?: string | null) => (isPlaceholderEmail(email) ? '' : email ?? '')

/** 只接受站內路徑，避免開放式重新導向 */
export const safeRedirect = (p: unknown, fallback = '/welfares') =>
  typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : fallback

/** 從未填過個人資料（第三方登入的新帳號，或註冊後跳過填寫）→ 導到填寫頁 */
export const needsProfile = (me: { birthday: string | null; gender: string | null; city: string | null }) =>
  !me.birthday && !me.gender && !me.city

const OAUTH_ERRORS: Record<string, string> = {
  account_not_linked: '這個信箱已用其他方式註冊，請先用原本的方式登入，再到「個人設定」綁定',
  unable_to_link_account: '無法綁定這個帳號，請改用原本的登入方式',
  account_already_linked_to_different_user: '這個帳號已經綁定到另一位使用者',
  email_not_found: '無法取得信箱，請改用其他登入方式',
  oauth_provider_not_found: '即將開放，請先使用信箱登入',
  PROVIDER_NOT_FOUND: '即將開放，請先使用信箱登入',
  access_denied: '已取消登入',
}

/** OAuth 回呼的 ?error=（Better Auth 部分代碼含空白，統一轉成底線） */
export const oauthErrorMessage = (code: string) =>
  OAUTH_ERRORS[code.replace(/\s+/g, '_')] ?? '第三方登入失敗，請稍後再試'

/** 轉址到 Google / LINE 登入。成功後回到 /oauth-callback，失敗回到 errorPath（附 ?error=） */
export async function startSocialLogin(provider: SocialProvider, opts: { redirect?: string; errorPath?: string } = {}) {
  const callback = new URL(absoluteUrl('/oauth-callback'))
  if (opts.redirect) callback.searchParams.set('redirect', safeRedirect(opts.redirect))
  const { error } = await useAuth().signIn.social({
    provider,
    callbackURL: callback.toString(),
    errorCallbackURL: absoluteUrl(opts.errorPath ?? '/login'),
  })
  // 成功時 Better Auth client 會直接轉址；這裡只會拿到錯誤（例如尚未設定金鑰 → 404）
  if (error) ElMessage.error(oauthErrorMessage(error.code ?? (error.status === 404 ? 'PROVIDER_NOT_FOUND' : '')))
}

/** 個人設定頁：把 Google / LINE 綁定到目前的帳號，完成後回到個人設定 */
export async function linkSocial(provider: SocialProvider) {
  const { error } = await useAuth().linkSocial({
    provider,
    callbackURL: absoluteUrl('/profile?linked=' + provider),
    errorCallbackURL: absoluteUrl('/profile'),
  })
  if (error) ElMessage.error(oauthErrorMessage(error.code ?? (error.status === 404 ? 'PROVIDER_NOT_FOUND' : '')))
}
