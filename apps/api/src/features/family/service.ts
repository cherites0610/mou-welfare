// 家庭、成員與邀請碼（docs/backend.md §5.1、§7）。
// 權限檢查集中在 assertFamilyMember / assertFamilyAdmin，每個家庭路由都必須呼叫（R8）。
// 成員只能透過一次性邀請碼加入（R9）。
import { randomInt } from 'node:crypto'
import { type MatchProfile, type MatchResult, match } from '@mou-welfare/shared'
import { and, asc, count, eq, gt, isNull, ne, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { families, type FamilyRole, familyInvites, familyMembers, user } from '../../db/schema/index.ts'
import { ApiError } from '../../lib/errors.ts'

export const MAX_FAMILIES_PER_USER = 10
export const MAX_MEMBERS_PER_FAMILY = 20
export const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000
/** 去掉容易看錯的 0/O、1/I/L；6 碼（與 v1 介面相同）約 8.9 億種組合，加上一次性、3 天過期，猜中的機會極低 */
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const INVITE_LENGTH = 6

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Conn = Db | Tx

export type Member = {
  userId: string
  name: string
  image: string | null
  gender: string | null
  identities: string[]
  role: FamilyRole
  joinedAt: Date
}

const notFound = () => new ApiError(404, 'not_found', '找不到這個家庭')

/** 非成員一律 403，不透露家庭是否存在以外的任何資訊（R6）。回傳自己的角色 */
export async function assertFamilyMember(db: Conn, familyId: string, userId: string): Promise<FamilyRole> {
  const [row] = await db
    .select({ role: familyMembers.role })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)))
  if (!row) throw new ApiError(403, 'forbidden', '你不是這個家庭的成員')
  return row.role
}

export async function assertFamilyAdmin(db: Conn, familyId: string, userId: string): Promise<void> {
  if ((await assertFamilyMember(db, familyId, userId)) !== 'admin') {
    throw new ApiError(403, 'forbidden', '只有家庭管理者可以進行這個操作')
  }
}

export async function listMembers(db: Conn, familyId: string): Promise<Member[]> {
  return db
    .select({
      userId: familyMembers.userId,
      name: user.name,
      image: user.image,
      // 與 v1 相同，家人之間看得到彼此的性別與特殊身分標籤（不含生日與 email）
      gender: user.gender,
      identities: user.identities,
      role: familyMembers.role,
      joinedAt: familyMembers.joinedAt,
    })
    .from(familyMembers)
    .innerJoin(user, eq(user.id, familyMembers.userId))
    .where(eq(familyMembers.familyId, familyId))
    .orderBy(asc(familyMembers.joinedAt), asc(familyMembers.userId))
}

async function getFamilyRow(db: Conn, familyId: string) {
  const [row] = await db
    .select({ id: families.id, name: families.name, createdAt: families.createdAt })
    .from(families)
    .where(eq(families.id, familyId))
  if (!row) throw notFound()
  return row
}

export async function getFamily(db: Db, familyId: string, userId: string) {
  const myRole = await assertFamilyMember(db, familyId, userId)
  const [family, members] = await Promise.all([getFamilyRow(db, familyId), listMembers(db, familyId)])
  return { ...family, myRole, members }
}

export async function listFamilies(db: Db, userId: string) {
  const mine = await db
    .select({ id: families.id, name: families.name, createdAt: families.createdAt, myRole: familyMembers.role })
    .from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId))
    .where(eq(familyMembers.userId, userId))
    .orderBy(asc(familyMembers.joinedAt))
  return Promise.all(mine.map(async (f) => ({ ...f, members: await listMembers(db, f.id) })))
}

async function familyCount(db: Conn, userId: string) {
  const [row] = await db.select({ n: count() }).from(familyMembers).where(eq(familyMembers.userId, userId))
  return row?.n ?? 0
}

export async function createFamily(db: Db, userId: string, name: string) {
  const id = await db.transaction(async (tx) => {
    // 鎖住使用者那一列，避免同時建立多個家庭時超過上限
    await tx.execute(sql`select 1 from "user" where id = ${userId} for update`)
    if ((await familyCount(tx, userId)) >= MAX_FAMILIES_PER_USER) {
      throw new ApiError(409, 'conflict', `最多只能加入 ${MAX_FAMILIES_PER_USER} 個家庭`)
    }
    const [f] = await tx.insert(families).values({ name, createdBy: userId }).returning({ id: families.id })
    await tx.insert(familyMembers).values({ familyId: f!.id, userId, role: 'admin' })
    return f!.id
  })
  return getFamily(db, id, userId)
}

export async function renameFamily(db: Db, familyId: string, userId: string, name: string) {
  await assertFamilyAdmin(db, familyId, userId)
  await db.update(families).set({ name }).where(eq(families.id, familyId))
  return getFamily(db, familyId, userId)
}

