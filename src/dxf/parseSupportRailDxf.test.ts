import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSupportRailDxf } from './parseSupportRailDxf'

const drawing = () => readFileSync(new URL('../../public/genAuflager-Schiene.dxf', import.meta.url), 'utf8')

describe('Auflager-Schienen-DXF', () => {
  it('reads the contour with the rear face as depth zero and the support tab height', () => {
    const profile = parseSupportRailDxf(drawing())
    expect(profile.depth).toBeCloseTo(33.5, 6)
    expect(profile.height).toBeCloseTo(106.5, 6)
    expect(profile.supportHeight).toBeCloseTo(1.5, 5)
    const points = profile.contours[0].points
    expect(Math.min(...points.map((point) => point.x))).toBeCloseTo(0, 6)
    expect(Math.max(...points.map((point) => point.x))).toBeCloseTo(33.5, 6)
    const tabTip = points.filter((point) => point.x > 33.4)
    expect(tabTip.some((point) => point.y < 1.6)).toBe(true)
  })

  it('rejects drawings without the support marker', () => {
    expect(() => parseSupportRailDxf(drawing().replaceAll('Auflage_Profile', 'OTHER'))).toThrow(/Auflage_Profile/)
  })
})
