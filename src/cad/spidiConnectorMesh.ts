import type { SpidiConnectorBounds } from '../domain/types'

export interface SpidiConnectorMeshData {
  length: number
  positions: Float32Array
  bounds: SpidiConnectorBounds
}

type SpidiMeshWorkerMessage =
  | { type: 'result'; positions: ArrayBuffer; bounds: SpidiConnectorBounds }
  | { type: 'error'; message: string }

const meshCache = new Map<number, Promise<SpidiConnectorMeshData>>()

export function loadSpidiConnectorMesh(length: number): Promise<SpidiConnectorMeshData> {
  const cached = meshCache.get(length)
  if (cached) return cached
  const promise = loadMeshUncached(length)
  meshCache.set(length, promise)
  promise.catch(() => meshCache.delete(length))
  return promise
}

function loadMeshUncached(length: number): Promise<SpidiConnectorMeshData> {
  const worker = new Worker(new URL('./spidiConnectorMesh.worker.ts', import.meta.url), { type: 'module' })

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      worker.terminate()
      callback()
    }

    worker.addEventListener('message', (event: MessageEvent<SpidiMeshWorkerMessage>) => {
      const message = event.data
      if (message.type === 'result') {
        finish(() => resolve({ length, positions: new Float32Array(message.positions), bounds: message.bounds }))
      } else {
        finish(() => reject(new Error(message.message)))
      }
    })
    worker.addEventListener('error', (event) => {
      finish(() => reject(new Error(event.message || 'Das Maueranschlussteil konnte nicht geladen werden.')))
    })
    worker.addEventListener('messageerror', () => {
      finish(() => reject(new Error('Die Meshdaten des Maueranschlussteils konnten nicht gelesen werden.')))
    })
    worker.postMessage({ length })
  })
}
