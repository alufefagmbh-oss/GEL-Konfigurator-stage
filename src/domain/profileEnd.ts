import { getProfileFrontEdgeY } from './profileCoordinates'
import type { FacadeEndFinish, ProfileDefinition } from './types'

export function getProfileEndCutX(
  profile: ProfileDefinition,
  side: 'left' | 'right',
  finish: FacadeEndFinish,
): number {
  const points = profile.contours[0]?.points ?? []
  if (points.length === 0) {
    return side === 'left' ? -profile.width / 2 : profile.width / 2
  }

  const frontY = getProfileFrontEdgeY(profile)
  const backY = Math.max(...points.map((point) => point.y))
  const planeY = finish === 'high' ? frontY : backY
  const tolerance = Math.max(1e-6, profile.depth * 1e-6)
  const planePoints = points.filter((point) => Math.abs(point.y - planeY) <= tolerance)
  if (planePoints.length === 0) {
    throw new Error(`Das Profil „${profile.name}“ hat keine Konturpunkte auf der ${finish === 'high' ? 'vorderen' : 'hinteren'} Ebene.`)
  }

  const coordinates = planePoints.map((point) => point.x)
  return side === 'left' ? Math.min(...coordinates) : Math.max(...coordinates)
}
