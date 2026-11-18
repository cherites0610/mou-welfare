import { describe, expect, it } from 'vitest'
import { IngestItem } from './ingest.ts'

const valid = {
  source: { site_id: 'kinmen', city: '金門縣', url: 'https://social.kinmen.gov.tw/cp.aspx?n=1', kind: 'cms' },
  program_key: 'kinmen:中低收入老人生活津貼',
  title: '中低收入老人生活津貼',
  published_at: '2026-03-01',
  content_md: '## 申請資格\n\n'.padEnd(120, '年滿65歲並設籍本縣。'),
  classification: { type: 'program', confidence: 0.92 },
  content_hash: `sha256:${'a'.repeat(64)}`,
}

describe('IngestItem', () => {
  it('合法輸入，attachments 與 structured 有預設值', () => {
    const parsed = IngestItem.parse(valid)
    expect(parsed.attachments).toEqual([])
    expect(parsed.structured).toEqual({})
  })

  it.each([
    ['標題過短', { title: '補助' }],
    ['內文過短（品質關卡）', { content_md: '太短' }],
    ['site_id 含大寫', { source: { ...valid.source, site_id: 'Kinmen' } }],
    ['hash 格式錯誤', { content_hash: 'md5:abc' }],
    ['未知分類', { classification: { type: 'news', confidence: 0.5 } }],
    ['信心值超出範圍', { classification: { type: 'program', confidence: 1.2 } }],
    ['日期格式錯誤', { published_at: '115/03/01' }],
  ])('拒絕：%s', (_name, patch) => {
    expect(IngestItem.safeParse({ ...valid, ...patch }).success).toBe(false)
  })
})
