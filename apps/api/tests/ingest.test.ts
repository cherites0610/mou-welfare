// 爬蟲推送 → 結構化 → 搜尋（docs/backend.md P2 資料流、docs/testing.md §6 契約）
import type { IngestItem } from '@mou-welfare/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ingestLog, welfareAttachments, welfarePrograms, welfareSources } from '../src/db/schema/index.ts'
import { hasEvidence, type LLMStructuredWelfare, LLMStructurer, RuleStructurer, sanitizeIdentities, StructuredWelfare } from '../src/features/welfare/structure.ts'
import { backfill, embeddingText, structureProgram } from '../src/jobs/structure.ts'
import { sign, verify } from '../src/lib/hmac.ts'
import { FakeLLM } from '../src/lib/llm/index.ts'
import { MemoryQueue } from '../src/lib/queue.ts'
import { resetDb, setupApp } from './helpers.ts'

const t = setupApp()
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.db)
  t.queue.jobs.length = 0
})

const KEY = t.env.INGEST_HMAC_KEY

function item(patch: Partial<IngestItem> & { url?: string } = {}): IngestItem {
  const { url, ...rest } = patch
  return {
    source: { site_id: 'kinmen', city: '金門縣', url: url ?? 'https://social.kinmen.gov.tw/cp.aspx?n=A&s=1', kind: 'cms' },
    program_key: 'kinmen:中低收入老人生活津貼',
    title: '中低收入老人生活津貼',
    published_at: '2024-02-22',
    content_md: '（一）補助對象：設籍並實際居住本縣、年滿65歲之中低收入老人。（二）補助標準：每月發給8,329元。'.repeat(2),
    attachments: [{ name: '申請表', url: 'https://ws.kinmen.gov.tw/Download.ashx?u=1', text: '申請表內容' }],
    structured: {},
    classification: { type: 'program', confidence: 0.7 },
    content_hash: `sha256:${'a'.repeat(64)}`,
    ...rest,
  }
}

function post(path: string, payload: unknown, opts: { key?: string; ts?: number; tamper?: boolean } = {}) {
  const body = JSON.stringify(payload)
  const ts = opts.ts ?? Math.floor(Date.now() / 1000)
  const signature = sign(opts.key ?? KEY, ts, body)
  return t.app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mou-timestamp': String(ts), 'x-mou-signature': signature },
    body: opts.tamper ? body.replace('津貼', '補助') : body,
  })
}

const programs = () => t.db.select().from(welfarePrograms)

describe('HMAC 簽章', () => {
  it('與爬蟲（Python）的簽章結果一致', () => {
    // services/scraper：sign('k'*32, 1700000000, body)
    const body = '{"site_id":"kinmen","urls":["https://a.example/1"]}'
    expect(sign('k'.repeat(32), 1700000000, body)).toBe(
      'sha256=93125aaf7203719c61fbf801081b99858615f548f309026feab311edd394ba9f',
    )
  })

  it.each([
    ['沒有簽章', { timestamp: undefined, signature: 'sha256=x' }, 'missing'],
    ['時間戳不是數字', { timestamp: '12a', signature: 'sha256=x' }, 'bad_signature'],
    ['簽章長度不同', { timestamp: '1700000000', signature: 'sha256=abc' }, 'bad_signature'],
  ] as const)('%s → %s', (_n, headers, expected) => {
    expect(verify(KEY, headers, new Uint8Array(), 1700000000_000)).toBe(expected)
  })

  it('時間戳超過 5 分鐘 → 401（防重放）', async () => {
    const res = await post('/internal/ingest', item(), { ts: Math.floor(Date.now() / 1000) - 301 })
    expect(res.status).toBe(401)
    expect(await res.text()).toContain('expired')
  })

  it('金鑰錯誤或內容被竄改 → 401，且沒有寫入', async () => {
    expect((await post('/internal/ingest', item(), { key: 'x'.repeat(40) })).status).toBe(401)
    expect((await post('/internal/ingest', item(), { tamper: true })).status).toBe(401)
    expect(await programs()).toHaveLength(0)
  })

  it('沒有簽章標頭 → 401', async () => {
    const res = await t.app.request('/internal/ingest', { method: 'POST', body: JSON.stringify(item()) })
    expect(res.status).toBe(401)
  })

  it('內容太大 → 413', async () => {
    const res = await post('/internal/ingest', item({ content_md: 'x'.repeat(3 * 1024 * 1024) }))
    expect(res.status).toBe(413)
  })
})

