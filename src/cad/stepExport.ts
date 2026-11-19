import type { FacadeConfiguration, ProfileDisplayMode, ProfilePlacement, UkMountingExportData, UkRailPlacement, UkRailProfile, WallContour } from '../domain/types'

export interface StepExportRequest {
  configuration: Pick<FacadeConfiguration, 'width' | 'height' | 'endGap' | 'profile' | 'profileColor' | 'masonryView' | 'ukRailView'>
  profileDisplayMode: ProfileDisplayMode
  placements: ProfilePlacement[]
  spacingDeviations: number[]
  wallContour: WallContour | null
  ukRailProfile: UkRailProfile | null
  ukRailPlacements: UkRailPlacement[]
  ukMountingData?: UkMountingExportData | null
}

type StepWorkerMessage =
  | { type: 'progress'; message: string; progress: number }
  | { type: 'result'; data: ArrayBuffer }
  | { type: 'error'; message: string }

const WORKER_START_TIMEOUT_MS = 30_000

export function exportFacadeStep(
  request: StepExportRequest,
  onProgress: (message: string, progress: number) => void,
): Promise<Blob> {
  const worker = new Worker(new URL('./stepExport.worker.ts', import.meta.url), { type: 'module' })

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      worker.terminate()
      callback()
    }

    worker.addEventListener('message', (event: MessageEvent<StepWorkerMessage>) => {
      const message = event.data
      if (message.type === 'progress') {
        onProgress(message.message, message.progress)
      } else if (message.type === 'result') {
        finish(() => resolve(new Blob([message.data], { type: 'model/step' })))
      } else {
        finish(() => reject(new Error(message.message)))
      }
    })
    worker.addEventListener('error', (event) => {
      finish(() => reject(new Error(event.message || 'Der STEP-Export ist fehlgeschlagen.')))
    })
    worker.addEventListener('messageerror', () => {
      finish(() => reject(new Error('Die STEP-Exportdaten konnten nicht gelesen werden.')))
    })
    const startTimer = window.setTimeout(() => {
      finish(() => reject(new Error('Der CAD-Worker hat nicht gestartet. Bitte Seite neu laden und erneut versuchen.')))
    }, WORKER_START_TIMEOUT_MS)
    worker.addEventListener('message', () => window.clearTimeout(startTimer), { once: true })
    worker.postMessage(request)
  })
}
