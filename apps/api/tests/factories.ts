import { randomUUID } from 'node:crypto'
import type { Db } from '../src/db/client.ts'
import { welfareAttachments, welfarePrograms } from '../src/db/schema/index.ts'

type ProgramInput = Partial<typeof welfarePrograms.$inferInsert>

export async function createProgram(db: Db, input: ProgramInput = {}) {
  const key = input.programKey ?? `test:${randomUUID()}`
  const [row] = await db
    .insert(welfarePrograms)
    .values({
      programKey: key,
      city: '金門縣',
      name: '測試福利',
      categories: ['其他福利'],
      identities: [],
      summary: '測試用摘要',
      sourceUrl: 'https://social.kinmen.gov.tw/cp.aspx?n=1',
      sourceKind: 'cms',
      ...input,
    })
    .returning()
  return row!
}

export async function addAttachment(db: Db, programId: string, name = '申請表.pdf') {
  await db.insert(welfareAttachments).values({ programId, name, url: `https://example.gov.tw/${name}`, text: '' })
}
