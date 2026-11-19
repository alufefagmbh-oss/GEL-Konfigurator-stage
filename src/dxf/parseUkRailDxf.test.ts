import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseUkRailDxf } from './parseUkRailDxf'

const drawing = readFileSync(new URL('../../public/genUK-Schiene.dxf', import.meta.url), 'utf8')

describe('UK-Schienen-DXF', () => {
  it('reads the screw head seating plane from the Ebene 1 marker', () => {
    const profile = parseUkRailDxf(drawing)
    expect(profile.screwHeadPlaneDepth).toBeCloseTo(15)
    expect(profile.centerAxisHeight).toBe(0)
  })

  it('requires the screw head marker to cross the middle axis', () => {
    expect(() => parseUkRailDxf(drawing.replaceAll('Ebene 1', 'Andere Ebene'))).toThrow(/Layer Ebene 1/)
  })
})
