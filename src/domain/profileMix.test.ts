import { describe, expect, it } from 'vitest'
import { calculateFacadeLayout } from './facadeLayout'
import { getFacadeProfilePlacements } from './profilePlacement'
import { getProfileSequenceIds } from './profileMix'
import { getStandardProfile } from './standardProfiles'
import type { FacadeConfiguration } from './types'

const base: FacadeConfiguration = {
  width: 3000,
  height: 2000,
  profileColor: '#888888',
  profile: getStandardProfile('even'),
  facadeEnds: { left: 'high', right: 'low' },
}

describe('Profilmischung', () => {
  it('wiederholt das Modul über die Breite', () => {
    const configuration = {
      ...base,
      profileMix: { mode: 'module' as const, module: ['even', 'cone', 'block16'], percentages: {}, seed: 1 },
    }
    expect(getProfileSequenceIds(configuration, 7)).toEqual(['even', 'cone', 'block16', 'even', 'cone', 'block16', 'even'])
  })

  it('verteilt Prozentwerte reproduzierbar mit festem Seed', () => {
    const configuration = {
      ...base,
      profileMix: { mode: 'percent' as const, module: [], percentages: { even: 50, cone: 30, block25: 20 }, seed: 7 },
    }
    const first = getProfileSequenceIds(configuration, 50)
    expect(getProfileSequenceIds(configuration, 50)).toEqual(first)
    expect(first.filter((id) => id === 'even')).toHaveLength(25)
    expect(first.filter((id) => id === 'cone')).toHaveLength(15)
    expect(first.filter((id) => id === 'block25')).toHaveLength(10)
  })

  it('meldet Prozentsummen ungleich 100 als ungültiges Layout', () => {
    const layout = calculateFacadeLayout({
      ...base,
      profileMix: { mode: 'percent', module: [], percentages: { even: 50, cone: 30 }, seed: 1 },
    })
    expect(layout.isValid).toBe(false)
    expect(layout.error).toContain('100 %')
  })

  it('platziert gemischte Profile mit bündiger Rückseite', () => {
    const configuration = {
      ...base,
      profileMix: { mode: 'module' as const, module: ['even', 'block16'], percentages: {}, seed: 1 },
    }
    const layout = calculateFacadeLayout(configuration)
    expect(layout.isValid).toBe(true)
    const placements = getFacadeProfilePlacements(configuration, layout)
    const ids = new Set(placements.map((placement) => placement.profile.id))
    expect(ids.size).toBe(2)
    placements.forEach((placement) => {
      expect(placement.depthOffset).toBeCloseTo(base.profile.depth - placement.profile.depth)
    })
  })

  it('verwendet bei Block 16L im Mix an der Wechselstelle das Wechselprofil eines anderen Profils', () => {
    const configuration = {
      ...base,
      facadeEnds: { left: 'high' as const, right: 'high' as const },
      profileMix: { mode: 'module' as const, module: ['block16L', 'even'], percentages: {}, seed: 1 },
    }
    const layout = calculateFacadeLayout(configuration)
    expect(layout.isValid).toBe(true)
    const placements = getFacadeProfilePlacements(configuration, layout)
    expect(placements[1].isSwitchProfile).toBe(true)
    expect(placements[1].profile.id).toBe('even-high-high-switch')
  })

  it('lehnt reines Block 16L bei hoch/hoch weiterhin ab', () => {
    const layout = calculateFacadeLayout({
      ...base,
      profile: getStandardProfile('block16L'),
      facadeEnds: { left: 'high', right: 'high' },
    })
    expect(layout.isValid).toBe(false)
  })

  it('rastert gemischte Block-16L-Profile mit 120-mm-Achsen', () => {
    const layout = calculateFacadeLayout({
      ...base,
      profileMix: { mode: 'module', module: ['block16L', 'even', 'even'], percentages: {}, seed: 1 },
    })
    expect(layout.isValid).toBe(true)
    layout.spacings.forEach((spacing) => expect(spacing).toBeGreaterThanOrEqual(58))
  })
})
