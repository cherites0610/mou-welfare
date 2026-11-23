// 信件範本（繁體中文）。連結一律放在按鈕與純文字兩處，方便無法顯示 HTML 的信箱。
import type { Mail } from './index.ts'

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function layout(title: string, body: string, action: { label: string; url: string }) {
  const url = escape(action.url)
  return `<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#f7f7f5;font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;color:#1f2937">${escape(title)}</td></tr>
<tr><td style="padding:16px 0;font-size:15px;line-height:1.7;color:#374151">${body}</td></tr>
<tr><td><a href="${url}" style="display:inline-block;background:#92c700;color:#fff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:999px">${escape(action.label)}</a></td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#9ca3af;line-height:1.6">按鈕無法使用時，請複製以下連結到瀏覽器：<br>${url}<br><br>如果你沒有提出這個要求，請忽略這封信。</td></tr>
</table><p style="font-size:12px;color:#9ca3af">哞福利｜一站式政府福利查詢平台</p></td></tr></table></body></html>`
}

export function verificationMail(to: string, name: string, url: string): Mail {
  return {
    to,
    subject: '【哞福利】請驗證你的電子信箱',
    html: layout(`${name}，歡迎加入哞福利`, '請點擊下方按鈕完成信箱驗證，連結 1 小時內有效。', { label: '驗證信箱', url }),
    text: `${name}，歡迎加入哞福利。\n請開啟以下連結完成信箱驗證（1 小時內有效）：\n${url}\n\n如果你沒有註冊，請忽略這封信。`,
  }
}

/** hasPassword=false：第三方登入的帳號第一次設定密碼（同一個重設流程，Better Auth 會建立密碼） */
export function resetPasswordMail(to: string, name: string, url: string, hasPassword = true): Mail {
  if (!hasPassword) {
    return {
      to,
      subject: '【哞福利】設定密碼',
      html: layout('設定你的密碼', `${escape(name)} 你好，請點擊下方按鈕設定密碼，設定後也可以用信箱和密碼登入。連結 1 小時內有效。`, {
        label: '設定密碼',
        url,
      }),
      text: `${name} 你好，請開啟以下連結設定密碼（1 小時內有效），設定後也可以用信箱和密碼登入：\n${url}\n\n如果你沒有提出這個要求，請忽略這封信。`,
    }
  }
  return {
    to,
    subject: '【哞福利】重設密碼',
    html: layout('重設你的密碼', `${escape(name)} 你好，我們收到重設密碼的要求。請點擊下方按鈕設定新密碼，連結 1 小時內有效。`, {
      label: '重設密碼',
      url,
    }),
    text: `${name} 你好，請開啟以下連結重設密碼（1 小時內有效）：\n${url}\n\n如果你沒有提出這個要求，請忽略這封信，你的密碼不會被變更。`,
  }
}