describe('POST /internal/ingest', () => {
  it('新增：建立待結構化的福利、附件、來源網址，並排入結構化', async () => {
    const res = await post('/internal/ingest', item())
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { id: string; action: string } }
    expect(data.action).toBe('created')

    const [p] = await programs()
    expect(p).toMatchObject({ status: 'pending', name: '中低收入老人生活津貼', city: '金門縣', siteId: 'kinmen' })
    expect(await t.db.select().from(welfareAttachments)).toHaveLength(1)
    expect(await t.db.select().from(welfareSources)).toHaveLength(1)
    expect(t.queue.jobs).toEqual([{ name: 'welfare-structure', data: { programId: data.id } }])
    // 待結構化的不出現在搜尋
    const search = (await (await t.app.request('/v1/welfare')).json()) as { data: unknown[] }
    expect(search.data).toHaveLength(0)
  })

  it('內容沒變：不重新結構化', async () => {
    await post('/internal/ingest', item())
    const res = await post('/internal/ingest', item())
    expect(((await res.json()) as { data: { action: string } }).data.action).toBe('unchanged')
    expect(t.queue.jobs).toHaveLength(1)
  })

  it('內容變了：更新內容、替換附件、重新排入結構化', async () => {
    await post('/internal/ingest', item())
    await post('/internal/ingest', item({ content_hash: `sha256:${'b'.repeat(64)}`, attachments: [] }))
    const [p] = await programs()
    expect(p!.contentHash).toBe(`sha256:${'b'.repeat(64)}`)
    expect(await t.db.select().from(welfareAttachments)).toHaveLength(0)
    expect(t.queue.jobs).toHaveLength(2)
    const actions = (await t.db.select().from(ingestLog)).map((l) => l.action).sort()
    expect(actions).toEqual(['created', 'updated'])
  })

  it('同一個 program_key 的不同網址（同一福利出現在多個分類）合併成一筆', async () => {
    await post('/internal/ingest', item({ url: 'https://social.kinmen.gov.tw/cp.aspx?n=A&s=1' }))
    await post('/internal/ingest', item({ url: 'https://social.kinmen.gov.tw/cp.aspx?n=B&s=2' }))
    expect(await programs()).toHaveLength(1)
    expect(await t.db.select().from(welfareSources)).toHaveLength(2)
  })

  it('格式錯誤 → 400（共用 schema 的品質關卡）', async () => {
    const res = await post('/internal/ingest', { ...item(), content_md: '太短' })
    expect(res.status).toBe(400)
    expect((await post('/internal/ingest', 'not json')).status).toBe(400)
  })

  it('附件文字含 NUL（PDF 常見）→ 去掉後寫入，不會 500', async () => {
    const res = await post('/internal/ingest', item({ attachments: [{ name: '申請表', url: 'https://x.example/a.pdf', text: '申請\u0000資格' }] }))
    expect(res.status).toBe(200)
    const [a] = await t.db.select().from(welfareAttachments)
    expect(a!.text).toBe('申請資格')
  })

  it('開放資料的原始欄位保留', async () => {
    await post('/internal/ingest', item({ structured: { 應備文件: '身分證' } }))
    const [p] = await programs()
    expect(p!.sourceFields).toEqual({ 應備文件: '身分證' })
  })
})

