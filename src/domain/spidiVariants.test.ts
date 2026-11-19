import { describe, expect, it } from 'vitest'
import { getSpidiVariantUnavailableMessage, selectSpidiVariant } from './spidiVariants'

describe('Spidi variant selection', () => {
  it('selects the variant by rail-to-wall gap with inclusive lower and exclusive upper bound', () => {
    expect(selectSpidiVariant(74)?.length).toBe(65)
    expect(selectSpidiVariant(93.9)?.length).toBe(65)
    expect(selectSpidiVariant(94)?.length).toBe(85)
    expect(selectSpidiVariant(137.9)?.length).toBe(110)
    expect(selectSpidiVariant(219)?.length).toBe(210)
    expect(selectSpidiVariant(243.9)?.length).toBe(210)
  })

  it('has no variant below 74 mm and from 244 mm', () => {
    expect(selectSpidiVariant(73.9)).toBeNull()
    expect(selectSpidiVariant(244)).toBeNull()
    expect(selectSpidiVariant(-5)).toBeNull()
    expect(selectSpidiVariant(Number.NaN)).toBeNull()
    expect(getSpidiVariantUnavailableMessage(60)).toMatch(/kein Spidi/)
  })
})
