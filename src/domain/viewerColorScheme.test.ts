import { describe, expect, it } from 'vitest'
import { getProfileInfoColor, PROFILE_INFO_COLORS, UK_INFO_COLORS } from './viewerColorScheme'

describe('viewer information color scheme', () => {
  it('uses the profile spacing and switch colors used by the 3D viewer', () => {
    expect(getProfileInfoColor(-1, false)).toBe(PROFILE_INFO_COLORS.compressed)
    expect(getProfileInfoColor(1, false)).toBe(PROFILE_INFO_COLORS.stretched)
    expect(getProfileInfoColor(0, false)).toBe(PROFILE_INFO_COLORS.unchanged)
    expect(getProfileInfoColor(0, true)).toBe(PROFILE_INFO_COLORS.switch)
  })

  it('exposes the information colors for UK components', () => {
    expect(UK_INFO_COLORS).toEqual({
      rail: '#45C7C5',
      block: '#B8E6C3',
      angle: '#9BCFF5',
      connector: '#FF00FF',
      timber: '#C9A66B',
    })
  })
})
