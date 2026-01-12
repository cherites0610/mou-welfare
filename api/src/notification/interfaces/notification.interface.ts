export enum NotificationType {
  EMAIL = 'EMAIL',
  LINE = 'LINE',
}

export interface EmailJobData {
  type: NotificationType.EMAIL
  to: string
  subject: string
  html: string
}

export interface LineJobData {
  type: NotificationType.LINE
  to: string
  message: string
}

export type NotificationJobData = EmailJobData | LineJobData
