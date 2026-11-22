import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'conflict'
  | 'gone'
  | 'internal'
  | 'unavailable'

export function apiError(c: Context, status: ContentfulStatusCode, code: ErrorCode, message: string, extra?: object) {
  return c.json({ error: { code, message, ...extra } }, status)
}

/** service 層丟出的錯誤，由 app.onError 轉成統一的錯誤格式（例如 assertFamilyMember 的 403） */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}
