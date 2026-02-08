import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DevAssetStudio } from './devtools/DevAssetStudio.tsx'

const path = window.location.pathname.replace(/\/+$/, '')
const showDevStudio = path === '/dev/studio'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showDevStudio ? <DevAssetStudio /> : <App />}
  </StrictMode>,
)
