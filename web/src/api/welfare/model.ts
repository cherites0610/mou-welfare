import type { User } from '../user/model'

export interface Welfare {
  id: string
  name: string
  sourceCity: string
  sourceUrl: string
  categories: string[]
  requirements: string[]
  identity: string[]
  rewards: string[]
  originalName: string
  originalContent: string
  summaryContent: string
  publishDate: string | null
  deadline: string | null
  favoritedByUsers?: User[]
  createdAt: string
  updatedAt: string
}

export interface SearchWelfareDto {
  keywords?: string
  cities?: string[]
  categories?: string[]
  userId?: string
  identities?: string[]
  familyId?: string
  page?: number
  limit?: number
}

export enum TrafficLight {
  RED = 'RED',
  YELLOW = 'YELLOW',
  GREEN = 'GREEN',
}

export interface MatchResult {
  light: TrafficLight
  score: number
  reasons: string[]
}

export interface FamilyMatch {
  userId: string
  name: string
  avatarUrl: string | null
  match: MatchResult
}

export interface WelfareAnalysisResult {
  name: string
  categories: string[]
  requirements: string[]
  identity: string[]
  rewards: string[]
  summaryContent: string
  deadline: string | null
}

export interface WelfareResponse extends Welfare {
  match?: MatchResult
  familyMatches?: FamilyMatch[]
  overallScore?: number
}

export interface WelfareListResponse {
  data: WelfareResponse[]
  total: number
}
