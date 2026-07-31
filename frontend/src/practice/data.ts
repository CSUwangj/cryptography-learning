import React from 'react'
import {
  usePracticesQuery as useGeneratedPracticesQuery,
  useLabQuery as useGeneratedLabQuery,
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
  useApolloData(useGeneratedPracticesQuery(), (data) =>
    render(mapPracticeMenu(data, language))
  )

/** Load a Lab Description as a local domain type. */
export const useLabDescription = (
  variables: LabQueryVars,
  render: (lab: LabDescription) => React.ReactElement
): React.ReactElement =>
  useApolloData(useGeneratedLabQuery({ variables }), (data) =>
    render(mapLabDescription(data))
  )
