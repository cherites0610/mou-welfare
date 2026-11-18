// 寄信介面。正式環境用 Resend（MAIL_DRIVER=resend）；開發用 log；測試用 MemoryMailer 收集寄出的信。
export type Mail = { to: string; subject: string; html: string; text: string }

export interface Mailer {
  send(mail: Mail): Promise<void>
}

export class MailError extends Error {}

export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(mail: Mail): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      // 不把回應內容原樣往外丟，避免洩漏金鑰相關訊息；只記錄狀態碼與錯誤名稱
      const body = (await res.json().catch(() => ({}))) as { name?: string }
      throw new MailError(`Resend ${res.status} ${body.name ?? ''}`.trim())
    }
  }
}

export class LogMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`)
  }
}

export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = []
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail)
  }
  last(to?: string): Mail | undefined {
    return [...this.sent].reverse().find((m) => !to || m.to === to)
  }
}
