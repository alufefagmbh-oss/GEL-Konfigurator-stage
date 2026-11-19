import { describe, expect, it } from 'vitest'
import { getFacadeProfileDepth, getProfileBackEdgeY, getProfileDepthCoordinate, getProfileFrontEdgeY, mirrorProfileAcrossVerticalAxis } from './profileCoordinates'
import { getStandardProfile } from './standardProfiles'

describe('profile front edge coordinates', () => {
  it('identifies the front profile edge as the positive-Y model origin', () => {
    const profile = getStandardProfile('even')
    const frontEdgeY = getProfileFrontEdgeY(profile)
    const profileDepthCoordinates = profile.contours.flatMap((contour) => contour.points.map((point) => point.y))
    const modelDepthCoordinates = profileDepthCoordinates.map((depthY) => getProfileDepthCoordinate(profile, depthY))

    expect(frontEdgeY).toBe(Math.min(...profileDepthCoordinates))
    expect(getProfileBackEdgeY(profile)).toBe(Math.max(...profileDepthCoordinates))
    expect(Math.min(...modelDepthCoordinates)).toBe(0)
    expect(modelDepthCoordinates.every((depthY) => depthY >= 0)).toBe(true)
  })

  it('uses the centered depth edge when the contour is omitted', () => {
    expect(getProfileFrontEdgeY({
      name: 'Example',
      source: 'example',
      width: 40,
      depth: 24,
      contours: [],
    })).toBe(-12)
    expect(getProfileBackEdgeY({
      name: 'Example',
      source: 'example',
      width: 40,
      depth: 24,
      contours: [],
    })).toBe(12)
  })

  it('uses actual contour depth and placement offset for the facade rear plane', () => {
    const referenceProfile = {
      name: 'Reference',
      source: 'dxf' as const,
      width: 40,
      depth: 14,
      contours: [{ points: [{ x: 0, y: -5 }, { x: 40, y: -5 }, { x: 40, y: 5 }, { x: 0, y: 5 }], area: 400 }],
    }
    const offsetProfile = {
      ...referenceProfile,
      name: 'Offset',
      depth: 30,
      contours: [{ points: [{ x: 0, y: -2 }, { x: 40, y: -2 }, { x: 40, y: 3 }, { x: 0, y: 3 }], area: 200 }],
    }

    expect(getFacadeProfileDepth(referenceProfile, [
      { profile: offsetProfile, depthOffset: 5 },
    ])).toBe(10)
  })

  it('mirrors profile points horizontally without mutating the source contour', () => {
    const profile = getStandardProfile('even')
    const originalPoints = profile.contours[0].points
    const mirrored = mirrorProfileAcrossVerticalAxis(profile)
    const mirroredPoints = mirrored.contours[0].points

    expect(mirroredPoints).toHaveLength(originalPoints.length)
    expect(mirroredPoints[0]).toEqual({ x: -originalPoints.at(-1)!.x, y: originalPoints.at(-1)!.y })
    expect(mirroredPoints.map((point) => point.x).sort((a, b) => a - b))
      .toEqual(originalPoints.map((point) => -point.x).sort((a, b) => a - b))
    expect(profile.contours[0].points).toBe(originalPoints)
  })
})
