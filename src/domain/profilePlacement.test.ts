import { describe, expect, it } from 'vitest'
import { calculateFacadeLayout } from './facadeLayout'
import { getProfileBackEdgeY, getProfileFrontEdgeY } from './profileCoordinates'
import { getFacadeProfilePlacements } from './profilePlacement'
import { getStandardProfile } from './standardProfiles'

describe('facade profile placements', () => {
  it('replaces profile position 002 with the type-specific high-high switch profile', () => {
    const configuration = {
      width: 3000,
      height: 2500,
      profile: getStandardProfile('even'),
      facadeEnds: { left: 'high' as const, right: 'high' as const },
    }
    const layout = calculateFacadeLayout(configuration)
    const placements = getFacadeProfilePlacements(configuration, layout)
    const switchPlacement = placements.find((placement) => placement.isSwitchProfile)

    expect(placements).toHaveLength(layout.profileCount)
    expect(switchPlacement?.axisX).toBe(layout.positions[1])
    expect(switchPlacement?.layoutIndex).toBe(1)
    expect(switchPlacement?.profile.name).toBe('Even Wechselprofil')
    const mirroredAfterSwitch = placements[2]
    expect(mirroredAfterSwitch.profile.contours[0].points[0].x)
      .toBe(-configuration.profile.contours[0].points.at(-1)!.x)
  })

  it('does not add a switch profile for mixed end finishes', () => {
    const configuration = {
      width: 3000,
      height: 2500,
      profile: getStandardProfile('cone'),
      facadeEnds: { left: 'high' as const, right: 'low' as const },
    }
    const layout = calculateFacadeLayout(configuration)

    const placements = getFacadeProfilePlacements(configuration, layout)
    expect(placements).toHaveLength(layout.profileCount)
    expect(placements.every((placement) => placement.profile === configuration.profile)).toBe(true)
    expect(placements.every((placement) => placement.leftTrimX === undefined && placement.rightTrimX === undefined)).toBe(true)
    expect(placements[0].profile.contours[0].points).toBe(configuration.profile.contours[0].points)
    expect(placements.at(-1)?.profile.contours[0].points).toBe(configuration.profile.contours[0].points)
  })

  it('uses the rear switch profile at 002 for low-low and aligns the rear planes', () => {
    const configuration = {
      width: 3000,
      height: 2500,
      profile: getStandardProfile('even'),
      facadeEnds: { left: 'low' as const, right: 'low' as const },
    }
    const layout = calculateFacadeLayout(configuration)
    const placements = getFacadeProfilePlacements(configuration, layout)
    const switchPlacement = placements.find((placement) => placement.isSwitchProfile)

    expect(layout.isValid).toBe(true)
    expect(placements).toHaveLength(layout.profileCount)
    expect(switchPlacement?.axisX).toBe(layout.positions[1])
    expect(switchPlacement?.layoutIndex).toBe(1)
    expect(switchPlacement?.profile.name).toBe('Hinteres Wechselprofil')
    const facadePoints = configuration.profile.contours[0].points
    const facadeBack = Math.max(...facadePoints.map((point) => point.y))
    const facadeFront = Math.min(...facadePoints.map((point) => point.y))
    const switchBack = Math.max(...switchPlacement!.profile.contours[0].points.map((point) => point.y))
    const switchFront = Math.min(...switchPlacement!.profile.contours[0].points.map((point) => point.y))
    expect(switchBack - switchFront + switchPlacement!.depthOffset!).toBeCloseTo(facadeBack - facadeFront, 5)
    expect(switchPlacement?.leftTrimX).toBeUndefined()
    expect(switchPlacement?.rightTrimX).toBeUndefined()
    expect(placements[0].profile.contours[0].points[0].x)
      .toBe(-configuration.profile.contours[0].points.at(-1)!.x)
    expect(placements[2].profile.contours[0].points).toBe(configuration.profile.contours[0].points)
  })

  it('mirrors every profile when the left facade end is low and the right is high', () => {
    const configuration = {
      width: 3000,
      height: 2500,
      profile: getStandardProfile('block16'),
      facadeEnds: { left: 'low' as const, right: 'high' as const },
    }
    const layout = calculateFacadeLayout(configuration)
    const placements = getFacadeProfilePlacements(configuration, layout)

    expect(layout.isValid).toBe(true)
    expect(placements.every((placement) => placement.profile.leftEndX === -configuration.profile.rightEndX!)).toBe(true)
    expect(placements.every((placement) => placement.profile.rightEndX === -configuration.profile.leftEndX!)).toBe(true)
  })

  it('keeps the DXF rear reference plane aligned across all profiles and switches', () => {
    const configuration = {
      width: 3000,
      height: 2500,
      profile: getStandardProfile('even'),
      facadeEnds: { left: 'low' as const, right: 'low' as const },
    }
    const layout = calculateFacadeLayout(configuration)
    const placements = getFacadeProfilePlacements(configuration, layout)

    for (const placement of placements) {
      const rearPlane = getProfileBackEdgeY(placement.profile)
        - getProfileFrontEdgeY(placement.profile)
        + placement.depthOffset!
      expect(rearPlane).toBeCloseTo(configuration.profile.depth, 5)
    }
  })
})
