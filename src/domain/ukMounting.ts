import { getWallVerticalBounds } from './wallContour'
import type {
  FacadeConfiguration,
  UkAnglePlacement,
  UkAngleConnectorPlacement,
  UkAngleProfile,
  SpidiConnectorBounds,
  UkRailFixingPlacement,
  UkRailPlacement,
  UkRailProfile,
  ProfileContour,
  WallContour,
} from './types'
import { UK_RAIL_MAXIMUM_PIECE_LENGTH, UK_RAIL_MINIMUM_PIECE_LENGTH, UK_RAIL_PROFILE_CLEARANCE } from './ukRail'
import { DEFAULT_UK_RAIL_VIEW } from './ukRailView'

const MAXIMUM_FIXING_SPACING = 800
const FIXING_END_INSET = 50
const DEFAULT_PLASTIC_BLOCK_DEPTH_MM = 10
const ANGLE_EDGE_INSET = 150
const ANGLE_MAXIMUM_SPACING = 800
const ANGLE_PROFILE_CLEARANCE = 10
const CONNECTOR_END_INSET = 200

function getAngleHeightRange(
  bottom: number,
  top: number,
  profileEndGap: number,
): { startHeight: number; endHeight: number } {
  const inset = profileEndGap + ANGLE_PROFILE_CLEARANCE
  return { startHeight: bottom + inset, endHeight: top - inset }
}

export function getUkAnglePositions(width: number, maximumSpacing = ANGLE_MAXIMUM_SPACING): number[] {
  if (!Number.isFinite(width) || width <= 2 * ANGLE_EDGE_INSET) {
    throw new Error('Für die Alu-UK muss die Fassadenbreite größer als 300 mm sein, damit links und rechts Winkel gesetzt werden können.')
  }
  if (!Number.isFinite(maximumSpacing) || maximumSpacing <= 0) {
    throw new Error('Der maximale Achsabstand der L-Winkel muss größer als 0 mm sein.')
  }
  const span = width - 2 * ANGLE_EDGE_INSET
  const intervals = Math.max(1, Math.ceil(span / maximumSpacing))
  return Array.from({ length: intervals + 1 }, (_, index) =>
    ANGLE_EDGE_INSET + span * index / intervals,
  )
}

export function calculateUkAnglePlacements(
  width: number,
  height: number,
  wallContour: WallContour | null,
  maximumSpacing = ANGLE_MAXIMUM_SPACING,
  profileEndGap = 10,
): UkAnglePlacement[] {
  return getUkAnglePositions(width, maximumSpacing).map((centerX) => {
    const mirrored = centerX >= width / 2
    const bounds = wallContour
      ? getWallVerticalBounds(wallContour, centerX)
      : { bottom: 0, top: height }
    const { startHeight, endHeight } = getAngleHeightRange(
      bounds.bottom,
      bounds.top,
      profileEndGap,
    )
    if (endHeight <= startHeight) {
      throw new Error(`Der L-Winkel bei ${Math.round(centerX)} mm ist für diese Fassadenkontur zu kurz.`)
    }
    return { centerX, startHeight, endHeight, mirrored }
  })
}

export function calculateUkAngleConnectorPlacements(
  angles: UkAnglePlacement[],
  maximumSpacing: number,
  connectorBounds: Pick<SpidiConnectorBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
  frontContactDepth: number,
): UkAngleConnectorPlacement[] {
  if (!Number.isFinite(maximumSpacing) || maximumSpacing <= 0) {
    throw new Error('Der maximale Abstand der Maueranschlussteile muss größer als 0 mm sein.')
  }
  if (!Number.isFinite(connectorBounds.minX)
    || !Number.isFinite(connectorBounds.maxX)
    || connectorBounds.maxX <= connectorBounds.minX
    || !Number.isFinite(connectorBounds.minZ)
    || !Number.isFinite(connectorBounds.maxZ)
    || connectorBounds.maxZ <= connectorBounds.minZ) {
    throw new Error('Die Abmessungen des Maueranschlussteils sind ungültig.')
  }
  if (!Number.isFinite(frontContactDepth)) {
    throw new Error('Die Tiefenposition des L-Winkels ist ungültig.')
  }

  const connectorHeight = connectorBounds.maxZ - connectorBounds.minZ
  return angles.flatMap((angle) => {
    const startHeight = angle.startHeight + CONNECTOR_END_INSET + connectorHeight / 2
    const endHeight = angle.endHeight - CONNECTOR_END_INSET - connectorHeight / 2
    const availableSpan = endHeight - startHeight
    if (availableSpan < -1e-7) {
      throw new Error(`Der L-Winkel bei ${Math.round(angle.centerX)} mm ist kürzer als das Maueranschlussteil (${Math.round(connectorHeight)} mm).`)
    }
    if (availableSpan <= 1e-7) {
      return [{
        centerX: angle.centerX,
        centerHeight: (startHeight + endHeight) / 2,
        frontContactDepth,
      }]
    }
    const intervals = Math.max(1, Math.ceil(availableSpan / maximumSpacing))
    return Array.from({ length: intervals + 1 }, (_, index) => ({
      centerX: angle.centerX,
      centerHeight: startHeight + availableSpan * index / intervals,
      frontContactDepth,
    }))
  })
}

