/** Local Practice domain types — not generated GraphQL shapes. */

export type ChallengeEndpoint = {
  host: string
  port: number
}

export type LabDescription = {
  content: string
  wsEndpoints: ChallengeEndpoint[]
  tcpEndpoints: ChallengeEndpoint[]
}

export type PracticeMenuLab = {
  id: string
  name: string
}

export type PracticeMenuCategory = {
  id: string
  name: string
  labs: PracticeMenuLab[]
}
