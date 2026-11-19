// Gemini 實作的單元測試：模擬 SDK，不呼叫真實 API（docs/testing.md §2：CI 不呼叫真實模型）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const models = { generateContent: vi.fn(), generateContentStream: vi.fn(), embedContent: vi.fn() }
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = models
  },
}))

const { GeminiLLM, normalize } = await import('../src/lib/llm/gemini.ts')
const { LLMError } = await import('../src/lib/llm/types.ts')

const schema = z.object({ name: z.string().min(2) })
const llm = new GeminiLLM('key', 'gemini-test', 'embed-test')

beforeEach(() => {
  for (const fn of Object.values(models)) fn.mockReset()
})

describe('GeminiLLM.generate', () => {
  it('以 JSON schema 要求結構化輸出並驗證', async () => {
    models.generateContent.mockResolvedValue({ text: '{"name":"老人津貼"}' })
    expect(await llm.generate({ system: 's', input: 'i', schema })).toEqual({ name: '老人津貼' })
    const call = models.generateContent.mock.calls[0]![0]
    expect(call.model).toBe('gemini-test')
    expect(call.config.responseMimeType).toBe('application/json')
    expect(call.config.responseJsonSchema).toMatchObject({ type: 'object', required: ['name'] })
  })

  it('輸出不合格時重試一次，並附上錯誤訊息', async () => {
    models.generateContent.mockResolvedValueOnce({ text: '{"name":"x"}' }).mockResolvedValueOnce({ text: '{"name":"老人津貼"}' })
    expect(await llm.generate({ system: 's', input: 'i', schema })).toEqual({ name: '老人津貼' })
    expect(models.generateContent.mock.calls[1]![0].contents).toContain('不符合格式')
  })

  it('兩次都不合格（含非 JSON）→ LLMError(schema)', async () => {
    models.generateContent.mockResolvedValue({ text: 'not json' })
    await expect(llm.generate({ system: 's', input: 'i', schema })).rejects.toMatchObject({ kind: 'schema' })
  })

  it('SDK 錯誤 → LLMError(provider / timeout)', async () => {
    models.generateContent.mockRejectedValueOnce(new Error('429 quota'))
    await expect(llm.generate({ system: 's', input: 'i', schema })).rejects.toMatchObject({ kind: 'provider' })
    models.generateContent.mockRejectedValueOnce(new Error('request timeout'))
    await expect(llm.generate({ system: 's', input: 'i', schema })).rejects.toBeInstanceOf(LLMError)
  })
})

describe('GeminiLLM.embed', () => {
  it('輸出 768 維並正規化', async () => {
    models.embedContent.mockResolvedValue({ embeddings: [{ values: Array(768).fill(2) }] })
    const [v] = await llm.embed(['老人津貼'])
    expect(v).toHaveLength(768)
    expect(Math.hypot(...v!)).toBeCloseTo(1)
    expect(models.embedContent.mock.calls[0]![0].config.outputDimensionality).toBe(768)
  })

  it('維度或數量不符 → LLMError', async () => {
    models.embedContent.mockResolvedValue({ embeddings: [{ values: [1, 2] }] })
    await expect(llm.embed(['a'])).rejects.toMatchObject({ kind: 'provider' })
  })

  it('空陣列不呼叫 API', async () => {
    expect(await llm.embed([])).toEqual([])
    expect(models.embedContent).not.toHaveBeenCalled()
  })

  it('normalize 處理零向量', () => {
    expect(normalize([0, 0])).toEqual([0, 0])
  })
})

describe('GeminiLLM.stream', () => {
  it('逐段輸出文字，角色轉成 Gemini 的 user / model', async () => {
    models.generateContentStream.mockResolvedValue(
      (async function* () {
        yield { text: '哞～' }
        yield { text: undefined }
        yield { text: '你好' }
      })(),
    )
    const out: string[] = []
    for await (const s of llm.stream({ system: 's', messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }] })) out.push(s)
    expect(out).toEqual(['哞～', '你好'])
    expect(models.generateContentStream.mock.calls[0]![0].contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model'])
  })
})