describe('POST /internal/remove', () => {
  it('所有來源網址都下架才標為 removed，之後搜尋不到', async () => {
    const a = 'https://social.kinmen.gov.tw/cp.aspx?n=A&s=1'
    const b = 'https://social.kinmen.gov.tw/cp.aspx?n=B&s=2'
    await post('/internal/ingest', item({ url: a }))
    await post('/internal/ingest', item({ url: b }))
    await t.db.update(welfarePrograms).set({ status: 'active' })

    let res = await post('/internal/remove', { site_id: 'kinmen', urls: [a] })
    expect(((await res.json()) as { data: object }).data).toEqual({ removedSources: 1, removedPrograms: 0 })
    expect((await programs())[0]!.status).toBe('active')

    res = await post('/internal/remove', { site_id: 'kinmen', urls: [b] })
    expect(((await res.json()) as { data: object }).data).toEqual({ removedSources: 1, removedPrograms: 1 })
    expect((await programs())[0]!.status).toBe('removed')
    const search = (await (await t.app.request('/v1/welfare')).json()) as { data: unknown[] }
    expect(search.data).toHaveLength(0)
  })

  it('不能下架別的站點的網址', async () => {
    await post('/internal/ingest', item())
    const res = await post('/internal/remove', { site_id: 'ntpc', urls: [item().source.url] })
    expect(((await res.json()) as { data: object }).data).toEqual({ removedSources: 0, removedPrograms: 0 })
  })

  it('下架後又出現：回到待結構化', async () => {
    await post('/internal/ingest', item())
    await post('/internal/remove', { site_id: 'kinmen', urls: [item().source.url] })
    const res = await post('/internal/ingest', item())
    expect(((await res.json()) as { data: { action: string } }).data.action).toBe('updated')
    expect((await programs())[0]!.status).toBe('pending')
  })

  it('格式錯誤 → 400', async () => {
    expect((await post('/internal/remove', { site_id: 'kinmen', urls: [] })).status).toBe(400)
  })
})

const LLM_OUTPUT: LLMStructuredWelfare = {
  isIndividualWelfare: true,
  name: '中低收入老人生活津貼',
  summary: '設籍金門縣、年滿 65 歲的中低收入老人，每月可領 8,329 元生活津貼。',
  categories: ['老人福利', '社會救助福利'],
  identityChecks: [
    { identity: '65歲以上', quote: '年滿 65 歲', canApplyWithout: false },
    { identity: '中低收入戶', quote: '列冊中低收入戶', canApplyWithout: false },
    { identity: '身心障礙者', quote: '身心障礙者另加發', canApplyWithout: true },
  ],
  requirements: ['設籍並實際居住本縣', '年滿 65 歲'],
  rewards: ['每月 8,329 元'],
  deadline: null,
}

async function ingestOne(patch: Parameters<typeof item>[0] = {}) {
  const res = await post('/internal/ingest', item(patch))
  return ((await res.json()) as { data: { id: string } }).data.id
}

describe('sanitizeIdentities', () => {
  it('同時要求兩個年齡層或兩個性別時整類拿掉；低收入戶與中低收入戶只留中低收入戶', () => {
    expect(sanitizeIdentities(['20歲以下', '20歲-65歲', '身心障礙者'])).toEqual(['身心障礙者'])
    expect(sanitizeIdentities(['男性', '女性', '65歲以上'])).toEqual(['65歲以上'])
    expect(sanitizeIdentities(['低收入戶', '中低收入戶'])).toEqual(['中低收入戶'])
    expect(sanitizeIdentities(['65歲以上', '中低收入戶'])).toEqual(['65歲以上', '中低收入戶'])
  })
})

describe('hasEvidence', () => {
  it('依據句子要有該身分的關鍵字', () => {
    expect(hasEvidence({ identity: '65歲以上', quote: '屏東縣重陽節敬老慰問金發放辦法' })).toBe(false)
    expect(hasEvidence({ identity: '65歲以上', quote: '年滿六十五歲' })).toBe(true)
    expect(hasEvidence({ identity: '中低收入戶', quote: '符合中低收入老人生活津貼發給辦法第二條規定' })).toBe(false)
    expect(hasEvidence({ identity: '中低收入戶', quote: '列冊低收入戶或中低收入戶' })).toBe(true)
    expect(hasEvidence({ identity: '20歲以下', quote: '未滿十八歲之兒童及少年' })).toBe(false)
  })
})

