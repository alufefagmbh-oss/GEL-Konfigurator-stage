import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRailingCalculationPdf } from './createRailingCalculationPdf'
import type { RailingCalculation } from '../domain/railingPricing'

vi.mock('./loadPdfLogo', () => ({
  loadPdfLogo: vi.fn(async () => ({ dataUrl: 'data:image/jpeg;base64,bG9nbw==', width: 1244, height: 245 })),
}))

const calls = vi.hoisted(() => ({ addImage: vi.fn(), addPage: vi.fn(), save: vi.fn(), text: vi.fn() }))
vi.mock('jspdf', () => ({
  jsPDF: class {
    internal = { pageSize: { getHeight: () => 297 } }
    setFont() {}
    setFontSize() {}
    text = calls.text
    setDrawColor() {}
    line() {}
    splitTextToSize(value: string) { return [value] }
    addImage = calls.addImage
    addPage = calls.addPage
    save = calls.save
  },
}))

const image = { dataUrl: 'data:image/jpeg;base64,dGVzdA==', width: 1200, height: 600 }
const calculation: RailingCalculation = {
  lines: [{ label: 'Geländerschuh', quantity: 3, unit: 'lfm', unitPrice: 10, total: 30 }],
  total: 30,
}

beforeEach(() => vi.clearAllMocks())

describe('Kalkulations-PDF mit Ansicht', () => {
  it('includes the new logo and places the viewer image below the calculation without distortion', async () => {
    await createRailingCalculationPdf(calculation, 'Test', 'Kunde', image, 12.5)
    expect(calls.addImage).toHaveBeenCalledTimes(2)
    const [logoData, logoFormat, logoX, logoY, logoWidth, logoHeight] = calls.addImage.mock.calls[0]
    expect([logoData, logoFormat, logoX, logoY]).toEqual(['data:image/jpeg;base64,bG9nbw==', 'JPEG', 15, 8])
    expect(logoWidth / logoHeight).toBeCloseTo(1244 / 245)
    const [data, format, x, y, width, height] = calls.addImage.mock.calls[1]
    expect([data, format, x]).toEqual([image.dataUrl, 'JPEG', 15])
    expect(y).toBeGreaterThan(100)
    expect(width / height).toBeCloseTo(2)
    expect(y + height).toBeLessThanOrEqual(282)
    expect(calls.save).toHaveBeenCalledOnce()
    expect(calls.text).toHaveBeenCalledWith('Verpackung und Versand', 15, expect.any(Number))
    expect(calls.text).toHaveBeenCalledWith('42,50 EUR', 195, expect.any(Number), { align: 'right' })
  })

  it('uses a new page if there is not enough room', async () => {
    await createRailingCalculationPdf({ lines: Array(25).fill(calculation.lines[0]), total: 750 }, '', '', image, 0)
    expect(calls.addPage).toHaveBeenCalledOnce()
    expect(calls.addImage.mock.calls[1][3]).toBe(30)
  })

  it('rejects invalid images instead of producing an incomplete PDF', async () => {
    await expect(createRailingCalculationPdf(calculation, '', '', { ...image, width: 0 }, 0)).rejects.toThrow('ungültig')
    expect(calls.save).not.toHaveBeenCalled()
  })

  it('rejects invalid shipping and accepts an explicit zero amount', async () => {
    await expect(createRailingCalculationPdf(calculation, '', '', image, -1)).rejects.toThrow('Verpackung und Versand')
    await expect(createRailingCalculationPdf(calculation, '', '', image, 1.001)).rejects.toThrow('Verpackung und Versand')
    await createRailingCalculationPdf(calculation, '', '', image, 0)
    expect(calls.text).toHaveBeenCalledWith('30,00 EUR', 195, expect.any(Number), { align: 'right' })
  })
})
