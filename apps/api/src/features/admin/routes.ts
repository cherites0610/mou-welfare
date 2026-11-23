import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { AppEnv } from '../../app.ts'
import { WELFARE_STATUSES } from '../../db/schema/index.ts'
import {
  type Admin,
  getUser,
  getWelfare,
  listAudit,
  listUsers,
  listWelfare,
  llmUsage,
  overview,
  restructure,
  updateWelfare,
} from './service.ts'

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { 'application/json': { schema } } })
const err = (d: string) => json(ErrorSchema, d)
const tags = ['admin']
const common = { 401: err('未登入'), 403: err('不是管理者') }
const Paging = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(30) }
const Meta = z.object({ page: z.number(), limit: z.number(), total: z.number() })
const bool = z.enum(['true', 'false']).transform((v) => v === 'true').optional()
const ts = z.string().nullable()

const Overview = z
  .object({
    welfare: z.object({
      byCity: z.array(z.object({ city: z.string(), active: z.number(), rejected: z.number(), expired: z.number(), pending: z.number() })),
      structure: z.object({
        llm: z.number(), rules: z.number(), unstructured: z.number(), errors: z.number(), overridden: z.number(), reviewed: z.number(),
      }),
      versions: z.array(z.object({ model: z.string().nullable(), promptVersion: z.string().nullable(), count: z.number() })),
    }),
    llm: z.object({
      paused: z.object({ at: z.string(), reason: z.string(), probedAt: ts }).nullable(),
      daily: z.array(z.object({
        day: z.string(), calls: z.number(), errors: z.number(), inputTokens: z.number(), outputTokens: z.number(),
        thoughtsTokens: z.number(), costUsd: z.number(),
      })),
      total: z.object({ calls: z.number(), inputTokens: z.number(), outputTokens: z.number(), costUsd: z.number() }),
    }),
    users: z.object({
      total: z.number(), verified: z.number(), new7d: z.number(), new30d: z.number(), subscribed: z.number(),
      favorites: z.number(), families: z.number(),
    }),
    sources: z.object({ sites: z.array(z.object({ siteId: z.string(), programs: z.number(), lastSeenAt: ts })), lastIngestAt: ts }),
  })
  .openapi('AdminOverview')

const Status = z.enum(WELFARE_STATUSES)
const WelfareRow = z
  .object({
    id: z.string(), name: z.string(), city: z.string(), siteId: z.string().nullable(), status: Status,
    statusOverride: z.enum(['active', 'rejected']).nullable(), categories: z.array(z.string()), identities: z.array(z.string()),
    summary: z.string(), deadline: z.string().nullable(), structuredBy: z.enum(['llm', 'rules']).nullable(),
    structuredModel: z.string().nullable(), structuredAt: ts, hasError: z.boolean(), reviewedAt: ts, pinnedAt: ts,
    sourceUrl: z.string(), updatedAt: z.string(),
  })
  .openapi('AdminWelfareRow')

const LlmCall = z.object({
  id: z.number(), at: z.string(), purpose: z.string(), programId: z.string().nullable(), model: z.string(),
  promptVersion: z.string().nullable(), attempt: z.number(), inputTokens: z.number().nullable(), outputTokens: z.number().nullable(),
  thoughtsTokens: z.number().nullable(), latencyMs: z.number(), ok: z.boolean(), errorKind: z.string().nullable(),
  error: z.string().nullable(), costUsd: z.number().nullable(),
}).openapi('AdminLlmCall')

const Audit = z.object({
  id: z.number(), at: z.string(), adminId: z.string(), adminEmail: z.string(), action: z.string(), targetType: z.string(),
  targetId: z.string(), detail: z.record(z.string(), z.unknown()), ip: z.string().nullable(),
}).openapi('AdminAudit')

