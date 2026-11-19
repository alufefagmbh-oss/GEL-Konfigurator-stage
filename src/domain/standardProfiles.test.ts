import { describe, expect, it } from 'vitest'
import { createProfileGeometry } from '../geometry/createProfileGeometry'
import { getStandardProfile, STANDARD_PROFILES } from './standardProfiles'

describe('standard profiles', () => {
  it('provides the five selectable profile names in order', () => {
    expect(STANDARD_PROFILES.map((profile) => profile.name)).toEqual([
      'Even',
      'Cone',
      'Block 16',
      'Block 16L',
      'Block 25',
    ])
  })

  it('has millimeter contours and assigns the larger pitch only to Block 16L', () => {
    expect(STANDARD_PROFILES.every((profile) => profile.contours[0].points.length >= 3)).toBe(true)
    expect(STANDARD_PROFILES.map((profile) => profile.nominalSpacing)).toEqual([60, 60, 60, 120, 60])
    expect(getStandardProfile('block16L').width).toBeCloseTo(124.3428, 3)
  })

  it('creates valid extruded geometry for each standard contour', () => {
    for (const profile of STANDARD_PROFILES) {
      const geometry = createProfileGeometry(profile, 100)
      geometry.computeBoundingBox()

      expect(geometry.boundingBox!.max.x - geometry.boundingBox!.min.x).toBeCloseTo(profile.width, 3)
      expect(geometry.boundingBox!.max.z - geometry.boundingBox!.min.z).toBeCloseTo(profile.depth, 3)
      expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeCloseTo(100, 3)
      geometry.dispose()
    }
  })
})
