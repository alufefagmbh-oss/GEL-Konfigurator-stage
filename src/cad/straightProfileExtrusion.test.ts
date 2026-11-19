import { describe, expect, it } from 'vitest'
import type { ProfilePart } from '../domain/railingProfile'
import { profilePoint } from '../domain/railingProfile'
import { straightProfileExtrusion } from './straightProfileExtrusion'

describe('straight STEP profile extrusion', () => {
  const part: ProfilePart = {
    start: { x: 100, y: 200 }, end: { x: 160, y: 280 },
    direction: { x: 0.6, y: 0.8 }, startMiter: { x: 0.8, y: -0.6 },
    endMiter: { x: 0.8, y: -0.6 }, offset: 12,
    section: [{ x: 2, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 10 }], holes: [{ x: 130, y: 240 }],
  }

  it('preserves both ends and the elevation for a rotated, offset section', () => {
    const result = straightProfileExtrusion(part, 200)
    expect(result).not.toBeNull()
    if (!result) throw new Error('Direkte Extrusion erwartet.')
    part.section.forEach((point, index) => {
      const start = profilePoint(part, point, false)
      const end = profilePoint(part, point, true)
      expect(result.section[index][0]).toBeCloseTo(start.x)
      expect(result.section[index][1]).toBeCloseTo(start.y)
      expect(result.section[index][2]).toBeCloseTo(200 + point.y)
      expect(result.section[index][0] + result.vector[0]).toBeCloseTo(end.x)
      expect(result.section[index][1] + result.vector[1]).toBeCloseTo(end.y)
    })
  })

  it('retains the boolean path for a mitered or non-aligned part', () => {
    expect(straightProfileExtrusion({ ...part, startMiter: { x: 1, y: -0.6 } }, 200)).toBeNull()
    expect(straightProfileExtrusion({ ...part, endMiter: { x: 1, y: -0.6 } }, 200)).toBeNull()
    expect(straightProfileExtrusion({ ...part, end: { x: 160, y: 281 } }, 200)).toBeNull()
    expect(straightProfileExtrusion({ ...part, end: part.start }, 200)).toBeNull()
  })
})
