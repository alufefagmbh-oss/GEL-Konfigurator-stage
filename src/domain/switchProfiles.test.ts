import { describe, expect, it } from 'vitest'
import { getHighHighSwitchProfile, getLowLowSwitchProfile } from './switchProfiles'

describe('high-high switch profiles', () => {
  it.each([
    ['even', 32.2, 36.1],
    ['cone', 31.99894, 36.2],
    ['block16', 27.7, 26.601],
    ['block25', 27.7, 35.6],
  ])('provides the extracted %s switch contour', (profileId, expectedWidth, expectedDepth) => {
    const profile = getHighHighSwitchProfile(profileId)
    expect(profile).not.toBeNull()
    expect(profile?.width).toBeCloseTo(expectedWidth, 2)
    expect(profile?.depth).toBeCloseTo(expectedDepth, 2)
    expect(profile?.contours[0].points.length).toBeGreaterThanOrEqual(12)
  })

  it('has no high-high switch profile for Block 16L', () => {
    expect(getHighHighSwitchProfile('block16L')).toBeNull()
  })

  it('uses the separate rear switch contour for low-low ends', () => {
    const profile = getLowLowSwitchProfile()

    expect(profile.name).toBe('Hinteres Wechselprofil')
    expect(profile.id).toBe('rear-switch')
    expect(profile.width).toBeCloseTo(39.4, 2)
    expect(profile.depth).toBeCloseTo(10.6, 2)
    expect(Math.max(...profile.contours[0].points.map((point) => point.y))).toBeCloseTo(0, 8)
    expect(Math.min(...profile.contours[0].points.map((point) => point.y))).toBeCloseTo(-10.6, 2)
  })
})
