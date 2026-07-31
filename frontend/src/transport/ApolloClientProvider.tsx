import React, { type PropsWithChildren, useState } from 'react'
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'

const ENDPOINT = '/query'

function createClient() {
  return new ApolloClient({
    link: new HttpLink({ uri: ENDPOINT }),
    cache: new InMemoryCache(),
  })
}

export const ApolloClientProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [client] = useState(createClient)
  return <ApolloProvider client={client}>{children}</ApolloProvider>
}
