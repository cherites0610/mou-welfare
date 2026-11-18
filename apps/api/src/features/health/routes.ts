// GET /health：部署煙霧測試用（docs/testing.md §9.2）。回報資料庫、目前 migration、背景工作心跳。
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { sql } from 'drizzle-orm'
import type { AppEnv } from '../../app.ts'

const Health = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  db: z.enum(['ok', 'error']),
  migration: z.string().nullable(),
  jobs: z.object({ mode: z.enum(['inline', 'separate', 'off']), lastBeatSecondsAgo: z.number().nullable() }),
})

const route = createRoute({
  method: 'get',
  path: '/health',
  tags: ['system'],
  responses: {
    200: { description: '服務正常或部分降級', content: { 'application/json': { schema: Health } } },
    503: { description: '資料庫無法連線', content: { 'application/json': { schema: Health } } },
  },
})

/** 背景工作心跳超過這個秒數視為降級（WORKER_MODE=off 時不檢查） */
export const JOBS_STALE_SECONDS = 60

export const healthRoutes = new OpenAPIHono<AppEnv>().openapi(route, async (c) => {
  const { db, env } = c.var.deps
  const mode = env.WORKER_MODE
  try {
    const [mig] = await db.execute<{ hash: string; created_at: string }>(
      sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`,
    )
    const [beat] = await db.execute<{ age: number | null }>(
      sql`select extract(epoch from now() - max(beat_at))::float as age from worker_heartbeat`,
    )
    const age = beat?.age ?? null
    const jobsOk = mode === 'off' || (age !== null && age <= JOBS_STALE_SECONDS)
    const status = jobsOk ? 'ok' : 'degraded'
    return c.json(
      { status, db: 'ok', migration: mig ? `${mig.created_at}:${mig.hash.slice(0, 8)}` : null, jobs: { mode, lastBeatSecondsAgo: age } },
      200,
    )
  } catch {
    return c.json({ status: 'error', db: 'error', migration: null, jobs: { mode, lastBeatSecondsAgo: null } }, 503)
  }
})
