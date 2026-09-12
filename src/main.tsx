import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Boundary } from './ui/Boundary'
import './ui/styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>,
)
