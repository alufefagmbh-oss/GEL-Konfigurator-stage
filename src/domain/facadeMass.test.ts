import { describe, expect, it } from 'vitest'
import { calculateFacadeAreaSquareMeters, calculateFacadeMassKilograms } from './facadeMass'
import { calculateFacadeLayout } from './facadeLayout'
import { DEFAULT_END_GAP } from './endGap'
import { getStandardProfile } from './standardProfiles'
import type { FacadeConfiguration } from './types'
import { parseUkRailDxf } from '../dxf/parseUkRailDxf'
import { readFileSync } from 'node:fs'

function configuration(width = 600, height = 1000): FacadeConfiguration {
  return {
    width,
    height,
    endGap: DEFAULT_END_GAP,
    profileColor: '#ffffff',
    profile: getStandardProfile('even'),
    facadeEnds: { left: 'low', right: 'low' },
  }
}

describe('facade summary calculations', () => {
  it('calculates facade area in square meters', () => {
    expect(calculateFacadeAreaSquareMeters(configuration(3000, 2500))).toBe(7.5)
  })

  it('calculates profile mass using the aluminum cross-section, cut length, and 2.7 g/cm³ density', () => {
    const facade = configuration()
    const layout = calculateFacadeLayout(facade)
    const profileCount = layout.profileCount
    const netProfileArea = Math.abs(facade.profile.contours[0].area)
    const expectedMass = netProfileArea * (facade.height - 2 * DEFAULT_END_GAP) * profileCount * 2.7 / 1_000_000

    expect(calculateFacadeMassKilograms(facade, layout, null)).toBeCloseTo(expectedMass, 8)
  })

  it('includes the active UK rail cross-section in total facade mass', () => {
    const facade = configuration()
    const layout = calculateFacadeLayout(facade)
    const profile = parseUkRailDxf(readFileSync(
      new URL('../../public/genUK-Schiene.dxf', import.meta.url),
      'utf8',
    ))
    const railPlacements = [{ startX: 10, endX: 590, centerHeight: 200 }]
    const profileMass = calculateFacadeMassKilograms(facade, layout, null)
    const railMass = Math.abs(profile.contours[0].area) * 580 * 2.7 / 1_000_000

    expect(calculateFacadeMassKilograms(facade, layout, null, profile, railPlacements))
      .toBeCloseTo(profileMass + railMass, 8)
  })

  it('returns zero mass when the layout or profile lengths are invalid', () => {
    const facade = configuration(600, 10)
    const layout = calculateFacadeLayout(facade)

    expect(calculateFacadeMassKilograms(facade, layout, null)).toBe(0)
    expect(calculateFacadeMassKilograms(facade, { ...layout, isValid: false }, null)).toBe(0)
  })
})
