export interface Dependency {
  name: string
  type: 'internal' | 'external' | 'database' | 'queue' | 'cache' | 'http'
  why: string
  risk: 'high' | 'medium' | 'low'
}

export interface UsedBy {
  file: string
  function: string
  context: string
}

export interface PublicInterface {
  function: string
  returns: string
  notes: string
}

export interface FailurePoint {
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  location: string
  consequence: string
}

export interface ImplicitAssumption {
  assumption: string
  consequence: string
  validated: boolean
}

export interface EnvVar {
  name: string
  required: boolean
  default: string | null
  validatedOnStartup: boolean
  notes: string
}

export interface DomainTerm {
  term: string
  meaning: string
}

export interface MissingThing {
  what: string
  impact: string
}

export interface Todo {
  location: string
  comment: string
  age: string | null
}

export interface ChunkAnalysis {
  name: string
  file: string
  summary: string
  owns: string[]
  doesNotOwn: string[]
  dependencies: Dependency[]
  usedBy: UsedBy[]
  publicInterface: PublicInterface[]
  failurePoints: FailurePoint[]
  implicitAssumptions: ImplicitAssumption[]
  envVars: EnvVar[]
  domainLanguage: DomainTerm[]
  riskLevel: 'high' | 'medium' | 'low'
  riskReason: string
  beforeYouTouch: string[]
  missingThings: MissingThing[]
  todos: Todo[]
}
