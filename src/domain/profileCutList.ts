import { getWallEdgeCutLine } from './wallContour'
import { getEndGap } from './endGap'
import type { FacadeConfiguration, FacadeLayout, ProfilePlacement, WallContour } from './types'

export interface ProfileCutListRow {
  number: number
  axisPosition: number
  centerLength: number
  shortPointLength: number
  longPointLength: number
  bottomAngle: number
  topAngle: number
  profileName: string
  note: string
}

export interface ProfileCutListInput {
  configuration: Pick<FacadeConfiguration, 'width' | 'height' | 'profile' | 'endGap'>
  layout: Pick<FacadeLayout, 'isValid' | 'positions'>
  wallContour: WallContour | null
  placements?: ProfilePlacement[]
}

interface EdgeMeasurements {
  left: number
  right: number
  center: number
  angle: number
  isKinked: boolean
}

function measureEdge(
  wallContour: WallContour | null,
  facadeWidth: number,
  leftProfileX: number,
  rightProfileX: number,
  axisPosition: number,
  edge: 'bottom' | 'top',
  facadeHeight: number,
  endGap: number,
): EdgeMeasurements {
  if (!wallContour) {
    const height = edge === 'bottom' ? endGap : facadeHeight - endGap
    return { left: height, right: height, center: height, angle: 0, isKinked: false }
  }

  const leftX = axisPosition + facadeWidth / 2 + leftProfileX
  const rightX = axisPosition + facadeWidth / 2 + rightProfileX
  const cutLine = getWallEdgeCutLine(wallContour, leftX, rightX, edge)
  const offset = edge === 'bottom' ? endGap : -endGap
  const right = cutLine.rightHeight + offset
  const left = cutLine.leftHeight + offset

  return {
    left,
    right,
    center: cutLine.centerHeight + offset,
    angle: Math.atan(cutLine.slope) * 180 / Math.PI,
    isKinked: cutLine.isKinked,
  }
}

export function createProfileCutList(input: ProfileCutListInput): ProfileCutListRow[] {
  const { configuration, layout, wallContour } = input
  const endGap = getEndGap(configuration)
  if (configuration.height <= endGap * 2) {
    throw new Error('Die Fassadenhöhe ist für den gewählten oberen und unteren Montagespalt zu gering.')
  }
  if (!layout.isValid || layout.positions.length === 0) {
    throw new Error('Für die Zuschnittliste wird eine gültige Profilanordnung benötigt.')
  }

  const placements = input.placements ?? layout.positions.map((axisX, layoutIndex): ProfilePlacement => ({
    axisX,
    profile: configuration.profile,
    layoutIndex,
    isSwitchProfile: false,
  }))
  return placements.map((placement, index) => {
    const axisPosition = placement.axisX
    const profile = placement.profile
    const profilePoints = profile.contours[0]?.points ?? []
    const profileMinX = profilePoints.length > 0
      ? Math.min(...profilePoints.map((point) => point.x))
      : -profile.width / 2
    const profileMaxX = profilePoints.length > 0
      ? Math.max(...profilePoints.map((point) => point.x))
      : profile.width / 2
    const leftProfileX = placement.leftTrimX ?? profileMinX + (placement.profileOffsetX ?? 0)
    const rightProfileX = placement.rightTrimX ?? profileMaxX + (placement.profileOffsetX ?? 0)
    const lower = measureEdge(
      wallContour,
      configuration.width,
      leftProfileX,
      rightProfileX,
      axisPosition,
      'bottom',
      configuration.height,
      endGap,
    )
    const upper = measureEdge(
      wallContour,
      configuration.width,
      leftProfileX,
      rightProfileX,
      axisPosition,
      'top',
      configuration.height,
      endGap,
    )
    const edgeLengths = [upper.left - lower.left, upper.right - lower.right]

    return {
      number: index + 1,
      axisPosition: axisPosition + configuration.width / 2,
      centerLength: upper.center - lower.center,
      shortPointLength: Math.min(...edgeLengths),
      longPointLength: Math.max(...edgeLengths),
      bottomAngle: lower.angle,
      topAngle: upper.angle,
      profileName: profile.name,
      note: edgeLengths.some((length) => length <= 0)
        ? 'Kontur erzeugt an einer Profilkante keine positive Länge.'
        : lower.isKinked || upper.isKinked
          ? 'Konturknick: längster Konturabschnitt innerhalb der Profilbreite als Gehrung gewählt.'
          : '',
    }
  })
}
