import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../App.css'
import './coverage.css'
import CoverageDemo from './CoverageDemo'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CoverageDemo />
  </StrictMode>,
)
