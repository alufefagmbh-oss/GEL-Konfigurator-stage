import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportSlabStep } from './slabStepExport'
import type { SlabStepRequest } from './slabStepExport'

class TestWorker extends EventTarget {
  static current: TestWorker
  terminate = vi.fn()
  postMessage = vi.fn()

  constructor() {
    super()
    TestWorker.current = this
  }

  send(data: object) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}

const request: SlabStepRequest = {
  points: [], thickness: 200, profiles: [],
  accessories: { sealLips: [], clampWedges: [], glassShoes: [] }, glassPanels: [],
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('Worker', TestWorker)
  vi.stubGlobal('window', globalThis)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('STEP worker startup', () => {
  it('keeps waiting for a slow kernel after the worker acknowledges startup', async () => {
    const progress = vi.fn()
    const result = exportSlabStep(request, progress)
    const worker = TestWorker.current
    worker.send({ type: 'progress', message: 'CAD-Kernel wird geladen', progress: 2 })
    await vi.advanceTimersByTimeAsync(31_000)
    expect(worker.terminate).not.toHaveBeenCalled()
    expect(progress).toHaveBeenCalledWith('CAD-Kernel wird geladen', 2)
    worker.send({ type: 'result', data: new Uint8Array([1, 2]).buffer })
    expect((await result).size).toBe(2)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('reports an unresponsive worker and terminates it', async () => {
    const result = exportSlabStep(request, vi.fn())
    const rejected = expect(result).rejects.toThrow('CAD-Worker meldet sich nicht')
    await vi.advanceTimersByTimeAsync(30_000)
    await rejected
    expect(TestWorker.current.terminate).toHaveBeenCalledOnce()
  })

  it('reports a kernel or export timeout after startup', async () => {
    const result = exportSlabStep(request, vi.fn())
    const rejected = expect(result).rejects.toThrow('STEP-Generierung hat die Zeitüberschreitung erreicht')
    TestWorker.current.send({ type: 'progress', message: 'CAD-Kernel wird geladen', progress: 2 })
    await vi.advanceTimersByTimeAsync(180_000)
    await rejected
    expect(TestWorker.current.terminate).toHaveBeenCalledOnce()
  })

  it('surfaces a worker error after startup', async () => {
    const result = exportSlabStep(request, vi.fn())
    TestWorker.current.send({ type: 'progress', message: 'CAD-Kernel wird geladen', progress: 2 })
    TestWorker.current.send({ type: 'error', message: 'Modul konnte nicht geladen werden.' })
    await expect(result).rejects.toThrow('Modul konnte nicht geladen werden.')
    expect(TestWorker.current.terminate).toHaveBeenCalledOnce()
  })
})
