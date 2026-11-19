import { describe, expect, it } from 'vitest'
import { RAL_CLASSIC_COLORS, RAL_MASONRY_COLORS } from './ralColors'

describe('RAL Classic color selection', () => {
  it('contains unique RAL codes and valid HEX color values', () => {
    const codes = RAL_CLASSIC_COLORS.map((color) => color.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(RAL_CLASSIC_COLORS.every((color) => /^#[0-9A-F]{6}$/.test(color.hex))).toBe(true)
  })

  it('includes the default light-gray RAL tone', () => {
    expect(RAL_CLASSIC_COLORS).toContainEqual({
      code: 'RAL 7035',
      name: 'lichtgrau',
      hex: '#CBD0CC',
    })
  })

  it('limits masonry colors to common beige, white, and gray plaster tones', () => {
    expect(RAL_MASONRY_COLORS.map(({ code }) => code)).toEqual([
      'RAL 1001',
      'RAL 1013',
      'RAL 1014',
      'RAL 1015',
      'RAL 1019',
      'RAL 7032',
      'RAL 7035',
      'RAL 7044',
      'RAL 9001',
      'RAL 9002',
      'RAL 9010',
      'RAL 9016',
    ])
    expect(RAL_MASONRY_COLORS.some(({ name }) => /blau|rot|grün/i.test(name))).toBe(false)
  })
})
