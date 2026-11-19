import type { SlabPoint } from '../domain/concreteSlab'
import type { ProfilePart } from '../domain/railingProfile'
import type { GlassPanel, RailingAccessoryLayout } from '../domain/railingAccessories'
import type { RailingMounting } from '../domain/railingMounting'

export interface SlabStepRequest {
  points: SlabPoint[]
  thickness: number
  profiles: ProfilePart[]
  accessories: RailingAccessoryLayout
  glassPanels: GlassPanel[]
  mounting?: RailingMounting
}

type WorkerMessage = { type: 'progress'; message: string; progress: number }
  | { type: 'result'; data: ArrayBuffer }
  | { type: 'error'; message: string }

const WORKER_START_TIMEOUT_MS = 30_000
const EXPORT_TIMEOUT_MS = 180_000

export function exportSlabStep(request: SlabStepRequest, onProgress: (message: string, progress: number) => void): Promise<Blob> {
  const worker = new Worker(new URL('./slabStepExport.worker.ts', import.meta.url), { type: 'module' })
  return new Promise((resolve, reject) => {
    let settled = false
    let started = false
    const startTimer = window.setTimeout(() => {
      finish(() => reject(new Error('Der CAD-Worker meldet sich nicht. Bitte Browserseite neu laden und erneut versuchen.')))
    }, WORKER_START_TIMEOUT_MS)
    const exportTimer = window.setTimeout(() => {
      finish(() => reject(new Error('Die STEP-Generierung hat die Zeitüberschreitung erreicht. Bitte erneut versuchen oder ein kleineres Modell exportieren.')))
    }, EXPORT_TIMEOUT_MS)
    function finish(callback: () => void) {
      if (settled) return
      settled = true
      clearTimeout(startTimer)
      clearTimeout(exportTimer)
      worker.terminate()
      callback()
    }
    worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      if (!started) {
        started = true
        clearTimeout(startTimer)
      }
      if (message.type === 'progress') onProgress(message.message, message.progress)
      else if (message.type === 'result') finish(() => resolve(new Blob([message.data], { type: 'model/step' })))
      else finish(() => reject(new Error(message.message)))
    })
    worker.addEventListener('error', (event) => finish(() => reject(new Error(event.message || 'Der STEP-Export ist fehlgeschlagen.'))))
    worker.addEventListener('messageerror', () => finish(() => reject(new Error('Die STEP-Exportdaten konnten nicht gelesen werden.'))))
    worker.postMessage(request)
  })
}