const WelfareDetail = z
  .object({
    id: z.string(), programKey: z.string(), city: z.string(), name: z.string(), categories: z.array(z.string()),
    identities: z.array(z.string()), summary: z.string(), requirements: z.array(z.string()), rewards: z.array(z.string()),
    contentMd: z.string(), sourceUrl: z.string(), sourceKind: z.string(), publishedAt: z.string().nullable(), deadline: z.string().nullable(),
    status: Status, siteId: z.string().nullable(), contentHash: z.string().nullable(), sourceFields: z.record(z.string(), z.unknown()),
    structuredHash: z.string().nullable(), structuredBy: z.enum(['llm', 'rules']).nullable(), structuredAt: ts,
    structuredModel: z.string().nullable(), structuredPromptVersion: z.string().nullable(),
    statusOverride: z.enum(['active', 'rejected']).nullable(), reviewedBy: z.string().nullable(), reviewedAt: ts,
    reviewNote: z.string().nullable(), pinnedAt: ts, structureError: z.string().nullable(), hasEmbedding: z.boolean(),
    createdAt: z.string(), updatedAt: z.string(),
    attachments: z.array(z.object({ name: z.string(), url: z.string(), text: z.string() })),
    sources: z.array(z.object({ url: z.string(), siteId: z.string(), firstSeenAt: z.string(), lastSeenAt: z.string() })),
    llmCalls: z.array(LlmCall),
    history: z.array(Audit),
  })
  .openapi('AdminWelfareDetail')

const WelfarePatch = z
  .object({
    statusOverride: z.enum(['active', 'rejected']).nullable().optional().describe('人工判定；null 取消覆寫，交給結構化重新判斷'),
    note: z.string().trim().max(500).nullable().optional(),
    pinned: z.boolean().optional(),
  })
  .strict()
  .openapi('AdminWelfarePatch')

const UserRow = z.object({
  id: z.string(), name: z.string(), email: z.string(), emailVerified: z.boolean(), role: z.string(), createdAt: z.string(),
  providers: z.array(z.string()),
}).openapi('AdminUserRow')

const UserDetail = z.object({
  id: z.string(), name: z.string(), email: z.string(), emailVerified: z.boolean(), image: z.string().nullable(), role: z.string(),
  birthday: z.string().nullable(), gender: z.string().nullable(), city: z.string().nullable(), identities: z.array(z.string()),
  isSubscribed: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
  providers: z.array(z.object({ providerId: z.string(), linkedAt: z.string() })),
  families: z.array(z.object({ id: z.string(), name: z.string(), role: z.string(), joinedAt: z.string(), memberCount: z.number() })),
  favorites: z.number(), activeSessions: z.number(), lastActiveAt: ts,
}).openapi('AdminUserDetail')

const LlmUsage = z.object({
  rows: z.array(z.object({
    day: z.string(), purpose: z.string(), model: z.string(), calls: z.number(), errors: z.number(), inputTokens: z.number(),
    outputTokens: z.number(), thoughtsTokens: z.number(), costUsd: z.number(), avgLatencyMs: z.number(),
  })),
  errors: z.array(z.object({ kind: z.string(), count: z.number(), lastAt: z.string(), sample: z.string() })),
  topPrograms: z.array(z.object({ programId: z.string(), name: z.string(), city: z.string(), calls: z.number(), costUsd: z.number() })),
}).openapi('AdminLlmUsage')

const Id = z.object({ id: z.uuid() })

