import { generatePath } from 'react-router-dom'

export const LAB_PATTERN = '/practice/:category/:lab'

export type LabRouteParams = {
  category: string
  lab: string
}

export function labPath(params: LabRouteParams) {
  try {
    return generatePath(LAB_PATTERN, params)
  } catch (e) {
    console.error(e)
    return '/'
  }
}
