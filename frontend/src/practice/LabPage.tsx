import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, H3, H4, Intent } from '@blueprintjs/core'
import { useRouteMatch } from 'react-router-dom'
import { Markdown } from './markdown/Markdown'
import styled from '@emotion/styled'
import { Terminal } from 'terminal'
import { contentWidth, Div } from 'ui'
import { ChallengeEndpoint } from './domain'
import { LabRouteParams } from './routes'
import { useLabDescription } from './data'
import { PracticeBreadcrumb } from './PracticeBreadcrumb'

const ScrollCard = styled(Card)`
  box-sizing: border-box;
  margin: 0 auto;
  max-width: ${contentWidth}px;
  padding: 24px 28px;
  width: 100%;

  @media (max-width: 520px) {
    padding: 16px 12px;
  }
`

const Container = styled.div`
  box-sizing: border-box;
  min-width: 0;
  padding: 20px 0;
  width: 100%;

  > * {
    min-width: 0;
  }

  blockquote {
    margin: 2em 0;
    padding: 10px 20px;
    position: relative;
    background-color: var(--app-surface);
    border-left: 3px solid var(--app-border);
    box-shadow: inset 0px 0px 2px 3px rgb(0 0 0 / 13%);
    border: 1px solid var(--app-border);
  }
  img {
    height: auto;
    max-width: 100%;
  }
`

const BlockWrapper = styled.div`
  box-sizing: border-box;
  min-width: 0;
  margin-top: 20px;
  max-width: 100%;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  background: var(--app-surface);
  width: 100%;
`
const WSEndpointContainer = styled(BlockWrapper)`
  box-sizing: border-box;
  gap: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  padding: 16px;
`
const TCPEndpointsContainer = styled(BlockWrapper)`
  box-sizing: border-box;
  gap: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
`

const TCPEndpointWrapper = styled(Div)`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 100%;

  h4 {
    margin: 0;
  }

  > * {
    min-width: 0;
  }

  pre {
    margin: 0;
    max-width: 100%;
    overflow-x: auto;
  }
`

const sameEndpoint = (a: ChallengeEndpoint, b: ChallengeEndpoint) =>
  a.host === b.host && a.port === b.port

export const LabPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const { params: { category, lab } } = useRouteMatch<LabRouteParams>()
  const [ terminals, setTermianls ] = useState<ChallengeEndpoint[]>([])

  const content = useLabDescription({
    categoryId: category,
    labId: lab,
    language: language
  }, (labDescription) => {
    const wsEndpoints = labDescription.wsEndpoints
    const tcpEndpoints = labDescription.tcpEndpoints
    return <>
      <Markdown source={labDescription.content}></Markdown>
      {
        !!tcpEndpoints.length && <TCPEndpointsContainer>
          {
            tcpEndpoints.map((endpoint, id) => {
              const source = `\`\`\` bash\nnc ${endpoint.host} ${endpoint.port}\n\`\`\``
              return <TCPEndpointWrapper key={id}>
                <H4>{t('lab.tcp_endpoint') + id.toString() + t('quote')}</H4>
                <Markdown source={source} key={id}></Markdown>
              </TCPEndpointWrapper>
            })
          }
        </TCPEndpointsContainer>
      }
      {
        !!wsEndpoints.length && <WSEndpointContainer>
          {
            wsEndpoints.map((endpoint, id) => {
              const onClick = () => {
                const isOpen = terminals.some(term => sameEndpoint(term, endpoint))
                if(isOpen) {
                  setTermianls(terminals.filter(term => !sameEndpoint(term, endpoint)))
                } else {
                  setTermianls(terminals.concat([endpoint]))
                }
              }
              return <Button key={id} onClick={onClick}intent={Intent.PRIMARY} outlined={true}>{t('lab.ws_endpoint') + id.toString()}</Button>
            })
          }
          <Button onClick={() => setTermianls([])} intent={Intent.DANGER} outlined={true}>{t('lab.clear')}</Button>
        </WSEndpointContainer>
      }
    </>
  })
  return <ScrollCard>
    <Container>
      <PracticeBreadcrumb segments={[t('nav.practice'), category, lab]} />
      { content }
      {
        terminals.map((endpoint, idx) => <BlockWrapper data-terminal-card key={`${endpoint.host}:${endpoint.port}:${idx}`}>
          <H3>{endpoint.host}</H3>
          <Terminal
            {...endpoint}
            id={'terminal' + endpoint.host + ':' + endpoint.port}
            localEcho
            onExit={() => {
              setTermianls((open) => open.filter((term) => !sameEndpoint(term, endpoint)))
            }}
          />
        </BlockWrapper>)
      }
    </Container>
  </ScrollCard>
}
