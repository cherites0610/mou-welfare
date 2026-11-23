// 設定使用者角色（docs/backend.md §8.6）。管理者只能在主機上用這支腳本指定，API 不提供修改角色的功能。
// 用法：tsx --env-file=<env> scripts/set-role.ts <email> <admin|user>
import { eq } from 'drizzle-orm'
import { createDb } from '../src/db/client.ts'
import { user } from '../src/db/schema/index.ts'

const [email, role] = process.argv.slice(2)
if (!email || (role !== 'admin' && role !== 'user')) {
  console.error('用法：scripts/set-role.ts <email> <admin|user>')
  process.exit(1)
}
const { db, sql } = createDb(process.env.DATABASE_URL!, { max: 1 })
const rows = await db.update(user).set({ role }).where(eq(user.email, email.toLowerCase())).returning({ email: user.email, verified: user.emailVerified })
if (!rows.length) console.error(`找不到 ${email}（要先在網站註冊）`)
else {
  console.log(`${rows[0]!.email} → ${role}`)
  if (role === 'admin' && !rows[0]!.verified) console.warn('⚠️ 這個帳號的 Email 尚未驗證，驗證前無法使用後台')
}
await sql.end()
process.exit(rows.length ? 0 : 1)
