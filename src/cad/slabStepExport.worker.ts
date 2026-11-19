import type { SlabStepRequest } from './slabStepExport'

self.onmessage = (event: MessageEvent<SlabStepRequest>) => {
  self.postMessage({ type: 'progress', message: 'CAD-Worker gestartet, CAD-Kernel wird geladen …', progress: 2 })
  void import('./slabStepExportCore').then(({ createStep }) => createStep(event.data)).then((data) => {
    const buffer = data.slice().buffer
    self.postMessage({ type: 'result', data: buffer }, { transfer: [buffer] })
  }).catch((error: unknown) => {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Der STEP-Export ist fehlgeschlagen.' })
  })
}
