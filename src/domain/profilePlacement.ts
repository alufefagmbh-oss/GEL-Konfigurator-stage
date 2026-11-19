import { getFacadeProfileArrangement } from './profileArrangement'
import { getProfileSequence } from './profileMix'
import type { FacadeConfiguration, FacadeLayout, ProfilePlacement } from './types'

export function getFacadeProfilePlacements(
  configuration: Pick<FacadeConfiguration, 'profile' | 'facadeEnds' | 'profileMix'>,
  layout: Pick<FacadeLayout, 'isValid' | 'positions'>,
): ProfilePlacement[] {
  if (!layout.isValid) return []

  const sequence = getProfileSequence(configuration, layout.positions.length)
  return layout.positions.map((axisX, layoutIndex): ProfilePlacement => {
    const arrangement = getFacadeProfileArrangement(configuration, layoutIndex, sequence[layoutIndex])
    return {
      axisX,
      profile: arrangement.profile,
      depthOffset: configuration.profile.depth - arrangement.profile.depth,
      layoutIndex,
      isSwitchProfile: arrangement.isSwitchProfile,
    }
  })
}