export async function deleteFamily(db: Db, familyId: string, userId: string) {
  await assertFamilyAdmin(db, familyId, userId)
  await db.delete(families).where(eq(families.id, familyId))
}

/** 鎖住家庭，讓「最後一位管理者」的檢查不會被同時進行的操作繞過 */
async function lockFamily(tx: Tx, familyId: string) {
  const rows = await tx.execute(sql`select 1 from families where id = ${familyId} for update`)
  if (rows.length === 0) throw notFound()
}

async function otherAdmins(tx: Tx, familyId: string, userId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.role, 'admin'), ne(familyMembers.userId, userId)))
  return row?.n ?? 0
}

export async function changeRole(db: Db, familyId: string, actorId: string, targetId: string, role: FamilyRole) {
  await db.transaction(async (tx) => {
    await lockFamily(tx, familyId)
    await assertFamilyAdmin(tx, familyId, actorId)
    const target = await memberRole(tx, familyId, targetId)
    if (target === role) return
    if (target === 'admin' && (await otherAdmins(tx, familyId, targetId)) === 0) {
      throw new ApiError(409, 'conflict', '家庭至少要有一位管理者，請先指定其他管理者')
    }
    await tx
      .update(familyMembers)
      .set({ role })
      .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, targetId)))
  })
  return listMembers(db, familyId)
}

async function memberRole(tx: Conn, familyId: string, userId: string): Promise<FamilyRole> {
  const [row] = await tx
    .select({ role: familyMembers.role })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)))
  if (!row) throw new ApiError(404, 'not_found', '這個人不是家庭成員')
  return row.role
}

/**
 * 移除成員：管理者可以移除任何人；一般成員只能移除自己（退出家庭）。
 * 最後一位成員退出時刪除整個家庭；還有其他成員時，最後一位管理者不能退出。
 */
export async function removeMember(db: Db, familyId: string, actorId: string, targetId: string) {
  await db.transaction(async (tx) => {
    await lockFamily(tx, familyId)
    const actorRole = await assertFamilyMember(tx, familyId, actorId)
    if (actorId !== targetId && actorRole !== 'admin') {
      throw new ApiError(403, 'forbidden', '只有家庭管理者可以移除其他成員')
    }
    const targetRole = await memberRole(tx, familyId, targetId)
    const [total] = await tx.select({ n: count() }).from(familyMembers).where(eq(familyMembers.familyId, familyId))
    if ((total?.n ?? 0) <= 1) {
      await tx.delete(families).where(eq(families.id, familyId))
      return
    }
    if (targetRole === 'admin' && (await otherAdmins(tx, familyId, targetId)) === 0) {
      throw new ApiError(409, 'conflict', '家庭至少要有一位管理者，請先指定其他管理者')
    }
    await tx.delete(familyMembers).where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, targetId)))
  })
}

function generateCode() {
  let s = ''
  for (let i = 0; i < INVITE_LENGTH; i++) s += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]
  return s
}

/** 邀請碼不分大小寫，也容許使用者輸入時夾雜空白或連字號 */
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, '')

export async function createInvite(db: Db, familyId: string, userId: string, now = new Date()) {
  await assertFamilyAdmin(db, familyId, userId)
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await db
      .insert(familyInvites)
      .values({ code: generateCode(), familyId, createdBy: userId, expiresAt })
      .onConflictDoNothing()
      .returning({ code: familyInvites.code, expiresAt: familyInvites.expiresAt })
    if (row) return row
  }
  throw new Error('無法產生不重複的邀請碼')
}

async function usableInvite(db: Conn, code: string, now: Date, lock: boolean) {
  const q = db
    .select({ familyId: familyInvites.familyId, expiresAt: familyInvites.expiresAt, usedAt: familyInvites.usedAt })
    .from(familyInvites)
    .where(eq(familyInvites.code, normalizeCode(code)))
  const [invite] = lock ? await q.for('update') : await q
  if (!invite) throw new ApiError(404, 'not_found', '邀請碼不存在，請確認是否輸入正確')
  if (invite.usedAt) throw new ApiError(410, 'gone', '這個邀請碼已經使用過了，請向家人索取新的邀請碼')
  if (invite.expiresAt <= now) throw new ApiError(410, 'gone', '這個邀請碼已過期，請向家人索取新的邀請碼')
  return invite
}

/** 加入前預覽（顯示「要加入○○家嗎？」）：只回傳家庭名稱與人數，不含成員資料 */
export async function previewInvite(db: Db, code: string, userId: string, now = new Date()) {
  const invite = await usableInvite(db, code, now, false)
  const family = await getFamilyRow(db, invite.familyId)
  const [members] = await db.select({ n: count() }).from(familyMembers).where(eq(familyMembers.familyId, invite.familyId))
  const [mine] = await db
    .select({ n: count() })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, invite.familyId), eq(familyMembers.userId, userId)))
  return {
    familyId: family.id,
    familyName: family.name,
    memberCount: members?.n ?? 0,
    alreadyMember: (mine?.n ?? 0) > 0,
    expiresAt: invite.expiresAt,
  }
}

