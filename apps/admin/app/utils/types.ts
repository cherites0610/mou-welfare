// API 回應型別（對應 apps/api/src/features/admin/routes.ts）
export type Paged<T> = { data: T[]; meta: { page: number; limit: number; total: number } }

export type Overview = {
  welfare: {
    byCity: { city: string; active: number; rejected: number; expired: number; pending: number }[]
    structure: { llm: number; rules: number; unstructured: number; errors: number; overridden: number; reviewed: number }
    versions: { model: string | null; promptVersion: string | null; count: number }[]
  }
  llm: {
    paused: { at: string; reason: string; probedAt: string | null } | null
    daily: { day: string; calls: number; errors: number; inputTokens: number; outputTokens: number; thoughtsTokens: number; costUsd: number }[]
    total: { calls: number; inputTokens: number; outputTokens: number; costUsd: number }
  }
  users: { total: number; verified: number; new7d: number; new30d: number; subscribed: number; favorites: number; families: number }
  sources: { sites: { siteId: string; programs: number; lastSeenAt: string | null }[]; lastIngestAt: string | null }
}

export type WelfareRow = {
  id: string; name: string; city: string; siteId: string | null; status: string; statusOverride: 'active' | 'rejected' | null
  categories: string[]; identities: string[]; summary: string; deadline: string | null; structuredBy: 'llm' | 'rules' | null
  structuredModel: string | null; structuredAt: string | null; hasError: boolean; reviewedAt: string | null; pinnedAt: string | null
  sourceUrl: string; updatedAt: string
}

export type LlmCall = {
  id: number; at: string; purpose: string; programId: string | null; model: string; promptVersion: string | null; attempt: number
  inputTokens: number | null; outputTokens: number | null; thoughtsTokens: number | null; latencyMs: number; ok: boolean
  errorKind: string | null; error: string | null; costUsd: number | null
}

export type Audit = {
  id: number; at: string; adminId: string; adminEmail: string; action: string; targetType: string; targetId: string
  detail: Record<string, unknown>; ip: string | null
}

export type WelfareDetail = Omit<WelfareRow, 'hasError'> & {
  programKey: string; requirements: string[]; rewards: string[]; contentMd: string; sourceKind: string; publishedAt: string | null
  contentHash: string | null; sourceFields: Record<string, unknown>; structuredHash: string | null; structuredPromptVersion: string | null
  reviewedBy: string | null; reviewNote: string | null; structureError: string | null; hasEmbedding: boolean; createdAt: string
  attachments: { name: string; url: string; text: string }[]
  sources: { url: string; siteId: string; firstSeenAt: string; lastSeenAt: string }[]
  llmCalls: LlmCall[]
  history: Audit[]
}

export type LlmUsage = {
  rows: { day: string; purpose: string; model: string; calls: number; errors: number; inputTokens: number; outputTokens: number; thoughtsTokens: number; costUsd: number; avgLatencyMs: number }[]
  errors: { kind: string; count: number; lastAt: string; sample: string }[]
  topPrograms: { programId: string; name: string; city: string; calls: number; costUsd: number }[]
}

export type UserRow = { id: string; name: string; email: string; emailVerified: boolean; role: string; createdAt: string; providers: string[] }
export type UserDetail = {
  id: string; name: string; email: string; emailVerified: boolean; image: string | null; role: string; birthday: string | null
  gender: string | null; city: string | null; identities: string[]; isSubscribed: boolean; createdAt: string; updatedAt: string
  providers: { providerId: string; linkedAt: string }[]
  families: { id: string; name: string; role: string; joinedAt: string; memberCount: number }[]
  favorites: number; activeSessions: number; lastActiveAt: string | null
}

// GET /v1/admin/scraper（apps/api/src/features/scraper/routes.ts）
export type ScrapeHealth = 'ok' | 'degraded' | 'blocked' | 'failed'
export type ScrapeSiteCounts = {
  siteId: string; city: string | null; seen: number; new: number; updated: number; unchanged: number; removed: number
  filtered: number; quarantined: number; pushed: number; pushFailed: number; pages: number; health: ScrapeHealth
  healthDetail: string; errorCount: number; startedAt: string; finishedAt: string
}
export type ScrapeRunSummary = {
  id: string; trigger: string; status: 'running' | 'ok' | 'warning' | 'interrupted'; startedAt: string; finishedAt: string | null
  updatedAt: string; planned: number; done: number; current: string | null
  totals: { seen: number; new: number; updated: number; removed: number; pushed: number; quarantined: number; errors: number; notOk: number }
}
export type ScraperStatus = {
  intervalDays: number; nextDueAt: string | null; overdue: boolean; latest: ScrapeRunSummary | null; runs: ScrapeRunSummary[]
  sites: { siteId: string; city: string | null; runId: string | null; last: ScrapeSiteCounts | null; lastOkAt: string | null; programs: { active: number; total: number } }[]
}
export type ScrapeRun = ScrapeRunSummary & {
  intervalDays: number | null; plannedSites: string[]
  sites: (ScrapeSiteCounts & { errors: string[]; quarantine: { title: string; url: string; issues: string[] }[] })[]
}
