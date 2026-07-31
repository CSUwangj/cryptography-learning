import React, { type PropsWithChildren } from 'react'
import i18n from './i18n'
import { BrowserRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { OverlaysProvider } from '@blueprintjs/core'
import { ApolloClientProvider } from 'transport'

// Blueprint 6 requires OverlaysProvider for overlay-based components (Alert, Select, etc.).
export const Providers: React.FC<PropsWithChildren> = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    <BrowserRouter>
      <OverlaysProvider>
        <ApolloClientProvider>
          {children}
        </ApolloClientProvider>
      </OverlaysProvider>
    </BrowserRouter>
  </I18nextProvider>
)
