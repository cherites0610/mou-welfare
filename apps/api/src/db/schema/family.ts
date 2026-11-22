// 家庭（docs/backend.md §5.1）。成員只能透過邀請碼加入（R9），沒有「直接把某人加進家庭」的端點。
import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth.ts'

export const FAMILY_ROLES = ['admin', 'member'] as const
export type FamilyRole = (typeof FAMILY_ROLES)[number]

export const families = pgTable('families', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // 建立者刪除帳號後家庭仍可能有其他成員，所以只記錄、不連動刪除
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const familyMembers = pgTable(
  'family_members',
  {
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: FAMILY_ROLES }).notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.familyId, t.userId] }),
    index('family_members_user_idx').on(t.userId),
    check('family_members_role_check', sql`${t.role} in ('admin', 'member')`),
  ],
)

/** 一次性邀請碼：使用後記下 used_by / used_at，過期或已使用就不能再用 */
export const familyInvites = pgTable(
  'family_invites',
  {
    code: text('code').primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedBy: text('used_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('family_invites_family_idx').on(t.familyId)],
)
