import { createProfileCutList } from './profileCutList'
import { getEndGap } from './endGap'
import { getFacadeProfilePlacements } from './profilePlacement'
import type { FacadeConfiguration, FacadeLayout, UkRailPlacement, UkRailProfile, WallContour } from './types'

const ALUMINUM_DENSITY_GRAMS_PER_CUBIC_CENTIMETER = 2.7

export function calculateFacadeMassKilograms(
  configuration: FacadeConfiguration,
  layout: FacadeLayout,
  wallContour: WallContour | null,
  ukRailProfile: UkRailProfile | null = null,
  ukRailPlacements: UkRailPlacement[] = [],
): number {
  let volumeCubicMillimeters = 0
  if (layout.isValid && configuration.height > 2 * getEndGap(configuration)) {
    const placements = getFacadeProfilePlacements(configuration, layout)
    if (placements.length > 0) {
      const cutLengths = createProfileCutList({
        configuration,
        layout,
        wallContour,
        placements,
      })

      volumeCubicMillimeters = placements.reduce((total, placement, index) => {
        const [outerContour, ...innerContours] = placement.profile.contours
        const crossSectionArea = outerContour
          ? Math.max(0, Math.abs(outerContour.area) - innerContours.reduce((area, contour) => area + Math.abs(contour.area), 0))
          : 0
        return total + crossSectionArea * cutLengths[index].centerLength
      }, 0)
    }
  }

  const ukRailCrossSectionArea = ukRailProfile
    ? Math.max(
        0,
        Math.abs(ukRailProfile.contours[0]?.area ?? 0)
          - ukRailProfile.contours.slice(1).reduce((area, contour) => area + Math.abs(contour.area), 0),
      )
    : 0
  const ukRailVolumeCubicMillimeters = ukRailCrossSectionArea
    * ukRailPlacements.reduce((total, placement) => total + placement.endX - placement.startX, 0)
  return (volumeCubicMillimeters + ukRailVolumeCubicMillimeters)
    * ALUMINUM_DENSITY_GRAMS_PER_CUBIC_CENTIMETER / 1_000_000
}

export function calculateFacadeAreaSquareMeters(configuration: Pick<FacadeConfiguration, 'width' | 'height'>): number {
  return configuration.width * configuration.height / 1_000_000
}
