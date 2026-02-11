import { mkdir, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'

const MAX_REQUEST_BYTES = 80 * 1024 * 1024
const STUDIO_SYNC_ROUTE = '/__studio/save-external-assets'

type SyncStateInput = {
  fileName?: unknown
  dataUrl?: unknown
}

type StudioSyncRequest = {
  buildingSlug?: unknown
  jsonFileName?: unknown
  jsonText?: unknown
  states?: unknown
}

function safeSlug(value: unknown) {
  if (typeof value !== 'string') return 'custom_building'
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'custom_building'
}

function safeFileName(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || fallback
}

function parseDataUrl(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || commaIndex < 0) {
    throw new Error('Invalid data URL')
  }

  const header = dataUrl.slice(5, commaIndex).toLowerCase()
  const payload = dataUrl.slice(commaIndex + 1)
  const isBase64 = header.includes(';base64')
  return isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8')
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > MAX_REQUEST_BYTES) {
      throw new Error('Request too large')
    }
    chunks.push(buf)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function studioExternalAssetSyncPlugin(): PluginOption {
  return {
    name: 'studio-external-asset-sync',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = req.url ?? ''
        if (!requestUrl.startsWith(STUDIO_SYNC_ROUTE)) {
          next()
          return
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' })
          return
        }

        try {
          const rawBody = await readRequestBody(req)
          const body = (rawBody ? JSON.parse(rawBody) : {}) as StudioSyncRequest

          const buildingSlug = safeSlug(body.buildingSlug)
          const targetDir = path.resolve(process.cwd(), 'public', 'assets', 'buildings', buildingSlug)
          const jsonText = typeof body.jsonText === 'string' ? body.jsonText : ''
          const jsonFileName = safeFileName(body.jsonFileName, `${buildingSlug}.wizard.json`)
          const rawStates = Array.isArray(body.states) ? (body.states as SyncStateInput[]) : []

          await mkdir(targetDir, { recursive: true })

          let savedImages = 0
          for (let index = 0; index < rawStates.length; index += 1) {
            const state = rawStates[index]
            if (!state || typeof state.dataUrl !== 'string') continue

            const fileName = safeFileName(state.fileName, `state_${index + 1}.png`)
            const bytes = parseDataUrl(state.dataUrl)
            await writeFile(path.join(targetDir, fileName), bytes)
            savedImages += 1
          }

          await writeFile(path.join(targetDir, jsonFileName), jsonText, 'utf8')

          sendJson(res, 200, {
            ok: true,
            savedImages,
            jsonFile: jsonFileName,
            folder: `public/assets/buildings/${buildingSlug}`
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          sendJson(res, 400, { ok: false, error: message })
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), studioExternalAssetSyncPlugin()],
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          react: ['react', 'react-dom']
        }
      }
    }
  }
})
