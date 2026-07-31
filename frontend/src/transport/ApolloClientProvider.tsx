import React from 'react'
import { SubscriptionClient } from 'subscriptions-transport-ws'
import { createHttpLink, ApolloClient, InMemoryCache, ApolloProvider } from '@apollo/client'
import { HyperLink } from './hyperLink'

const ENDPOINT = '/query'

const createWsClient = (endpoint: string) => {
  const WsProtocol = window.location.protocol.replace('http', 'ws')
  const client = new SubscriptionClient(`${WsProtocol}//${window.location.host}${endpoint}`, {
    reconnect: true,
    lazy: true,
    connectionCallback: function () {
      // TODO: remove this workaround
      // WORKAROUND: prevent infinite reconnection (https://github.com/99designs/gqlgen/issues/745)
      (this as any).wasKeepAliveReceived = true
    },
  })
  return client
}

function getLink() {
  const ws = createWsClient(ENDPOINT)
  const http = createHttpLink({ uri: ENDPOINT })
  const link = new HyperLink(ws, http)
  return link
}

export const ApolloClientProvider: React.FC = ({ children }) => {
  const client = new ApolloClient({
    link: getLink(),
    cache: new InMemoryCache(),
  })
  return <ApolloProvider client={client}>{children}</ApolloProvider>
}
