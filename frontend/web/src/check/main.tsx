import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../App.css'
import '../coverage/coverage.css'
import './check.css'
import CheckDemo from './CheckDemo'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CheckDemo />
  </StrictMode>,
)
