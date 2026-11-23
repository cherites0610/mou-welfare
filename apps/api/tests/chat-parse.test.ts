// 聊天的規則解析、關鍵字、引用改寫（docs/backend.md §8.9）：純函式，表格測試
import { describe, expect, it } from 'vitest'
import { type ChatFilters, mergeFilters, parseQuery } from '../src/features/chat/parse.ts'
import { CitationRewriter, buildPrompt, fallbackText } from '../src/features/chat/prompt.ts'
import { keywordGrams, type Source } from '../src/features/chat/retrieve.ts'

describe('parseQuery', () => {
  it.each([
    // 問法 → 縣市、身分、類別
    ['臺北有育兒津貼嗎', ['臺北市'], [], ['兒童及青少年福利']],
    ['台中的生育津貼怎麼申請', ['臺中市'], [], ['婦女與幼兒福利']],
    ['我住基隆，想問生育補助', ['基隆市'], [], ['婦女與幼兒福利']],
    ['新竹有什麼老人福利', ['新竹市', '新竹縣'], ['65歲以上'], ['老人福利']],
    ['嘉義市的急難救助', ['嘉義市'], [], ['社會救助福利']],
    ['雙北的身障停車證', ['臺北市', '新北市'], ['身心障礙者'], ['身心障礙福利']],
    ['新北敬老悠遊卡', ['新北市'], [], ['老人福利']],
    ['中低收入戶有什麼補助', [], ['中低收入戶'], ['社會救助福利']],
    ['我是低收入戶', [], ['低收入戶'], ['社會救助福利']],
    ['我阿嬤 70 歲住屏東', ['屏東縣'], ['65歲以上'], ['老人福利']],
    ['我 45 歲', [], [], []],
    ['外配可以申請什麼', [], ['外籍配偶家庭'], []],
    ['懷孕有營養補助嗎', [], ['女性'], ['婦女與幼兒福利']],
    ['原住民修房子有補助嗎', [], ['原住民'], []],
    ['馬祖有福利嗎', ['連江縣'], [], []],
  ])('%s', (q, cities, identities, categories) => {
    const p = parseQuery(q)
    expect(p.cities.sort()).toEqual([...cities].sort())
    expect(p.identities.sort()).toEqual([...identities].sort())
    expect(p.categories.sort()).toEqual([...categories].sort())
  })

  it.each([
    ['那臺北呢', true],
    ['那如果是新北市呢？', true],
    ['那低收入戶呢', true],
    ['桃園有嗎', true],
    ['那老人的呢', true],
    ['臺北的育兒津貼', false],
    ['那托育補助呢', false],
    ['你好', false],
  ])('追問判斷：%s → %s', (q, followUp) => {
    expect(parseQuery(q).followUp).toBe(followUp)
  })

  it('關鍵字去掉縣市與語助詞，口語加上公告常用的寫法', () => {
    expect(parseQuery('臺北有沒有育兒津貼呢？').keywords).toBe('育兒')
    expect(parseQuery('身障租屋').keywords).toBe('身障租屋 身心障礙 房屋租金')
  })
})