const routes = {
  overview: createRoute({ method: 'get', path: '/v1/admin/overview', tags, summary: '總覽統計',
    responses: { 200: json(z.object({ data: Overview }), '總覽'), ...common } }),
  welfareList: createRoute({ method: 'get', path: '/v1/admin/welfare', tags, summary: '福利列表（含非福利、規則版）',
    request: { query: z.object({
      q: z.string().trim().max(100).optional(), city: z.string().max(10).optional(), status: Status.optional(),
      structuredBy: z.enum(['llm', 'rules', 'none']).optional(), reviewed: bool, error: bool, ...Paging,
    }) },
    responses: { 200: json(z.object({ data: z.array(WelfareRow), meta: Meta }), '福利列表'), ...common } }),
  welfareDetail: createRoute({ method: 'get', path: '/v1/admin/welfare/{id}', tags, summary: '福利完整資料（原文、附件、LLM 呼叫、修改紀錄）',
    request: { params: Id }, responses: { 200: json(z.object({ data: WelfareDetail }), '福利'), ...common, 404: err('不存在') } }),
  welfarePatch: createRoute({ method: 'patch', path: '/v1/admin/welfare/{id}', tags,
    summary: '人工修正（狀態覆寫、備註、置頂）；寫入稽核紀錄',
    request: { params: Id, body: { content: { 'application/json': { schema: WelfarePatch } }, required: true } },
    responses: { 200: json(z.object({ data: WelfareDetail }), '修改後的福利'), ...common, 404: err('不存在'), 409: err('已下架') } }),
  welfareRestructure: createRoute({ method: 'post', path: '/v1/admin/welfare/{id}/restructure', tags,
    summary: '重新結構化這一筆（排入佇列，約 0.0024 美元）', request: { params: Id },
    responses: { 202: { description: '已排入' }, ...common, 404: err('不存在'), 409: err('已下架') } }),
  llmUsage: createRoute({ method: 'get', path: '/v1/admin/llm-usage', tags, summary: 'LLM 用量（依日期／用途／模型）',
    request: { query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) },
    responses: { 200: json(z.object({ data: LlmUsage }), '用量'), ...common } }),
  users: createRoute({ method: 'get', path: '/v1/admin/users', tags, summary: '使用者列表（只含辨識用欄位）',
    request: { query: z.object({ q: z.string().trim().max(100).optional(), ...Paging }) },
    responses: { 200: json(z.object({ data: z.array(UserRow), meta: Meta }), '使用者'), ...common } }),
  user: createRoute({ method: 'get', path: '/v1/admin/users/{id}', tags, summary: '使用者詳情（含個資；寫入稽核紀錄）',
    request: { params: z.object({ id: z.string().min(1).max(100) }) },
    responses: { 200: json(z.object({ data: UserDetail }), '使用者'), ...common, 404: err('不存在') } }),
  audit: createRoute({ method: 'get', path: '/v1/admin/audit', tags, summary: '管理端稽核紀錄',
    request: { query: z.object({ targetType: z.string().max(20).optional(), targetId: z.string().max(100).optional(), ...Paging }) },
    responses: { 200: json(z.object({ data: z.array(Audit), meta: Meta }), '稽核紀錄'), ...common } }),
}

// accessControl 已確認是 Email 已驗證的管理者（ROUTE_ACCESS 標為 'admin'）
const adminOf = (c: { var: AppEnv['Variables']; req: { header: (n: string) => string | undefined } }): Admin => ({
  id: c.var.user!.id,
  email: c.var.user!.email,
  ip: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
})

export const adminRoutes = new OpenAPIHono<AppEnv>()
  .openapi(routes.overview, async (c) => c.json({ data: await overview(c.var.deps.db) }, 200))
  .openapi(routes.welfareList, async (c) => {
    const q = c.req.valid('query')
    const { data, total } = await listWelfare(c.var.deps.db, q)
    return c.json({ data, meta: { page: q.page, limit: q.limit, total } }, 200)
  })
  .openapi(routes.welfareDetail, async (c) => c.json({ data: await getWelfare(c.var.deps.db, c.req.valid('param').id) }, 200))
  .openapi(routes.welfarePatch, async (c) => {
    const data = await updateWelfare(c.var.deps.db, c.var.deps.queue, adminOf(c), c.req.valid('param').id, c.req.valid('json'))
    return c.json({ data }, 200)
  })
  .openapi(routes.welfareRestructure, async (c) => {
    await restructure(c.var.deps.db, c.var.deps.queue, adminOf(c), c.req.valid('param').id)
    return c.body(null, 202)
  })
  .openapi(routes.llmUsage, async (c) => c.json({ data: await llmUsage(c.var.deps.db, c.req.valid('query').days) }, 200))
  .openapi(routes.users, async (c) => {
    const q = c.req.valid('query')
    const { data, total } = await listUsers(c.var.deps.db, q)
    return c.json({ data, meta: { page: q.page, limit: q.limit, total } }, 200)
  })
  .openapi(routes.user, async (c) => c.json({ data: await getUser(c.var.deps.db, adminOf(c), c.req.valid('param').id) }, 200))
  .openapi(routes.audit, async (c) => {
    const q = c.req.valid('query')
    const { data, total } = await listAudit(c.var.deps.db, q)
    return c.json({ data, meta: { page: q.page, limit: q.limit, total } }, 200)
  })
