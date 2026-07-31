import React from 'react'
import styled from '@emotion/styled/macro'
import { Div, navbarHeight } from 'ui'
import { WIP } from '../Wip'

const Wrapper = styled(Div)`
  min-height: calc(100vh - ${navbarHeight}px);
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
`

export const FeedbackPage: React.FC = () => {

  return <Wrapper>
    <WIP />
  </Wrapper>
}
