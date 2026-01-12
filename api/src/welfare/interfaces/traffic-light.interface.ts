export enum TrafficLight {
  RED = 'RED',       // 不符合
  YELLOW = 'YELLOW', // 需確認/普通
  GREEN = 'GREEN',   // 高度符合
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
