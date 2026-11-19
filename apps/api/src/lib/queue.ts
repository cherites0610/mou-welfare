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

export type Boss = Awaited<ReturnType<typeof createBoss>>

/** API 程序只需要「送出工作」；測試用 MemoryQueue，不必啟動 pg-boss */
export interface Queue {
  send(name: QueueName, data: Record<string, unknown>): Promise<void>
}

// 失敗重試 3 次（指數退避，30 秒起），之後留在 failed 狀態供人工查看
const RETRY = { retryLimit: 3, retryDelay: 30, retryBackoff: true, retryDelayMax: 3600 } as const

export class BossQueue implements Queue {
  constructor(private readonly boss: Boss) {}
  async send(name: QueueName, data: Record<string, unknown>) {
    await this.boss.send(name, data, RETRY)
  }
}

export class MemoryQueue implements Queue {
  readonly jobs: { name: QueueName; data: Record<string, unknown> }[] = []
  async send(name: QueueName, data: Record<string, unknown>) {
    this.jobs.push({ name, data })
  }
}
