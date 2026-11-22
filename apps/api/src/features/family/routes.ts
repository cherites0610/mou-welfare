import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { AppEnv } from '../../app.ts'
import { FAMILY_ROLES } from '../../db/schema/index.ts'
import {
  acceptInvite,
  changeRole,
  createFamily,
  createInvite,
  deleteFamily,
  getFamily,
  listFamilies,
  listMembers,
  assertFamilyMember,
  previewInvite,
  removeMember,
  renameFamily,
} from './service.ts'

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})
const err = (description: string) => json(ErrorSchema, description)

const Member = z
  .object({
    userId: z.string(),
    name: z.string(),
    image: z.string().nullable(),
    role: z.enum(FAMILY_ROLES),
    joinedAt: z.string(),
  })
  .openapi('FamilyMember')

const Family = z
  .object({
    id: z.uuid(),
    name: z.string(),
    myRole: z.enum(FAMILY_ROLES),
    members: z.array(Member),
    createdAt: z.string(),
  })
  .openapi('Family')

const FamilyInput = z.object({ name: z.string().trim().min(1).max(30) }).strict().openapi('FamilyInput')
const RoleInput = z.object({ role: z.enum(FAMILY_ROLES) }).strict().openapi('FamilyRoleInput')
const FamilyParams = z.object({ id: z.uuid() })
const MemberParams = z.object({ id: z.uuid(), userId: z.string().min(1) })
const CodeParams = z.object({ code: z.string().trim().min(1).max(20) })

const Invite = z.object({ code: z.string(), expiresAt: z.string() }).openapi('FamilyInvite')
const InvitePreview = z
  .object({
    familyId: z.uuid(),
    familyName: z.string(),
    memberCount: z.number(),
    alreadyMember: z.boolean(),
    expiresAt: z.string(),
  })
  .openapi('FamilyInvitePreview')

const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { 'application/json': { schema } }, required: true } })
const tags = ['family']

const list = createRoute({
  method: 'get',
  path: '/v1/families',
  tags,
  summary: '我加入的家庭（含成員）',
  responses: { 200: json(z.object({ data: z.array(Family) }), '家庭列表') },
})

const create = createRoute({
  method: 'post',
  path: '/v1/families',
  tags,
  summary: '建立家庭（建立者成為管理者）',
  request: body(FamilyInput),
  responses: { 201: json(z.object({ data: Family }), '已建立'), 409: err('已達家庭數量上限') },
})

const detail = createRoute({
  method: 'get',
  path: '/v1/families/{id}',
  tags,
  summary: '家庭詳情（需為成員）',
  request: { params: FamilyParams },
  responses: { 200: json(z.object({ data: Family }), '家庭'), 403: err('不是成員') },
})

const rename = createRoute({
  method: 'patch',
  path: '/v1/families/{id}',
  tags,
  summary: '修改家庭名稱（需為管理者）',
  request: { params: FamilyParams, ...body(FamilyInput) },
  responses: { 200: json(z.object({ data: Family }), '已更新'), 403: err('不是管理者') },
})

const remove = createRoute({
  method: 'delete',
  path: '/v1/families/{id}',
  tags,
  summary: '刪除家庭（需為管理者）',
  request: { params: FamilyParams },
  responses: { 204: { description: '已刪除' }, 403: err('不是管理者') },
})

const members = createRoute({
  method: 'get',
  path: '/v1/families/{id}/members',
  tags,
  summary: '家庭成員（需為成員）',
  request: { params: FamilyParams },
  responses: { 200: json(z.object({ data: z.array(Member) }), '成員列表'), 403: err('不是成員') },
})

const setRole = createRoute({
  method: 'patch',
  path: '/v1/families/{id}/members/{userId}',
  tags,
  summary: '修改成員角色（需為管理者；家庭至少要保留一位管理者）',
  request: { params: MemberParams, ...body(RoleInput) },
  responses: {
    200: json(z.object({ data: z.array(Member) }), '更新後的成員列表'),
    403: err('不是管理者'),
    404: err('對象不是成員'),
    409: err('會讓家庭沒有管理者'),
  },
})

