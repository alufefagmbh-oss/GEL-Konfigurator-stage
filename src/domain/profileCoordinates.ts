import type { ProfileDefinition, ProfilePlacement } from './types'

export function getProfileFrontEdgeY(profile: ProfileDefinition): number {
  const points = profile.contours.flatMap((contour) => contour.points)
  if (points.length === 0) return -profile.depth / 2
  return Math.min(...points.map((point) => point.y))
}

export function getProfileBackEdgeY(profile: ProfileDefinition): number {
  const points = profile.contours.flatMap((contour) => contour.points)
  if (points.length === 0) return profile.depth / 2
  return Math.max(...points.map((point) => point.y))
}

export function getFacadeProfileDepth(
  referenceProfile: ProfileDefinition,
  placements: Pick<ProfilePlacement, 'profile' | 'depthOffset'>[],
): number {
  const getPlacedDepth = (profile: ProfileDefinition, depthOffset = 0) =>
    getProfileBackEdgeY(profile) - getProfileFrontEdgeY(profile) + depthOffset

  return Math.max(
    1,
    getPlacedDepth(referenceProfile),
    ...placements.map((placement) => getPlacedDepth(placement.profile, placement.depthOffset ?? 0)),
  )
}

export function mirrorProfileAcrossVerticalAxis(profile: ProfileDefinition): ProfileDefinition {
  return {
    ...profile,
    leftEndX: profile.rightEndX === undefined ? undefined : -profile.rightEndX,
    rightEndX: profile.leftEndX === undefined ? undefined : -profile.leftEndX,
    contours: profile.contours.map((contour) => ({
      ...contour,
      points: [...contour.points].reverse().map((point) => ({ x: -point.x, y: point.y })),
    })),
  }
}

export function getProfileDepthCoordinate(profile: ProfileDefinition, profileY: number): number {
  return profileY - getProfileFrontEdgeY(profile)
}
