import { HOLE_RADIUS, profileCenterlineLength, profileStockLength } from './railingProfile'
import type { ProfilePart } from './railingProfile'
import type { RailingAccessoryLayout } from './railingAccessories'
import { RAILING_SCREW_LENGTH, RAILING_SCREW_RADIUS, railingScrewPlacements } from './railingScrew'
import { SIDE_FIXING_DESCRIPTION, SIDE_FIXING_HOLE_DIAMETER, type RailingMounting } from './railingMounting'

export const RAILING_SCREW_DESCRIPTION = `Senkkopfschraube Ø ${RAILING_SCREW_RADIUS * 2},0 × ${RAILING_SCREW_LENGTH},0 mm (schematisch)`

export interface PriceList {
  profilePerMeter: number | null
  profileStockLengthMm: number
  glassShoe: number | null
  clampWedge: number | null
  sealLipPerMeter: number | null
  screw: number | null
  profileCut: number | null
  holeUpTo4: number | null
  holeUpTo8: number | null
  holeOver8: number | null
}

// Startpreise werden hier hinterlegt; null bedeutet noch nicht festgelegt.
export const DEFAULT_PRICE_LIST: PriceList = {
  profilePerMeter: null, profileStockLengthMm: 4000,
  glassShoe: null, clampWedge: null, sealLipPerMeter: null, screw: null,
  profileCut: null, holeUpTo4: null, holeUpTo8: null, holeOver8: null,
}

export interface CalculationLine {
  label: string
  quantity: number
  unit: 'lfm' | 'Stk.'
  unitPrice: number
  total: number
}

export interface RailingCalculation {
  lines: CalculationLine[]
  total: number
}

export function calculateRailingPrice(profiles: ProfilePart[], accessories: RailingAccessoryLayout, prices: PriceList, mounting: RailingMounting = '7B'): RailingCalculation {
  const lines: CalculationLine[] = []
  const add = (label: string, quantity: number, unit: CalculationLine['unit'], rate: number | null) => {
    if (quantity <= 0) return
    if (rate === null || !Number.isFinite(rate) || rate < 0) throw new Error(`Bitte unter „Preise eingeben“ einen gültigen Preis für ${label} eingeben.`)
    const total = Math.round((quantity * rate + Number.EPSILON) * 100) / 100
    lines.push({ label, quantity, unit, unitPrice: rate, total })
  }
  add('Geländerschuh', profiles.reduce((sum, part) => sum + profileStockLength(part), 0) / 1000, 'lfm', prices.profilePerMeter)
  add('Glasschuhe', accessories.glassShoes.length, 'Stk.', prices.glassShoe)
  add('Klemmleisten', accessories.clampWedges.length, 'Stk.', prices.clampWedge)
  add('Dichtlippen (beide Bahnen)', profileCenterlineLength(accessories.sealLips) / 1000, 'lfm', prices.sealLipPerMeter)
  const screwCount = mounting === '7A'
    ? profiles.reduce((sum, part) => sum + part.holes.length, 0)
    : railingScrewPlacements(profiles, 0).length
  add(mounting === '7A' ? SIDE_FIXING_DESCRIPTION : RAILING_SCREW_DESCRIPTION, screwCount, 'Stk.', prices.screw)
  add('Zuschnitt Geländerschuh', profiles.length * 2, 'Stk.', prices.profileCut)
  const diameter = mounting === '7A' ? SIDE_FIXING_HOLE_DIAMETER : HOLE_RADIUS * 2
  const holeCount = profiles.reduce((sum, part) => sum + part.holes.length, 0)
  const holeRate = diameter <= 4 ? prices.holeUpTo4 : diameter <= 8 ? prices.holeUpTo8 : prices.holeOver8
  add(`Bohrungen Ø ${diameter} mm`, holeCount * (mounting === '7A' ? 2 : 1), 'Stk.', holeRate)
  return { lines, total: Math.round(lines.reduce((sum, line) => sum + line.total, 0) * 100) / 100 }
}
