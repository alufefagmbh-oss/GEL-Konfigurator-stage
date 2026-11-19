import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseUkAngleDxf } from './parseUkAngleDxf'

describe('L-Winkel-DXF', () => {
  it('parses the supplied 50 × 40 × 2 mm profile and both positioning markers', () => {
    const drawing = readFileSync(new URL('../../public/gen_L-50-40-2.dxf', import.meta.url), 'utf8')
    const profile = parseUkAngleDxf(drawing)
    expect(profile.width).toBe(40)
    expect(profile.depth).toBe(50)
    expect(profile.centerAxisX).toBe(0)
    expect(profile.contours[0].points).toHaveLength(6)
  })

  it('rejects drawings without the installation-face marker', () => {
    const drawing = readFileSync(new URL('../../public/gen_L-50-40-2.dxf', import.meta.url), 'utf8')
    expect(() => parseUkAngleDxf(drawing.replaceAll('050_ALU_01', 'OTHER_LAYER'))).toThrow(/050_ALU_01/)
  })
})
