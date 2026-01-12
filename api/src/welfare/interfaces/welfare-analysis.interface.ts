export interface WelfareAnalysisResult {
  name: string
  categories: string[]
  requirements: string[]
  identity: string[]
  rewards: string[]
  summaryContent: string
  deadline: Date | null
}
