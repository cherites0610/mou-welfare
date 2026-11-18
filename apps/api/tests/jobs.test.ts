// 背景工作在 API 程序內啟動（WORKER_MODE=inline）：pg-boss 能啟動、寫入心跳、正常停止。
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { workerHeartbeat } from '../src/db/schema/index.ts'
import { HEARTBEAT_NAME, startJobs } from '../src/jobs/index.ts'
import { resetDb, setupApp } from './helpers.ts'

const t = setupApp()
afterAll(() => t.close())

describe('startJobs', () => {
  it('啟動後立即寫入心跳，之後定期更新，並能正常停止', async () => {
    await resetDb(t.db)
    const jobs = await startJobs({ db: t.db, databaseUrl: t.env.DATABASE_URL, heartbeatMs: 200 })
    try {
      const first = await t.db.select().from(workerHeartbeat).where(eq(workerHeartbeat.name, HEARTBEAT_NAME))
      expect(first).toHaveLength(1)
      await new Promise((r) => setTimeout(r, 500))
      const [later] = await t.db.select().from(workerHeartbeat).where(eq(workerHeartbeat.name, HEARTBEAT_NAME))
      expect(later!.beatAt.getTime()).toBeGreaterThan(first[0]!.beatAt.getTime())
    } finally {
      await jobs.stop()
    }
  })

  it('/health 在心跳正常時回報 ok', async () => {
    const jobs = await startJobs({ db: t.db, databaseUrl: t.env.DATABASE_URL })
    try {
      const body = (await (await t.app.request('/health')).json()) as { status: string }
      expect(body.status).toBe('ok')
    } finally {
      await jobs.stop()
    }
  })
})
