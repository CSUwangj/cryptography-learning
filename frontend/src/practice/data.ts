import React from 'react'
import { useQuery } from '@apollo/client/react'
import {
  LabDocument,
  PracticesDocument,
} from '../transport/generated/graphql'
import { useApolloData } from './useApolloData'
import {
  LabDescription,
  PracticeMenuCategory,
} from './domain'
import { mapLabDescription, mapPracticeMenu } from './map'

type LabQueryVars = {
  categoryId: string
  labId: string
  language: string
}

/** Load Practice menu categories as local domain types. */
export const usePracticeMenu = (
  language: string,
  render: (categories: PracticeMenuCategory[]) => React.ReactElement
): React.ReactElement =>
  useApolloData(useQuery(PracticesDocument), (data) =>
    render(mapPracticeMenu(data, language))
  )

/** Load a Lab Description as a local domain type. */
export const useLabDescription = (
  variables: LabQueryVars,
  render: (lab: LabDescription) => React.ReactElement
): React.ReactElement =>
  useApolloData(useQuery(LabDocument, { variables }), (data) =>
    render(mapLabDescription(data))
  )
