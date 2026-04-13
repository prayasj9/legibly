export type LevelName = 'Manual' | 'Assisted' | 'Paired' | 'Trusted' | 'Autonomous'

export interface Level {
  name: LevelName
  number: 1 | 2 | 3 | 4 | 5
  scoreRange: [number, number]  // inclusive [min, max]
  meaning: string
}

export const LEVELS: Level[] = [
  { number: 1, name: 'Manual',     scoreRange: [0.0, 1.0],  meaning: 'Human writes everything; AI can only explain' },
  { number: 2, name: 'Assisted',   scoreRange: [1.1, 2.0],  meaning: 'AI suggests; human reviews every change' },
  { number: 3, name: 'Paired',     scoreRange: [2.1, 2.8],  meaning: 'AI writes and applies; human reviews before commit' },
  { number: 4, name: 'Trusted',    scoreRange: [2.9, 3.5],  meaning: 'AI writes, tests, commits; human reviews PRs' },
  { number: 5, name: 'Autonomous', scoreRange: [3.6, 4.0],  meaning: 'AI operates end-to-end; human monitors outcomes' },
]

export type DimensionName =
  | 'Test Coverage'
  | 'Security'
  | 'CI/CD'
  | 'Documentation'
  | 'Technical Debt'
  | 'Type Safety'

export interface DimensionScore {
  name: DimensionName
  score: number   // 0.0–4.0
  signals: string[]  // positive signals detected
  gaps: string[]     // missing things that would raise the score
}

export interface Assessment {
  overallScore: number
  level: Level
  nextLevel: Level | null
  dimensions: DimensionScore[]
  /** Ordered list of specific actions to reach the next level */
  toNextLevel: string[]
  /** Conditions that hard-cap the recommended AI autonomy level */
  hardBlockers: string[]
  /** Areas where AI can safely work with minimal human review */
  safeForAI: string[]
  /** Areas where every AI change needs a human to review before merging */
  requiresReview: string[]
  /** Areas to avoid delegating to AI without explicit discussion */
  avoidAI: string[]
}
