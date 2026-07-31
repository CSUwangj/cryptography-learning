import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from 'app'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root was not found')
}

// React 18.3 diagnostic pass: ReactDOM.render was deprecated; createRoot is
// the supported bootstrap before shipping React 19.
createRoot(rootElement).render(<App />)
