import type {
  PracticesQuery,
  LabQuery,
} from '../transport/generated/graphql'
import {
  ChallengeEndpoint,
  LabDescription,
  PracticeMenuCategory,
} from './domain'

const mapEndpoint = (endpoint: { host: string; port: number }): ChallengeEndpoint => ({
  host: endpoint.host,
  port: endpoint.port,
})

export const mapPracticeMenu = (
  data: PracticesQuery,
  language: string
): PracticeMenuCategory[] =>
  data.practice.labCategories.map((category) => {
    const nameAsSameLang = category.name.find((entry) => entry.lang === language)
    const name = nameAsSameLang?.text ?? (category.name.length ? category.name[0].text : category.id)
    const labs = category.labs.map((lab) => {
      const labNameAsSameLang = lab.resources.find((resource) => resource.lang === language)
      const labName = labNameAsSameLang?.name ?? (lab.resources.length ? lab.resources[0].name : lab.id)
      return { id: lab.id, name: labName }
    })
    return { id: category.id, name, labs }
  })

export const mapLabDescription = (data: LabQuery): LabDescription => ({
  content: data.lab.content,
  wsEndpoints: data.lab.wsEndpoints.map(mapEndpoint),
  tcpEndpoints: data.lab.tcpEndpoints.map(mapEndpoint),
})