describe('welfare-structure 工作', () => {
  it('LLM：寫回結構化欄位與 embedding，狀態改為 active，之後可以搜尋到', async () => {
    const id = await ingestOne()
    const llm = new FakeLLM({ generate: () => LLM_OUTPUT })
    expect(await structureProgram(t.db, new LLMStructurer(llm), llm, id)).toBe('done')

    const [p] = await programs()
    expect(p).toMatchObject({
      status: 'active',
      structuredBy: 'llm',
      identities: ['65歲以上', '中低收入戶'],
      rewards: ['每月 8,329 元'],
      structuredHash: item().content_hash,
      structureError: null,
    })
    expect(p!.embedding).toHaveLength(768)

    const search = (await (await t.app.request('/v1/welfare?q=生活津貼')).json()) as { data: { id: string }[] }
    expect(search.data.map((d) => d.id)).toEqual([id])
  })

  it('同樣內容不重複結構化', async () => {
    const id = await ingestOne()
    const s = new RuleStructurer()
    expect(await structureProgram(t.db, s, null, id)).toBe('done')
    expect(await structureProgram(t.db, s, null, id)).toBe('skipped')
  })

  it('改回規則時不覆蓋 LLM 的結果；LLM 會重做規則的結果', async () => {
    const id = await ingestOne()
    const llm = new FakeLLM({ generate: () => LLM_OUTPUT })
    await structureProgram(t.db, new LLMStructurer(llm), llm, id)
    expect(await structureProgram(t.db, new RuleStructurer(), null, id)).toBe('skipped')
    expect((await programs())[0]!.structuredBy).toBe('llm')

    const id2 = await ingestOne({ program_key: 'kinmen:老人假牙補助', title: '老人假牙補助', url: 'https://x.example/2' })
    await structureProgram(t.db, new RuleStructurer(), null, id2)
    expect(await structureProgram(t.db, new LLMStructurer(llm), llm, id2)).toBe('done')
  })

  it('不是個人福利 → rejected，不做 embedding', async () => {
    const id = await ingestOne()
    const llm = new FakeLLM({ generate: () => ({ ...LLM_OUTPUT, isIndividualWelfare: false }) })
    await structureProgram(t.db, new LLMStructurer(llm), llm, id)
    const [p] = await programs()
    expect(p).toMatchObject({ status: 'rejected', embedding: null })
  })

  it('截止日已過 → expired', async () => {
    const id = await ingestOne()
    const llm = new FakeLLM({ generate: () => ({ ...LLM_OUTPUT, deadline: '2026-01-31' }) })
    await structureProgram(t.db, new LLMStructurer(llm), llm, id, '2026-11-19')
    expect((await programs())[0]!.status).toBe('expired')
  })

  it('LLM 輸出不合格 → 記錄錯誤並丟出（交給 pg-boss 重試），狀態不變', async () => {
    const id = await ingestOne()
    const llm = new FakeLLM({ generate: () => ({ name: 'x' }) })
    await expect(structureProgram(t.db, new LLMStructurer(llm), llm, id)).rejects.toThrow()
    const [p] = await programs()
    expect(p).toMatchObject({ status: 'pending' })
    expect(p!.structureError).toMatch(/schema/)
  })

  it('結構化期間內容又被更新 → 不覆蓋（新的工作會處理）', async () => {
    const id = await ingestOne()
    const newer = `sha256:${'c'.repeat(64)}`
    const racing = {
      kind: 'llm' as const,
      structure: async () => {
        // 模擬結構化進行中，爬蟲推送了新版本
        await t.db.update(welfarePrograms).set({ contentHash: newer }).where(eq(welfarePrograms.id, id))
        const { identityChecks: _, ...rest } = LLM_OUTPUT
        return { ...rest, identities: [], by: 'llm' as const }
      },
    }
    expect(await structureProgram(t.db, racing, null, id)).toBe('skipped')
    expect((await programs())[0]).toMatchObject({ status: 'pending', contentHash: newer, structuredHash: null })
  })

  it('不存在或已下架的福利略過', async () => {
    const s = new RuleStructurer()
    expect(await structureProgram(t.db, s, null, '00000000-0000-4000-8000-000000000000')).toBe('missing')
    const id = await ingestOne()
    await t.db.update(welfarePrograms).set({ status: 'removed' })
    expect(await structureProgram(t.db, s, null, id)).toBe('skipped')
  })

  it('backfill：補送遺失的工作；改用 LLM 後，規則結構化的也重新排入', async () => {
    const a = await ingestOne()
    const b = await ingestOne({ program_key: 'kinmen:老人假牙補助', title: '老人假牙補助', url: 'https://x.example/b' })
    await structureProgram(t.db, new RuleStructurer(), null, a)

    const q = new MemoryQueue()
    expect(await backfill(t.db, q, new RuleStructurer())).toBe(1) // 只有 b 還沒結構化
    expect(q.jobs[0]!.data).toEqual({ programId: b })

    const q2 = new MemoryQueue()
    const llm = new FakeLLM({ generate: () => LLM_OUTPUT })
    expect(await backfill(t.db, q2, new LLMStructurer(llm))).toBe(2)
  })

  it('backfill：佇列裡已經有工作的不重複送', async () => {
    const id = await ingestOne()
    const { createBoss } = await import('../src/lib/queue.ts')
    const boss = await createBoss(t.env.DATABASE_URL)
    try {
      await boss.send('welfare-structure', { programId: id })
      const q = new MemoryQueue()
      expect(await backfill(t.db, q, new RuleStructurer())).toBe(0)
      await boss.deleteAllJobs('welfare-structure')
      expect(await backfill(t.db, q, new RuleStructurer())).toBe(1)
    } finally {
      await boss.stop({ graceful: false })
    }
  })
})

