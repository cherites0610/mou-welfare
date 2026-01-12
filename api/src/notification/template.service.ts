import { Injectable } from '@nestjs/common'
import { IEmailMessage, ILineMessage } from './interfaces/message.interface.js'
import { NotificationType } from './interfaces/notification.interface.js'
import { TemplateName } from './templates/notification-templates.js'

@Injectable()
export class TemplateService {

  buildEmail(
    to: string,
    templateName: TemplateName,
    data: any,
  ): IEmailMessage {
    let subject = ''
    let html = ''

    switch (templateName) {
      case TemplateName.REGISTER_VERIFICATION:
        subject = '【系統驗證】您的註冊驗證碼'
        html = `<p>您的驗證碼是：<strong>${data.code}</strong></p><p>請在 5 分鐘內輸入。</p>`
        break
      case TemplateName.RESET_PASSWORD:
        subject = '【安全通知】重設密碼驗證'
        html = `<p>您正在申請重設密碼，驗證碼：<strong>${data.code}</strong></p>`
        break
      case TemplateName.WELCOME_FAMILY:
        subject = '歡迎加入家庭！'
        html = `<p>歡迎加入家庭！您的身份是：${data.role}</p>`
        break
      default:
        throw new Error(`Unknown email template: ${templateName}`)
    }

    return { type: NotificationType.EMAIL, to, subject, html }
  }

  buildLine(
    to: string,
    templateName: TemplateName,
    data: any,
  ): ILineMessage {
    let text = ''

    switch (templateName) {
      case TemplateName.WELCOME_FAMILY:
        text = `歡迎加入家庭！您的身份是：${data.role}`
        break
      default:
        throw new Error(`Unknown LINE template: ${templateName}`)
    }

    return { type: NotificationType.LINE, to, text }
  }
}
