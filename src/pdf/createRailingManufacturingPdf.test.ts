import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRailingManufacturingPdf } from './createRailingManufacturingPdf'
import type { ManufacturingData } from '../domain/railingManufacturing'
import { GEL2001_PROFILE } from '../dxf/gel2001Profile'
import { visibleSectionEdges } from './drawRailingProfileSketch'

const calls = vi.hoisted(() => ({
  text: vi.fn(), addPage: vi.fn(), save: vi.fn(), line: vi.fn(), circle: vi.fn(), addImage: vi.fn(), svg: vi.fn(),
}))
vi.mock('svg2pdf.js', () => ({ svg2pdf: calls.svg }))
vi.mock('jspdf', () => ({
  jsPDF: class {
    internal = { pageSize: { getHeight: () => 297 } }
    setFont() {}
    setFontSize() {}
    setDrawColor() {}
    setLineWidth() {}
    line = calls.line
    circle = calls.circle
    addImage = calls.addImage
    text = calls.text
    addPage = calls.addPage
    save = calls.save
    splitTextToSize(value: string) { return [value] }
  },
}))

const data: ManufacturingData = {
  items: [{ position: 'G001', quantity: 1, description: 'GEL2001 Geländerschuh', length: 3000, note: 'Profile P001' }],
  profiles: [{
    position: 'P001', quantity: 1, contourStart: { x: 0, y: 0 }, contourEnd: { x: 3000, y: 0 }, stockLength: 3000, width: 53,
    startAtZero: 0, startAtWidth: 0, endAtZero: 3000, endAtWidth: 3000,
    startAngle: 0, endAngle: 0, section: GEL2001_PROFILE, holes: [{ longitudinal: 50, lateral: 26.5 }],
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.svg.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, text: async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1190.8 842.14"/>',
  })))
  vi.stubGlobal('DOMParser', class {
    parseFromString() {
      return {
        documentElement: { localName: 'svg', cloneNode: () => ({ localName: 'svg' }) },
        querySelector: () => null,
      }
    }
  })
})

describe('AV PDF', () => {
  it('includes the A3 layout and one dimensioned drawing per profile', async () => {
    await createRailingManufacturingPdf(data, 'Test')
    const text = calls.text.mock.calls.map((call) => String(call[0])).join('\n')
    expect(text).toContain('Bezeichnung / Länge')
    expect(text).toContain('Hinweis')
    expect(text).toContain('001')
    expect(text).toContain('GEL2001 Geländerschuh / 3.000,0 mm')
    expect(text).not.toContain('G001')
    expect(text).not.toContain('Gerade geschnitten')
    expect(text).toContain('Bearbeitung P001')
    expect(text).toContain('äußersten Anfangspunkt')
    expect(text).toContain('50,0')
    expect(text).toContain('26,5')
    expect(text).toContain('Ø 14,0 mm')
    expect(text).toContain('Ø 21,0 mm')
    expect(text).toContain('fachlich prüfen')
    expect(text).toContain('Zeichnung P001 - GEL2001 Draufsicht')
    expect(text).toContain('01  X 50,0  Y 26,5')
    expect(calls.circle).toHaveBeenCalledTimes(2)
    expect(calls.svg).toHaveBeenCalledTimes(calls.addPage.mock.calls.length + 1)
    expect(calls.svg.mock.calls[0][2]).toEqual({ x: 0, y: 0, width: 420, height: 297 })
    expect(calls.addImage).not.toHaveBeenCalled()
    expect(calls.save).toHaveBeenCalledOnce()
  })

  it('numbers list positions consecutively regardless of internal item identifiers', async () => {
    await createRailingManufacturingPdf({
      items: [
        { position: 'G014', quantity: 2, description: 'Profile', length: 1200, note: '' },
        { position: 'S098', quantity: 7, description: 'Glasschuhe', length: null, note: '' },
        { position: 'S099', quantity: 14, description: 'Klemmleisten', length: null, note: '' },
      ],
      profiles: [],
    }, '')
    const text = calls.text.mock.calls.map((call) => String(call[0])).join('\n')
    expect(text).toContain('001')
    expect(text).toContain('002')
    expect(text).toContain('003')
    expect(text).not.toContain('G014')
    expect(text).not.toContain('S098')
  })

  it('puts all 37 hole coordinates on the same drawing page', async () => {
    const holes = Array.from({ length: 37 }, (_, index) => ({ longitudinal: 50 + index * 3900 / 36, lateral: 26.5 }))
    await createRailingManufacturingPdf({ ...data, profiles: [{ ...data.profiles[0], stockLength: 4000, endAtZero: 4000, endAtWidth: 4000, holes }] }, '')
    expect(calls.text.mock.calls.some((call) => String(call[0]).includes('37  X 3.950,0  Y 26,5'))).toBe(true)
    expect(calls.circle).toHaveBeenCalledTimes(74)
    expect(calls.text.mock.calls.filter((call) => String(call[0]).startsWith('Zeichnung P001'))).toHaveLength(1)
  })

  it('uses the same scale for profile length, width and both hole diameters', async () => {
    await createRailingManufacturingPdf(data, '')
    const scale = 340 / 3000
    const profileEdges = calls.line.mock.calls.filter((call) => Math.abs(call[2] - call[0] - 340) < 0.001
      && Math.abs(call[1] - call[3]) < 0.001
      && (Math.abs(call[1] - 164) < 0.001 || Math.abs(call[1] - (164 - 53 * scale)) < 0.001))
    expect(profileEdges).toHaveLength(2)
    const [first, second] = profileEdges
    expect(first[2] - first[0]).toBeCloseTo(3000 * scale)
    expect(first[1] - second[1]).toBeCloseTo(53 * scale)
    expect(calls.circle.mock.calls[0][2]).toBeCloseTo(10.5 * scale)
    expect(calls.circle.mock.calls[1][2]).toBeCloseTo(7 * scale)
  })

  it('separates labels for closely spaced holes with leaders to their real positions', async () => {
    await createRailingManufacturingPdf({ ...data, profiles: [{ ...data.profiles[0], holes: [
      { longitudinal: 50, lateral: 26.5 }, { longitudinal: 50.1, lateral: 26.5 },
    ] }] }, '')
    const labels = calls.text.mock.calls.filter((call) => /^0[12]  X /.test(String(call[0])))
    expect(labels).toHaveLength(2)
    expect(labels[1][1] - labels[0][1]).toBeCloseTo(3.2)
    expect(calls.circle).toHaveBeenCalledTimes(4)
  })

  it('keeps the actual upper contour and excludes the concealed lower section edges', () => {
    const edges = visibleSectionEdges(GEL2001_PROFILE)
    expect(edges.some((x) => Math.abs(x - 47.515) < 0.01)).toBe(true)
    const section = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]
    expect(visibleSectionEdges(section)).toEqual([0, 4])
  })
})