describe('RuleStructurer（沒有 LLM 金鑰時）', () => {
  const s = new RuleStructurer()
  const run = (title: string, contentMd = '申請資格：設籍本縣並實際居住滿一年者，可向公所提出申請。') =>
    s.structure({ title, city: '金門縣', contentMd, attachments: [], sourceFields: {} })

  it.each([
    ['中低收入老人生活津貼', ['老人福利', '社會救助福利'], ['65歲以上', '中低收入戶']],
    ['身心障礙者生活補助', ['身心障礙福利'], ['身心障礙者']],
    ['低收入戶子女就學生活補助', ['社會救助福利'], ['低收入戶']],
    ['育有未滿二歲兒童育兒津貼', ['兒童及青少年福利'], []], // 給兒童但由家長申請：不標年齡
    ['老人及身心障礙者餐飲服務補助', ['身心障礙福利', '老人福利'], []], // 「及」＝其中之一，不能變成兩個都要
    ['導盲犬管理', ['其他福利'], []],
  ])('%s', async (title, categories, identities) => {
    const r = await run(title)
    expect(r.categories).toEqual(categories)
    expect(r.identities).toEqual(identities)
    expect(r.by).toBe('rules')
    expect(StructuredWelfare.safeParse(r).success).toBe(true)
  })

  it('摘要跳過日期、聯絡人等欄位', async () => {
    const r = await run('老人假牙補助', '- 日期：113-02-22\n- 聯絡人：社會福利科\n\n（一）補助對象：年滿65歲之列冊低收入戶老人。')
    expect(r.summary).toBe('（一）補助對象：年滿65歲之列冊低收入戶老人。')
  })

  it('正文太短時摘要用標題', async () => {
    expect((await run('老人假牙補助', '- 日期：113-02-22')).summary).toBe('老人假牙補助（詳見原文）')
  })
})

describe('embeddingText', () => {
  it('包含縣市、名稱、摘要、資格與補助', () => {
    expect(embeddingText({ ...LLM_OUTPUT, city: '金門縣' })).toContain('金門縣 中低收入老人生活津貼\n設籍金門縣')
  })
})

describe('createStructurer', () => {
  it('有 Gemini 金鑰就用 LLM，沒有就用規則；可用 LLM_DRIVER 強制', async () => {
    const { createStructurer } = await import('../src/jobs/structure.ts')
    const { testEnv } = await import('./test-env.ts')
    expect(createStructurer(testEnv()).structurer.kind).toBe('rules')
    expect(createStructurer(testEnv({ GEMINI_API_KEY: 'k' })).structurer.kind).toBe('llm')
    expect(createStructurer(testEnv({ GEMINI_API_KEY: 'k', LLM_DRIVER: 'rules' })).llm).toBeNull()
    expect(() => testEnv({ LLM_DRIVER: 'gemini' })).toThrow(/GEMINI_API_KEY/)
  })
})
