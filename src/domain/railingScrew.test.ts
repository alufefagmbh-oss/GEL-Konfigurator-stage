import { describe, expect, it } from 'vitest'
import { calculateSlabContour } from './concreteSlab'
import { calculateProfileParts, PROFILE_FLOOR_HEIGHT } from './railingProfile'
import { RAILING_SCREW_HEAD_HEIGHT, RAILING_SCREW_LENGTH, RAILING_SCREW_RADIUS, railingScrewPlacements } from './railingScrew'
import { DEFAULT_STATIC_ASSUMPTIONS } from './staticAssumptions'
import { GEL2001_PROFILE } from '../dxf/gel2001Profile'

describe('Schrauben für Vorschau und Export', () => {
  it('uses the holes of all split and mitered profiles as screw positions', () => {
    const contour = calculateSlabContour([{ length: 5000, angle: 180 }, { length: 1000, angle: 270 }], 500)
    if (!contour.dimensions) throw new Error('Ungültige Testkontur')
    const parts = calculateProfileParts(contour.dimensions, GEL2001_PROFILE, 20, DEFAULT_STATIC_ASSUMPTIONS)
    const placements = railingScrewPlacements(parts, 200)
    const holes = parts.flatMap((part) => part.holes)
    expect(parts).toHaveLength(3)
    expect(placements).toEqual(holes.map((hole) => ({ x: hole.x, y: hole.y, headHeight: 200 + PROFILE_FLOOR_HEIGHT })))
    expect(railingScrewPlacements([], 200)).toEqual([])
    expect(RAILING_SCREW_LENGTH).toBe(105)
    expect(RAILING_SCREW_RADIUS).toBe(5)
    expect(RAILING_SCREW_HEAD_HEIGHT).toBe(5.5)
  })
})
