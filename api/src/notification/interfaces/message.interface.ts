import { NotificationType } from '../entities/notification-log.entity.js'

export interface IBaseMessage {
  type: NotificationType
  to: string
}

export interface IEmailMessage extends IBaseMessage {
  type: NotificationType.EMAIL
  subject: string
  html: string
}

export interface ILineMessage extends IBaseMessage {
  type: NotificationType.LINE
  text: string
}

export type IMessage = IEmailMessage | ILineMessage