export function getUkAngleProfileContours(
  profile: UkAngleProfile,
  mirrored: boolean,
): ProfileContour[] {
  if (!mirrored) return profile.contours
  return profile.contours.map((contour) => ({
    ...contour,
    points: contour.points
      .map((point) => ({ ...point, x: -point.x }))
      .reverse(),
  }))
}

export function ensureUkRailAngleSupport(
  width: number,
  height: number,
  wallContour: WallContour | null,
  railProfile: UkRailProfile,
  angleProfile: UkAngleProfile,
  railPlacements: UkRailPlacement[],
  profileEndGap = 10,
): { railPlacements: UkRailPlacement[]; anglePlacements: UkAnglePlacement[] } {
  const maximumAngleSpacings = [ANGLE_MAXIMUM_SPACING, 600, 400, 300, 200, 150, 100]
  for (const maximumSpacing of maximumAngleSpacings) {
    const anglePlacements = calculateUkAnglePlacements(
      width,
      height,
      wallContour,
      maximumSpacing,
      profileEndGap,
    )
    const supportedRails = railPlacements.map((placement) => ({ ...placement }))
    const completedAngles = [...anglePlacements]
    let allRailsSupported = true

    for (let railIndex = 0; railIndex < supportedRails.length; railIndex += 1) {
      const rail = supportedRails[railIndex]
      if (countSupportingAngles(rail, completedAngles, railProfile.height, angleProfile) >= 2) continue
      const extended = extendRailToTwoAngles(
        railIndex,
        supportedRails,
        completedAngles,
        railProfile.height,
        angleProfile,
        width,
        wallContour,
        height,
      )
      if (extended) {
        supportedRails[railIndex] = extended
        continue
      }
      if (!addLocalAngleSupports(
        rail,
        completedAngles,
        railProfile.height,
        angleProfile,
        width,
        height,
        wallContour,
        profileEndGap,
      )) {
        allRailsSupported = false
        break
      }
    }
    if (allRailsSupported) return { railPlacements: supportedRails, anglePlacements: completedAngles }
  }

  throw new Error('Nicht jede UK-Schiene kann kollisionsfrei auf mindestens zwei L-Winkeln aufliegen. Der Fassadenabschnitt ist dafür zu kurz.')
}

function countSupportingAngles(
  rail: UkRailPlacement,
  angles: UkAnglePlacement[],
  railHeight: number,
  angleProfile: UkAngleProfile,
): number {
  const railBottom = rail.centerHeight - railHeight / 2
  const railTop = rail.centerHeight + railHeight / 2
  return angles.filter((angle) =>
    getAngleRailOverlap(rail, angle, angleProfile) >= 10 - 1e-7
    && angle.startHeight <= railTop + 1e-7
    && angle.endHeight >= railBottom - 1e-7,
  ).length
}

