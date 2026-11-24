import { z } from '@hono/zod-openapi'
import { CATEGORIES, CITIES, GENDERS, IDENTITIES, NATIONAL, TOPIC_SLUGS } from '@mou-welfare/shared'

/** 逗號分隔的白名單值，例如 `city=臺北市,新北市` */
const csvOf = (allowed: readonly string[], name: string) =>
  z
    .string()
    .optional()
    .refine((v) => !v || v.split(',').every((x) => allowed.includes(x.trim())), { message: `${name} 含有不支援的值` })
    .openapi({ description: `逗號分隔，可選值：${allowed.join('、')}` })

/** 家庭模式：附上家人的資格比對。需登入且為該家庭成員，否則 401 / 403（R6） */
export const FamilyIdQuery = z
  .uuid()
  .optional()
  .openapi({ description: '家庭模式：附上家人的資格比對（需登入且為成員）' })

export const splitCsv = (v: string | undefined) => (v ? v.split(',').map((x) => x.trim()) : undefined)

export const SearchQuery = z.object({
  q: z.string().trim().min(1).max(50).optional(),
  city: csvOf([...CITIES, NATIONAL], 'city'),
  category: csvOf(CATEGORIES, 'category'),
  topic: z.enum(TOPIC_SLUGS).optional().openapi({ description: '人生階段主題（packages/shared/src/topics.ts）' }),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  familyId: FamilyIdQuery,
})

export const MatchResultSchema = z
  .object({
    light: z.enum(['GREEN', 'YELLOW', 'RED']),
    score: z.number(),
    reasons: z.array(z.string()),
  })
  .openapi('MatchResult')

export const FamilyMatchSchema = z
  .object({ userId: z.string(), name: z.string(), image: z.string().nullable(), match: MatchResultSchema })
  .openapi('FamilyMatch')

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
    familyMatches: z
      .array(FamilyMatchSchema)
      .nullable()
      .openapi({ description: '帶 familyId 時才有：家人（不含自己）的比對結果' }),
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
    // 試算可以直接指定年齡組與性別（v1 的「進階篩選」），不必提供生日
    identities: z.array(z.enum(IDENTITIES)).max(IDENTITIES.length).optional(),
  })
  .openapi('ProfileInput')

export const SimulateBody = SearchQuery.omit({ page: true, limit: true, familyId: true })
  .extend({
    profile: ProfileInput,
    page: z.number().int().min(1).max(1000).default(1),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .openapi('SimulateBody')
