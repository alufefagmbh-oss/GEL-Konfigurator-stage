import { mirrorProfileAcrossVerticalAxis } from './profileCoordinates'
import { getProfileMixIds } from './profileMix'
import { getHighHighSwitchProfile, getLowLowSwitchProfile } from './switchProfiles'
import type { FacadeConfiguration, ProfileDefinition } from './types'

export interface ProfileArrangementItem {
  profile: ProfileDefinition
  isSwitchProfile: boolean
  isMirrored: boolean
}

export function getFacadeProfileArrangement(
  configuration: Pick<FacadeConfiguration, 'profile' | 'facadeEnds' | 'profileMix'>,
  index: number,
  baseProfile: ProfileDefinition = configuration.profile,
): ProfileArrangementItem {
  const { facadeEnds } = configuration
  const profile = baseProfile

  if (facadeEnds?.left === 'high' && facadeEnds.right === 'high') {
    if (index === 1) {
      const switchSourceId = profile.id === 'block16L'
        ? getProfileMixIds(configuration).find((id) => id !== 'block16L')
        : profile.id
      const switchProfile = getHighHighSwitchProfile(switchSourceId)
      if (!switchProfile) throw new Error(`Kein Hoch-Hoch-Wechselprofil für ${profile.name} verfügbar.`)
      return { profile: switchProfile, isSwitchProfile: true, isMirrored: false }
    }
    const isMirrored = index > 1
    return {
      profile: isMirrored ? mirrorProfileAcrossVerticalAxis(profile) : profile,
      isSwitchProfile: false,
      isMirrored,
    }
  }

  if (facadeEnds?.left === 'low' && facadeEnds.right === 'low') {
    if (index === 1) {
      return { profile: getLowLowSwitchProfile(), isSwitchProfile: true, isMirrored: false }
    }
    const isMirrored = index === 0
    return {
      profile: isMirrored ? mirrorProfileAcrossVerticalAxis(profile) : profile,
      isSwitchProfile: false,
      isMirrored,
    }
  }

  const isMirrored = facadeEnds?.left === 'low'
  return {
    profile: isMirrored ? mirrorProfileAcrossVerticalAxis(profile) : profile,
    isSwitchProfile: false,
    isMirrored,
  }
}

export function getProfileEndMarkerX(profile: ProfileDefinition, side: 'left' | 'right'): number {
  const marker = side === 'left' ? profile.leftEndX : profile.rightEndX
  if (marker !== undefined) return marker

  const points = profile.contours.flatMap((contour) => contour.points)
  if (points.length === 0) return side === 'left' ? -profile.width / 2 : profile.width / 2
  return side === 'left'
    ? Math.min(...points.map((point) => point.x))
    : Math.max(...points.map((point) => point.x))
}