function addLocalAngleSupports(
  rail: UkRailPlacement,
  angles: UkAnglePlacement[],
  railHeight: number,
  angleProfile: UkAngleProfile,
  width: number,
  height: number,
  wallContour: WallContour | null,
  profileEndGap: number,
): boolean {
  const minimumOverlap = 10
  const candidates = [false, true].flatMap((mirrored) => {
    const { minimumX, maximumX } = getAngleHorizontalBounds(angleProfile, mirrored)
    const minimumCenterX = Math.max(
      10,
      -minimumX,
      mirrored ? width / 2 : -Infinity,
      rail.startX - maximumX + minimumOverlap,
    )
    const maximumCenterX = Math.min(
      width - 10,
      width - maximumX,
      mirrored ? Infinity : width / 2 - Number.EPSILON,
      rail.endX - minimumX - minimumOverlap,
    )
    if (maximumCenterX < minimumCenterX) return []
    return [
      minimumCenterX,
      maximumCenterX,
      ...angles
        .map((angle) => angle.centerX)
        .filter((x) => x >= minimumCenterX && x <= maximumCenterX),
    ]
  })
  const validCandidate = (x: number): UkAnglePlacement | null => {
    const boundsAtX = wallContour
      ? getWallVerticalBounds(wallContour, x)
      : { bottom: 0, top: height }
    const { startHeight, endHeight } = getAngleHeightRange(
      boundsAtX.bottom,
      boundsAtX.top,
      profileEndGap,
    )
    const candidate = {
      centerX: x,
      startHeight,
      endHeight,
      mirrored: x >= width / 2,
    }
    if (angles.some((angle) => angleFootprintsOverlap(angle, candidate, angleProfile))) return null
    if (getAngleRailOverlap(rail, candidate, angleProfile) < minimumOverlap - 1e-7) return null
    const railBottom = rail.centerHeight - railHeight / 2
    const railTop = rail.centerHeight + railHeight / 2
    if (candidate.endHeight <= candidate.startHeight
      || candidate.startHeight > railTop + 1e-7
      || candidate.endHeight < railBottom - 1e-7) return null
    return candidate
  }

  const existingSupports = angles.filter((angle) =>
    getAngleRailOverlap(rail, angle, angleProfile) >= minimumOverlap - 1e-7
    && angle.startHeight <= rail.centerHeight + railHeight / 2 + 1e-7
    && angle.endHeight >= rail.centerHeight - railHeight / 2 - 1e-7,
  )
  const validCandidates = [...new Set(candidates)]
    .map(validCandidate)
    .filter((candidate): candidate is UkAnglePlacement => candidate !== null)
  if (existingSupports.length >= 2) return true

  if (existingSupports.length === 1) {
    const support = validCandidates
      .filter((candidate) => !angleFootprintsOverlap(candidate, existingSupports[0], angleProfile))
      .sort((first, second) =>
        Math.abs(second.centerX - existingSupports[0].centerX)
        - Math.abs(first.centerX - existingSupports[0].centerX),
      )[0]
    if (!support) return false
    angles.push(support)
    return true
  }

  for (const first of validCandidates) {
    const second = validCandidates
      .filter((candidate) => !angleFootprintsOverlap(candidate, first, angleProfile))
      .sort((a, b) => Math.abs(b.centerX - first.centerX) - Math.abs(a.centerX - first.centerX))[0]
    if (!second) continue
    angles.push(first, second)
    return true
  }
  return false
}

function extendRailToTwoAngles(
  railIndex: number,
  rails: UkRailPlacement[],
  angles: UkAnglePlacement[],
  railHeight: number,
  angleProfile: UkAngleProfile,
  width: number,
  wallContour: WallContour | null,
  height: number,
): UkRailPlacement | null {
  const rail = rails[railIndex]
  const minimumX = 10
  const maximumX = width - 10
  const startCandidates = [
    rail.startX,
    ...angles
      .map((angle) => angle.centerX)
      .filter((x) => x >= minimumX && x < rail.startX - 1e-7),
  ]
  const endCandidates = [
    rail.endX,
    ...angles
      .map((angle) => angle.centerX)
      .filter((x) => x > rail.endX + 1e-7 && x <= maximumX),
  ]
  let best: UkRailPlacement | null = null
  let smallestExtension = Number.POSITIVE_INFINITY

  for (const startX of startCandidates) {
    for (const endX of endCandidates) {
      const length = endX - startX
      if (length > UK_RAIL_MAXIMUM_PIECE_LENGTH + 1e-7) continue
      const candidate = { ...rail, startX, endX }
      if (countSupportingAngles(candidate, angles, railHeight, angleProfile) < 2) continue
      if (!railFitsWall(candidate, wallContour, width, height, railHeight)) continue
      if (rails.some((other, index) =>
        index !== railIndex
        && Math.abs(candidate.centerHeight - other.centerHeight) < railHeight - 1e-7
        && Math.min(candidate.endX, other.endX) - Math.max(candidate.startX, other.startX) > 1e-7,
      )) continue

      const extension = rail.startX - startX + endX - rail.endX
      if (extension < smallestExtension) {
        smallestExtension = extension
        best = candidate
      }
    }
  }
  return best
}

function getAngleHorizontalBounds(
  profile: UkAngleProfile,
  mirrored: boolean,
): { minimumX: number; maximumX: number } {
  const points = profile.contours.flatMap((contour: ProfileContour) => contour.points)
  if (points.length === 0) {
    const minimum = profile.centerAxisX - profile.width / 2
    const maximum = profile.centerAxisX + profile.width / 2
    return {
      minimumX: mirrored ? -maximum : minimum,
      maximumX: mirrored ? -minimum : maximum,
    }
  }
  const minimum = Math.min(...points.map((point) => point.x))
  const maximum = Math.max(...points.map((point) => point.x))
  return {
    minimumX: mirrored ? -maximum : minimum,
    maximumX: mirrored ? -minimum : maximum,
  }
}

function getAngleRailOverlap(
  rail: UkRailPlacement,
  angle: UkAnglePlacement,
  profile: UkAngleProfile,
): number {
  const { minimumX, maximumX } = getAngleHorizontalBounds(profile, angle.mirrored ?? false)
  return Math.min(rail.endX, angle.centerX + maximumX)
    - Math.max(rail.startX, angle.centerX + minimumX)
}

