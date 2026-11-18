// pg-boss 封裝（docs/backend.md §8.4）：佇列與 cron 都存在 Postgres 的 pgboss schema。
import { PgBoss } from 'pg-boss'

export const QUEUES = ['welfare-structure', 'notify'] as const
export type QueueName = (typeof QUEUES)[number]

export async function createBoss(connectionString: string) {
  const boss = new PgBoss({ connectionString, schema: 'pgboss' })
  boss.on('error', (err) => console.error('[pg-boss]', err))
  await boss.start()
  for (const q of QUEUES) await boss.createQueue(q)
  return boss
}
