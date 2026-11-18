import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type ErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'invalid_request' | 'internal' | 'unavailable'

export function apiError(c: Context, status: ContentfulStatusCode, code: ErrorCode, message: string, extra?: object) {
  return c.json({ error: { code, message, ...extra } }, status)
}