export async function acceptInvite(db: Db, code: string, userId: string, now = new Date()) {
  const familyId = await db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from "user" where id = ${userId} for update`)
    const invite = await usableInvite(tx, code, now, true)
    await lockFamily(tx, invite.familyId)
    const [mine] = await tx
      .select({ n: count() })
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, invite.familyId), eq(familyMembers.userId, userId)))
    // 已經是成員時不消耗邀請碼，讓它還能給其他家人使用
    if ((mine?.n ?? 0) > 0) throw new ApiError(409, 'conflict', '你已經是這個家庭的成員')
    const [members] = await tx.select({ n: count() }).from(familyMembers).where(eq(familyMembers.familyId, invite.familyId))
    if ((members?.n ?? 0) >= MAX_MEMBERS_PER_FAMILY) {
      throw new ApiError(409, 'conflict', `家庭成員已達上限（${MAX_MEMBERS_PER_FAMILY} 人）`)
    }
    if ((await familyCount(tx, userId)) >= MAX_FAMILIES_PER_USER) {
      throw new ApiError(409, 'conflict', `最多只能加入 ${MAX_FAMILIES_PER_USER} 個家庭`)
    }
    // 條件式更新：同一個邀請碼同時被兩個人使用時，只有一個會成功
    const used = await tx
      .update(familyInvites)
      .set({ usedAt: now, usedBy: userId })
      .where(and(eq(familyInvites.code, normalizeCode(code)), isNull(familyInvites.usedAt), gt(familyInvites.expiresAt, now)))
      .returning({ code: familyInvites.code })
    if (used.length === 0) throw new ApiError(410, 'gone', '這個邀請碼已經使用過了，請向家人索取新的邀請碼')
    await tx.insert(familyMembers).values({ familyId: invite.familyId, userId, role: 'member' })
    return invite.familyId
  })
  return getFamily(db, familyId, userId)
}

/** 刪除帳號前整理家庭：只剩自己的家庭直接刪除；自己是唯一管理者時，把最早加入的成員升為管理者 */
export async function handOverFamilies(tx: Tx, userId: string) {
  const mine = await tx
    .select({ familyId: familyMembers.familyId, role: familyMembers.role })
    .from(familyMembers)
    .where(eq(familyMembers.userId, userId))
  for (const { familyId, role } of mine) {
    await lockFamily(tx, familyId)
    const others = await tx
      .select({ userId: familyMembers.userId, role: familyMembers.role })
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, familyId), ne(familyMembers.userId, userId)))
      .orderBy(asc(familyMembers.joinedAt), asc(familyMembers.userId))
    if (others.length === 0) {
      await tx.delete(families).where(eq(families.id, familyId))
    } else if (role === 'admin' && !others.some((o) => o.role === 'admin')) {
      await tx
        .update(familyMembers)
        .set({ role: 'admin' })
        .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, others[0]!.userId)))
    }
  }
}

// ---- 家庭模式的資格比對（docs/backend.md §8.1）----

export type FamilyProfile = MatchProfile & { userId: string; name: string; image: string | null }
export type FamilyMatch = { userId: string; name: string; image: string | null; match: MatchResult }

/** 家庭模式要比對的家人（不含自己）。呼叫前必須先通過 assertFamilyMember（R6） */
export async function familyProfiles(db: Db, familyId: string, userId: string): Promise<FamilyProfile[]> {
  await assertFamilyMember(db, familyId, userId)
  return db
    .select({
      userId: user.id,
      name: user.name,
      image: user.image,
      birthday: user.birthday,
      gender: user.gender,
      identities: user.identities,
    })
    .from(familyMembers)
    .innerJoin(user, eq(user.id, familyMembers.userId))
    .where(and(eq(familyMembers.familyId, familyId), ne(familyMembers.userId, userId)))
    .orderBy(asc(familyMembers.joinedAt), asc(user.id))
}

/** 搜尋、詳情、收藏的家庭模式：沒帶 familyId 回傳 null；未登入 401、不是成員 403（R6） */
export async function familyMode(db: Db, familyId: string | undefined, userId: string | null) {
  if (!familyId) return null
  if (!userId) throw new ApiError(401, 'unauthorized', '家庭模式需要先登入')
  return familyProfiles(db, familyId, userId)
}

/** 只回傳姓名、頭像與比對結果，不回傳家人的生日、身分等個資 */
export function matchFamily(members: FamilyProfile[], required: readonly string[], today = new Date()): FamilyMatch[] {
  return members.map((m) => ({ userId: m.userId, name: m.name, image: m.image, match: match(m, required, today) }))
}