function angleFootprintsOverlap(
  first: UkAnglePlacement,
  second: UkAnglePlacement,
  profile: UkAngleProfile,
): boolean {
  const firstBounds = getAngleHorizontalBounds(profile, first.mirrored ?? false)
  const secondBounds = getAngleHorizontalBounds(profile, second.mirrored ?? false)
  return Math.min(first.centerX + firstBounds.maximumX, second.centerX + secondBounds.maximumX)
    - Math.max(first.centerX + firstBounds.minimumX, second.centerX + secondBounds.minimumX) > 1e-7
}

function railFitsWall(
  rail: UkRailPlacement,
  wallContour: WallContour | null,
  width: number,
  height: number,
  railHeight: number,
): boolean {
  const wall = wallContour ?? {
    name: 'Fassade',
    width,
    height,
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
  }
  const criticalXs = [...new Set([
    rail.startX,
    rail.endX,
    ...wall.points.map((point) => point.x).filter((x) => x > rail.startX && x < rail.endX),
  ])].sort((first, second) => first - second)
  for (const x of criticalXs) {
    const bounds = getWallVerticalBounds(wall, x)
    if (rail.centerHeight - railHeight / 2 < bounds.bottom - 1e-7
      || rail.centerHeight + railHeight / 2 > bounds.top + 1e-7) return false
  }
  return true
}

export function calculateUkRailFixings(placements: UkRailPlacement[]): UkRailFixingPlacement[] {
  return placements.flatMap((rail) => {
    const railLength = rail.endX - rail.startX
    if (railLength < UK_RAIL_MINIMUM_PIECE_LENGTH - 1e-7) {
      throw new Error(`Ein UK-Schienenstück ist kürzer als die erforderlichen ${UK_RAIL_MINIMUM_PIECE_LENGTH} mm für Befestigungslöcher.`)
    }
    const availableLength = railLength - 2 * FIXING_END_INSET
    if (availableLength <= 1e-7) {
      return [{ x: (rail.startX + rail.endX) / 2, centerHeight: rail.centerHeight }]
    }
    const intervals = Math.max(1, Math.ceil(availableLength / MAXIMUM_FIXING_SPACING))
    return Array.from({ length: intervals + 1 }, (_, index) => ({
      x: rail.startX + FIXING_END_INSET + availableLength * index / intervals,
      centerHeight: rail.centerHeight,
    }))
  })
}

export function calculateDirectMountClearance(
  configuration: FacadeConfiguration,
  railProfile: UkRailProfile,
  facadeProfileDepth: number,
): number {
  const wallOffset = configuration.masonryView?.facadeOffset ?? 200
  return wallOffset - facadeProfileDepth - UK_RAIL_PROFILE_CLEARANCE - railProfile.depth
}

export function getUkRailMountingMethod(configuration: FacadeConfiguration) {
  return configuration.ukRailView?.mountingMethod ?? DEFAULT_UK_RAIL_VIEW.mountingMethod!
}

export function getUkRailHoleDiameter(configuration: FacadeConfiguration): number {
  return configuration.ukRailView?.holeDiameter ?? DEFAULT_UK_RAIL_VIEW.holeDiameter!
}

export function getUkAngleConnectorMaximumSpacing(configuration: FacadeConfiguration): number {
  return configuration.ukRailView?.connectorMaxSpacing ?? DEFAULT_UK_RAIL_VIEW.connectorMaxSpacing!
}

export function getUkAngleConnectorFrontContactDepth(
  angleProfile: UkAngleProfile,
  facadeProfileDepth: number,
  railProfile: UkRailProfile,
): number {
  const profilePoints = angleProfile.contours.flatMap((contour) => contour.points)
  if (profilePoints.length === 0) {
    throw new Error('Die DXF-Kontur des L-Winkels enthält keine Punkte für die Anlage des Maueranschlussteils.')
  }
  const forwardmostProfileDepth = Math.min(...profilePoints.map((point) => point.y))
  return facadeProfileDepth + UK_RAIL_PROFILE_CLEARANCE + railProfile.depth + forwardmostProfileDepth
}

export function getUkPlasticBlockDepth(
  configuration: FacadeConfiguration,
  railProfile?: UkRailProfile | null,
  facadeProfileDepth = 0,
): number {
  const configuredDepth = configuration.ukRailView?.plasticBlockDepth
  if (configuredDepth !== undefined) return configuredDepth
  if (railProfile) return calculateDirectMountClearance(configuration, railProfile, facadeProfileDepth)
  return DEFAULT_PLASTIC_BLOCK_DEPTH_MM
}