describe('mergeFilters', () => {
  const first = (q: string, city: string | null = null) => mergeFilters(parseQuery(q), q, null, city)

  it('沒提到縣市時用個人資料的居住縣市；不是 22 縣市的值忽略', () => {
    expect(first('育兒津貼', '桃園市').cities).toEqual(['桃園市'])
    expect(first('育兒津貼', '火星').cities).toEqual([])
    expect(first('臺南的育兒津貼', '桃園市').cities).toEqual(['臺南市'])
  })

  it('追問沿用主題、換縣市，檢索文字是「主題＋追問」', () => {
    const prev = first('身障租屋補助', '新北市')
    const next = mergeFilters(parseQuery('那花蓮呢'), '那花蓮呢', prev, '新北市')
    expect(next).toMatchObject({ cities: ['花蓮縣'], identities: ['身心障礙者'], topic: '身障租屋補助', query: '身障租屋補助 那花蓮呢' })
  })

  it('新的問題換主題、重算身分；縣市沿用上一輪', () => {
    const prev = mergeFilters(parseQuery('那花蓮呢'), '那花蓮呢', first('身障租屋補助'), null)
    const next = mergeFilters(parseQuery('育兒津貼怎麼申請'), '育兒津貼怎麼申請', prev, '新北市')
    expect(next).toMatchObject({ cities: ['花蓮縣'], identities: [], topic: '育兒津貼怎麼申請', query: '育兒津貼怎麼申請' })
  })

  it('追問時合併身分', () => {
    const prev: ChatFilters = { cities: [], identities: ['65歲以上'], categories: ['老人福利'], topic: '假牙', query: '假牙' }
    const next = mergeFilters(parseQuery('那低收入戶呢'), '那低收入戶呢', prev, null)
    expect(next.identities.sort()).toEqual(['65歲以上', '低收入戶'])
    expect(next.categories.sort()).toEqual(['社會救助福利', '老人福利'])
  })
})

describe('keywordGrams', () => {
  it('切成二字詞、去重；單字略過', () => {
    expect(keywordGrams('育兒津貼 補 育兒')).toEqual(['育兒', '兒津', '津貼'])
    expect(keywordGrams('')).toEqual([])
  })
})

describe('CitationRewriter', () => {
  const ids = ['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002']

  it('把編號換成福利 id，清單外的移除；標註被切在兩段之間也能處理', () => {
    const r = new CitationRewriter(ids)
    const out = [r.push('可以申請生育補助['), r.push('[1'), r.push(']]，也可以看'), r.push('[[3]]與[[2]]。'), r.flush()].join('')
    expect(out).toBe(`可以申請生育補助[[${ids[0]}]]，也可以看與[[${ids[1]}]]。`)
  })

  it('一般的方括號照常輸出', () => {
    const r = new CitationRewriter(ids)
    expect(r.push('[注意] 期限') + r.flush()).toBe('[注意] 期限')
    expect(new CitationRewriter(ids).push('結尾[') + '').toBe('結尾')
  })
})

describe('prompt', () => {
  const source = (over: Partial<Source> = {}): Source => ({
    id: 'aaaaaaaa-0000-0000-0000-000000000001', name: '生育補助', city: '彰化縣', categories: [], identities: [], summary: '每胎補助',
    publishedAt: null, deadline: '2026-12-31', requirements: ['設籍滿一年'], rewards: ['每胎 3 萬元'], score: 1,
    match: { light: 'GREEN', score: 90, reasons: ['此福利無特殊身分限制'] }, familyMatches: null, ...over,
  })
  const filters: ChatFilters = { cities: ['彰化縣'], identities: [], categories: [], topic: 'q', query: 'q' }

  it('只送年齡層、性別、身分；不送生日', () => {
    const { system, messages } = buildPrompt({
      question: '生小孩有補助嗎', history: [{ role: 'user', content: '你好' }], filters, sources: [source()],
      profile: { birthday: '1990-05-01', gender: '女性', identities: ['原住民'] }, family: null, cityMissing: false,
      today: new Date('2026-11-23T00:00:00Z'),
    })
    expect(system).toContain('使用者的個人資料：20歲-65歲、女性、原住民')
    expect(system).not.toContain('1990')
    expect(system).toContain('[[1]] 生育補助（彰化縣）')
    expect(system).toContain('對使用者的比對：可能符合')
    expect(messages).toEqual([{ role: 'user', content: '你好' }, { role: 'user', content: '生小孩有補助嗎' }])
  })

  it('固定格式列出福利與引用', () => {
    const text = fallbackText([source()], true)
    expect(text).toContain('AI 暫時無法回覆')
    expect(text).toContain('還沒有收錄')
    expect(text).toContain('- 生育補助（彰化縣）[[aaaaaaaa-0000-0000-0000-000000000001]]')
  })
})
