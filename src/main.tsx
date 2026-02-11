import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DevAssetStudio } from './devtools/DevAssetStudio.tsx'

type SurfaceMode = 'game' | 'studio'

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed.length > 0 ? trimmed : '/'
}

function resolveSurfaceMode(): SurfaceMode {
  const path = normalizePath(window.location.pathname.toLowerCase())
  const modeParam = new URLSearchParams(window.location.search).get('mode')
  const devMode = import.meta.env.DEV

  if (modeParam === 'game') return 'game'
  if (modeParam === 'studio' && devMode) return 'studio'

  if (path === '/game' || path === '/app') return 'game'
  if ((path === '/dev/studio' || path === '/studio' || path === '/dev') && devMode) {
    return 'studio'
  }

  if (path === '/' && devMode) return 'studio'
  return 'game'
}

const surfaceMode = resolveSurfaceMode()
const showDevSwitcher = import.meta.env.DEV

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showDevSwitcher && (
      <div className="dev-surface-switch">
        <a href="/dev/studio" className={surfaceMode === 'studio' ? 'active' : ''}>
          Studio
        </a>
        <a href="/game" className={surfaceMode === 'game' ? 'active' : ''}>
          Game
        </a>
      </div>
    )}
    {surfaceMode === 'studio' ? <DevAssetStudio /> : <App />}
  </StrictMode>,
)
