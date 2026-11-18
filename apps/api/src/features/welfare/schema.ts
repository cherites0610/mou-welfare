import { z } from '@hono/zod-openapi'
import { CATEGORIES, CITIES, GENDERS, SPECIAL_IDENTITIES } from '@mou-welfare/shared'

/** 逗號分隔的白名單值，例如 `city=臺北市,新北市` */
const csvOf = (allowed: readonly string[], name: string) =>
  z
    .string()
    .optional()
    .refine((v) => !v || v.split(',').every((x) => allowed.includes(x.trim())), { message: `${name} 含有不支援的值` })
    .openapi({ description: `逗號分隔，可選值：${allowed.join('、')}` })

export const splitCsv = (v: string | undefined) => (v ? v.split(',').map((x) => x.trim()) : undefined)

export const SearchQuery = z.object({
  q: z.string().trim().min(1).max(50).optional(),
  city: csvOf(CITIES, 'city'),
  category: csvOf(CATEGORIES, 'category'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const MatchResultSchema = z
  .object({
    light: z.enum(['GREEN', 'YELLOW', 'RED']),
    score: z.number(),
    reasons: z.array(z.string()),
  })
  .openapi('MatchResult')

export const WelfareSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    city: z.string(),
    categories: z.array(z.string()),
    identities: z.array(z.string()),
    summary: z.string(),
    publishedAt: z.string().nullable(),
    deadline: z.string().nullable(),
    match: MatchResultSchema.nullable().openapi({ description: '登入或試算時才有' }),
  })
  .openapi('WelfareSummary')

export const WelfareListSchema = z.object({
  data: z.array(WelfareSummarySchema),
  meta: z.object({ page: z.number(), limit: z.number(), total: z.number() }),
})

export const WelfareDetailSchema = WelfareSummarySchema.extend({
  requirements: z.array(z.string()),
  rewards: z.array(z.string()),
  contentMd: z.string(),
  sourceUrl: z.string(),
  expired: z.boolean(),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })),
  isFavorite: z.boolean().nullable().openapi({ description: '未登入時為 null' }),
}).openapi('WelfareDetail')

const isoDate = z.iso.date()

export const ProfileInput = z
  .object({
    birthday: isoDate.nullable().optional(),
    gender: z.enum(GENDERS).nullable().optional(),
    identities: z.array(z.enum(SPECIAL_IDENTITIES)).max(SPECIAL_IDENTITIES.length).optional(),
  })
  .openapi('ProfileInput')

export const SimulateBody = SearchQuery.omit({ page: true, limit: true })
  .extend({
    profile: ProfileInput,
    page: z.number().int().min(1).max(1000).default(1),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .openapi('SimulateBody')
