import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICE_LIST } from './railingPricing'
import { parsePriceList, serializePriceList } from './priceListFile'

describe('Preisdateien', () => {
  const list = { name: 'Kunde A', prices: { ...DEFAULT_PRICE_LIST, profilePerMeter: 42, screw: 1.25 } }
  it('round-trips names, empty values and screw prices', () => {
    expect(parsePriceList(serializePriceList(list))).toEqual(list)
  })
  it('rejects malformed, unsupported and incomplete files', () => {
    expect(() => parsePriceList('{')).toThrow()
    expect(() => parsePriceList(JSON.stringify({ format: 'gelaender-preisliste', version: 2, ...list }))).toThrow()
    expect(() => parsePriceList(JSON.stringify({ format: 'gelaender-preisliste', version: 1, name: 'A', prices: { ...list.prices, screw: -1 } }))).toThrow()
    expect(() => parsePriceList(JSON.stringify({ format: 'gelaender-preisliste', version: 1, name: 'A', prices: { ...list.prices, screw: undefined } }))).toThrow()
  })
})
