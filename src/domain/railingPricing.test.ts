import { describe, expect, it } from 'vitest'
import { calculateRailingPrice, DEFAULT_PRICE_LIST } from './railingPricing'
import type { ProfilePart } from './railingProfile'

const section = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
const part: ProfilePart = {
  start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, direction: { x: 1, y: 0 },
  startMiter: { x: 0, y: -1 }, endMiter: { x: 0, y: -1 }, offset: 0, section,
  holes: [{ x: 50, y: -5 }, { x: 2950, y: -5 }],
}
const accessories = { glassShoes: [part, part], clampWedges: [part, part, part], sealLips: [part, part] }
const prices = {
  ...DEFAULT_PRICE_LIST, profilePerMeter: 10, glassShoe: 2, clampWedge: 3,
  sealLipPerMeter: 4, screw: 7, profileCut: 5, holeOver8: 6,
}

describe('railing price calculation', () => {
  it('calculates both seal lips, material, cuts, parts and each 14 mm hole', () => {
    const result = calculateRailingPrice([part], accessories, prices)
    expect(result.lines.map((line) => [line.label, line.quantity, line.total])).toEqual([
      ['Geländerschuh', 3, 30], ['Glasschuhe', 2, 4], ['Klemmleisten', 3, 9],
      ['Dichtlippen (beide Bahnen)', 6, 24], ['Senkkopfschraube Ø 10,0 × 105,0 mm (schematisch)', 2, 14],
      ['Zuschnitt Geländerschuh', 2, 10], ['Bohrungen Ø 14 mm', 2, 12],
    ])
    expect(result.total).toBe(103)
  })

  it('uses the maximum stock length including miter projection', () => {
    const mitered = { ...part, endMiter: { x: 0.5, y: -1 } }
    const result = calculateRailingPrice([mitered], { glassShoes: [], clampWedges: [], sealLips: [] }, prices)
    expect(result.lines[0].quantity).toBeCloseTo(3.005)
  })

  it('calculates 7A Torbandschrauben and both 11 mm drilling operations per fixing', () => {
    const result = calculateRailingPrice([part], { glassShoes: [], clampWedges: [], sealLips: [] }, prices, '7A')
    expect(result.lines.map((line) => [line.label, line.quantity, line.total])).toEqual([
      ['Geländerschuh', 3, 30],
      ['Torbandschraube DIN 603 M10×30,0, Kopf Ø 25,0 × 5,0 mm mit Mutter DIN 934 M10', 2, 14],
      ['Zuschnitt Geländerschuh', 2, 10],
      ['Bohrungen Ø 11 mm', 4, 24],
    ])
    expect(result.total).toBe(78)
  })

  it('rejects missing and invalid required prices rather than charging zero', () => {
    expect(() => calculateRailingPrice([part], accessories, DEFAULT_PRICE_LIST)).toThrow('Geländerschuh')
    expect(() => calculateRailingPrice([part], accessories, { ...prices, holeOver8: -1 })).toThrow('Bohrungen')
    expect(calculateRailingPrice([], { glassShoes: [], clampWedges: [], sealLips: [] }, DEFAULT_PRICE_LIST).total).toBe(0)
  })
})
