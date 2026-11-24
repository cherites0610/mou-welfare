import { z } from 'zod'

// 爬蟲 → API 的推送格式（docs/scraper.md §7）。
// 爬蟲端以 schemas/ingest.schema.json 驗證輸出；API 端以同一份 Zod schema 驗證輸入。

// curated：人工整理的精選福利（apps/api/src/curated），不經過爬蟲
export const SourceKind = z.enum(['cms', 'opendata', 'portal', 'curated'])

export const IngestAttachment = z.object({
  name: z.string().min(1),
  url: z.url(),
  text: z.string(),
})

export const IngestItem = z.object({
  source: z.object({
    site_id: z.string().regex(/^[a-z0-9_-]+$/),
    city: z.string().min(2),
    url: z.url(),
    kind: SourceKind,
  }),
  program_key: z.string().min(3),
  title: z.string().min(4),
  published_at: z.iso.date().nullable(),
  content_md: z.string().min(80),
  attachments: z.array(IngestAttachment).default([]),
  structured: z.record(z.string(), z.unknown()).default({}),
  classification: z.object({
    type: z.enum(['program', 'announcement', 'minutes', 'procurement', 'org_grant', 'event', 'statistics', 'other']),
    confidence: z.number().min(0).max(1),
  }),
  content_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
})

export type IngestItem = z.infer<typeof IngestItem>

export const IngestRemove = z.object({
  site_id: z.string(),
  urls: z.array(z.url()).min(1),
})
export type IngestRemove = z.infer<typeof IngestRemove>
