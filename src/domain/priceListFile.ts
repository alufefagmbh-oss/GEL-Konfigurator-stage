import type { PriceList } from './railingPricing'

export interface NamedPriceList {
  name: string
  prices: PriceList
}

const priceKeys = ['profilePerMeter', 'glassShoe', 'clampWedge', 'sealLipPerMeter',
  'screw', 'profileCut', 'holeUpTo4', 'holeUpTo8', 'holeOver8'] as const

export function serializePriceList(list: NamedPriceList): string {
  return JSON.stringify({ format: 'gelaender-preisliste', version: 1, ...list }, null, 2)
}

export function parsePriceList(contents: string): NamedPriceList {
  let value: unknown
  try { value = JSON.parse(contents) } catch { throw new Error('Die Preisdatei enthält kein gültiges JSON.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Die Preisdatei ist ungültig.')
  const record = value as Record<string, unknown>
  if (record.format !== 'gelaender-preisliste' || record.version !== 1 || typeof record.name !== 'string' || !record.name.trim()
    || !record.prices || typeof record.prices !== 'object' || Array.isArray(record.prices)) {
    throw new Error('Die Preisdatei hat ein ungültiges oder nicht unterstütztes Format.')
  }
  const input = record.prices as Record<string, unknown>
  const length = input.profileStockLengthMm
  if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0) throw new Error('Die Rohprofillänge in der Preisdatei ist ungültig.')
  const prices: PriceList = {
    profileStockLengthMm: length,
    profilePerMeter: null, glassShoe: null, clampWedge: null, sealLipPerMeter: null,
    screw: null, profileCut: null, holeUpTo4: null, holeUpTo8: null, holeOver8: null,
  }
  for (const key of priceKeys) {
    const price = input[key]
    if (price !== null && (typeof price !== 'number' || !Number.isFinite(price) || price < 0)) {
      throw new Error(`Die Preisdatei enthält einen ungültigen oder fehlenden Wert für ${key}.`)
    }
    prices[key] = price
  }
  return { name: record.name.trim(), prices }
}