const kick = createRoute({
  method: 'delete',
  path: '/v1/families/{id}/members/{userId}',
  tags,
  summary: '移除成員或退出家庭（管理者可移除任何人，成員只能移除自己；最後一位成員退出時刪除家庭）',
  request: { params: MemberParams },
  responses: {
    204: { description: '已移除' },
    403: err('沒有權限'),
    404: err('對象不是成員'),
    409: err('最後一位管理者不能退出'),
  },
})

const invite = createRoute({
  method: 'post',
  path: '/v1/families/{id}/invites',
  tags,
  summary: '產生一次性邀請碼（需為管理者，3 天內有效）',
  request: { params: FamilyParams },
  responses: { 201: json(z.object({ data: Invite }), '邀請碼'), 403: err('不是管理者') },
})

const preview = createRoute({
  method: 'get',
  path: '/v1/invites/{code}',
  tags,
  summary: '查看邀請碼要加入的家庭（不含成員資料）',
  request: { params: CodeParams },
  responses: { 200: json(z.object({ data: InvitePreview }), '邀請內容'), 404: err('邀請碼不存在'), 410: err('已使用或已過期') },
})

const accept = createRoute({
  method: 'post',
  path: '/v1/invites/{code}/accept',
  tags,
  summary: '以邀請碼加入家庭',
  request: { params: CodeParams },
  responses: {
    200: json(z.object({ data: Family }), '已加入的家庭'),
    404: err('邀請碼不存在'),
    409: err('已是成員或人數已達上限'),
    410: err('已使用或已過期'),
  },
})

const iso = <T extends { joinedAt: Date }>(m: T) => ({ ...m, joinedAt: m.joinedAt.toISOString() })
const out = (f: Awaited<ReturnType<typeof getFamily>>) => ({
  ...f,
  createdAt: f.createdAt.toISOString(),
  members: f.members.map(iso),
})

// accessControl 已保證 user 存在（ROUTE_ACCESS 標為 'user'）；資源層級的權限在 service 內檢查
export const familyRoutes = new OpenAPIHono<AppEnv>()
  .openapi(list, async (c) => {
    const rows = await listFamilies(c.var.deps.db, c.var.user!.id)
    return c.json({ data: rows.map(out) }, 200)
  })
  .openapi(create, async (c) => {
    const f = await createFamily(c.var.deps.db, c.var.user!.id, c.req.valid('json').name)
    return c.json({ data: out(f) }, 201)
  })
  .openapi(detail, async (c) => {
    const f = await getFamily(c.var.deps.db, c.req.valid('param').id, c.var.user!.id)
    return c.json({ data: out(f) }, 200)
  })
  .openapi(rename, async (c) => {
    const f = await renameFamily(c.var.deps.db, c.req.valid('param').id, c.var.user!.id, c.req.valid('json').name)
    return c.json({ data: out(f) }, 200)
  })
  .openapi(remove, async (c) => {
    await deleteFamily(c.var.deps.db, c.req.valid('param').id, c.var.user!.id)
    return c.body(null, 204)
  })
  .openapi(members, async (c) => {
    const { id } = c.req.valid('param')
    await assertFamilyMember(c.var.deps.db, id, c.var.user!.id)
    return c.json({ data: (await listMembers(c.var.deps.db, id)).map(iso) }, 200)
  })
  .openapi(setRole, async (c) => {
    const { id, userId } = c.req.valid('param')
    const rows = await changeRole(c.var.deps.db, id, c.var.user!.id, userId, c.req.valid('json').role)
    return c.json({ data: rows.map(iso) }, 200)
  })
  .openapi(kick, async (c) => {
    const { id, userId } = c.req.valid('param')
    await removeMember(c.var.deps.db, id, c.var.user!.id, userId)
    return c.body(null, 204)
  })
  .openapi(invite, async (c) => {
    const row = await createInvite(c.var.deps.db, c.req.valid('param').id, c.var.user!.id)
    return c.json({ data: { code: row.code, expiresAt: row.expiresAt.toISOString() } }, 201)
  })
  .openapi(preview, async (c) => {
    const p = await previewInvite(c.var.deps.db, c.req.valid('param').code, c.var.user!.id)
    return c.json({ data: { ...p, expiresAt: p.expiresAt.toISOString() } }, 200)
  })
  .openapi(accept, async (c) => {
    const f = await acceptInvite(c.var.deps.db, c.req.valid('param').code, c.var.user!.id)
    return c.json({ data: out(f) }, 200)
  })
