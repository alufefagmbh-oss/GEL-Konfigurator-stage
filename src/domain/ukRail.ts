import { getWallVerticalBounds } from './wallContour'
import type { UkRailPlacement, UkRailProfile, WallContour } from './types'

const MINIMUM_END_INSET = 5
export const UK_RAIL_MINIMUM_PIECE_LENGTH = 150
const MAXIMUM_PIECE_LENGTH = 6000
const MAXIMUM_RAIL_SPACING = 1200
const STEP_OVERLAP = 150
const BOTTOM_CLEARANCE_MINIMUM = 125
const BOTTOM_CLEARANCE_MAXIMUM = 300
const TOP_CLEARANCE_MINIMUM = 60
const TOP_CLEARANCE_MAXIMUM = 300
const MINIMUM_STEP_HEIGHT = 150
const TOLERANCE = 1e-7
export const UK_RAIL_PROFILE_CLEARANCE = 7.5

interface RailBand {
  startX: number
  endX: number
  levels: number[]
  lowerMinimum: number
  lowerMaximum: number
  upperMinimum: number
  upperMaximum: number
}

function createRectangularContour(width: number, height: number): WallContour {
  return {
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
}

function getWallEdge(contour: WallContour, x: number, edge: 'bottom' | 'top'): number {
  return getWallVerticalBounds(contour, x)[edge]
}

export interface UkRailSupportRailClearance {
  // Senkrechte Höhe der Oberkante der Auflager-Schiene über der Bezugslinie (Profilunterkante)
  height: number
  // Bezugslinie über der Fassadenunterkante (unterer Montagespalt)
  referenceOffset: number
  // Zusätzlicher Abstand zwischen Auflager-Schiene und unterster UK-Schiene
  margin: number
}

function getBottomClearance(
  contour: WallContour,
  profile: UkRailProfile,
  startX: number,
  endX: number,
  supportRail: UkRailSupportRailClearance | undefined,
): number {
  if (!supportRail) return BOTTOM_CLEARANCE_MINIMUM
  const slope = endX - startX > TOLERANCE
    ? (getWallEdge(contour, endX, 'bottom') - getWallEdge(contour, startX, 'bottom')) / (endX - startX)
    : 0
  const topOffset = supportRail.referenceOffset + supportRail.height * Math.sqrt(1 + slope * slope)
  return Math.max(BOTTOM_CLEARANCE_MINIMUM, topOffset + supportRail.margin + profile.height / 2)
}

function getLevelsForBand(
  contour: WallContour,
  profile: UkRailProfile,
  startX: number,
  endX: number,
  supportRail?: UkRailSupportRailClearance,
): RailBand | null {
  const bottomAtStart = getWallEdge(contour, startX, 'bottom')
  const bottomAtEnd = getWallEdge(contour, endX, 'bottom')
  const topAtStart = getWallEdge(contour, startX, 'top')
  const topAtEnd = getWallEdge(contour, endX, 'top')
  const bottomClearance = getBottomClearance(contour, profile, startX, endX, supportRail)
  const lowerMinimum = Math.max(bottomAtStart, bottomAtEnd) + bottomClearance
  const lowerMaximum = Math.min(bottomAtStart, bottomAtEnd) + Math.max(BOTTOM_CLEARANCE_MAXIMUM, bottomClearance)
  const upperMinimum = Math.max(topAtStart, topAtEnd) - TOP_CLEARANCE_MAXIMUM
  const upperMaximum = Math.min(topAtStart, topAtEnd) - TOP_CLEARANCE_MINIMUM

  if (lowerMinimum > lowerMaximum + TOLERANCE) {
    return null
  }
  if (upperMinimum > upperMaximum + TOLERANCE) {
    return null
  }

  const lowerRail = lowerMinimum
  const upperRail = upperMaximum
  if (upperRail - lowerRail < profile.height - TOLERANCE) return null
  const spacingCount = Math.max(1, Math.ceil((upperRail - lowerRail) / MAXIMUM_RAIL_SPACING))
  return {
    startX,
    endX,
    lowerMinimum,
    lowerMaximum,
    upperMinimum,
    upperMaximum,
    levels: Array.from({ length: spacingCount + 1 }, (_, index) =>
      lowerRail + (upperRail - lowerRail) * index / spacingCount,
    ),
  }
}

function getRailBands(
  contour: WallContour,
  profile: UkRailProfile,
  startX: number,
  endX: number,
  supportRail?: UkRailSupportRailClearance,
): RailBand[] {
  const bands: RailBand[] = []
  const addBand = (bandStart: number, bandEnd: number, depth: number): void => {
    const band = getLevelsForBand(contour, profile, bandStart, bandEnd, supportRail)
    if (band) {
      const previous = bands.at(-1)
      if (previous && canMergeBands(previous, band)) {
        previous.endX = bandEnd
        previous.lowerMinimum = Math.max(previous.lowerMinimum, band.lowerMinimum)
        previous.lowerMaximum = Math.min(previous.lowerMaximum, band.lowerMaximum)
        previous.upperMinimum = Math.max(previous.upperMinimum, band.upperMinimum)
        previous.upperMaximum = Math.min(previous.upperMaximum, band.upperMaximum)
      } else {
        bands.push(band)
      }
      return
    }

    const midpoint = (bandStart + bandEnd) / 2
    const minimumHeight = Math.min(
      ...[bandStart, midpoint, bandEnd].map((x) => {
        const bounds = getWallVerticalBounds(contour, x)
        return bounds.top - bounds.bottom
      }),
    )
    if (minimumHeight < getBottomClearance(contour, profile, bandStart, bandEnd, supportRail) + TOP_CLEARANCE_MINIMUM + profile.height - TOLERANCE) {
      throw new Error('Die Fassade ist an einer Stelle zu niedrig, um mindestens zwei UK-Schienen mit den vorgegebenen Randabständen einzubauen.')
    }
    if (depth >= 20 || bandEnd - bandStart <= 1) {
      throw new Error('Die UK-Schienen können für diesen schrägen Fassadenabschnitt nicht innerhalb der vorgegebenen Randabstände positioniert werden.')
    }
    addBand(bandStart, midpoint, depth + 1)
    addBand(midpoint, bandEnd, depth + 1)
  }

  const boundaries = getBandBoundaries(contour, startX, endX)
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    addBand(boundaries[index], boundaries[index + 1], 0)
  }
  alignSharedMiddleRails(bands, profile.height)
  alignSmallRailOffsets(bands, profile.height)
  return bands
}

function getBandBoundaries(contour: WallContour, startX: number, endX: number): number[] {
  const contourXs = [...new Set(contour.points.map((point) => point.x))]
    .filter((x) => x > startX + TOLERANCE && x < endX - TOLERANCE)
  const vertices = [startX, ...contourXs, endX].sort((first, second) => first - second)
  const boundaries = [startX]

  for (let index = 0; index < vertices.length - 1; index += 1) {
    const segmentStart = vertices[index]
    const segmentEnd = vertices[index + 1]
    const bottomChange = Math.abs(
      getWallEdge(contour, segmentEnd, 'bottom') - getWallEdge(contour, segmentStart, 'bottom'),
    )
    const topChange = Math.abs(
      getWallEdge(contour, segmentEnd, 'top') - getWallEdge(contour, segmentStart, 'top'),
    )
    const subdivisions = Math.max(
      1,
      Math.ceil(bottomChange / MINIMUM_STEP_HEIGHT),
      Math.ceil(topChange / MINIMUM_STEP_HEIGHT),
    )
    for (let division = 1; division <= subdivisions; division += 1) {
      boundaries.push(segmentStart + (segmentEnd - segmentStart) * division / subdivisions)
    }
  }
  return boundaries
}

function canMergeBands(first: RailBand, second: RailBand): boolean {
  return Math.abs(first.endX - second.startX) <= TOLERANCE
    && first.levels.length === second.levels.length
    && first.levels.every((level, index) => Math.abs(level - second.levels[index]) <= TOLERANCE)
}

function alignSharedMiddleRails(bands: RailBand[], railHeight: number): void {
  let groupStart = 0
  while (groupStart < bands.length) {
    let groupEnd = groupStart + 1
    while (
      groupEnd < bands.length
      && bands[groupEnd].levels.length === bands[groupStart].levels.length
      && Math.abs(bands[groupEnd - 1].endX - bands[groupEnd].startX) <= TOLERANCE
    ) {
      groupEnd += 1
    }

    const group = bands.slice(groupStart, groupEnd)
    if (group.length > 1 && group[0].levels.length > 2) {
      const alignedLevels = group.map((band) => [...band.levels])
      for (let levelIndex = 1; levelIndex < group[0].levels.length - 1; levelIndex += 1) {
        let minimum = Number.NEGATIVE_INFINITY
        let maximum = Number.POSITIVE_INFINITY
        for (const band of group) {
          const lower = band.levels[levelIndex - 1]
          const upper = band.levels[levelIndex + 1]
          minimum = Math.max(minimum, lower + railHeight, upper - MAXIMUM_RAIL_SPACING)
          maximum = Math.min(maximum, lower + MAXIMUM_RAIL_SPACING, upper - railHeight)
        }
        if (minimum > maximum + TOLERANCE) continue

        const average = group.reduce((sum, band) => sum + band.levels[levelIndex], 0) / group.length
        const sharedLevel = Math.max(minimum, Math.min(maximum, average))
        for (const levels of alignedLevels) levels[levelIndex] = sharedLevel
      }

      const alignedValid = alignedLevels.every((levels, index) => {
        const band = group[index]
        return levels[0] >= band.lowerMinimum - TOLERANCE
          && levels[0] <= band.lowerMaximum + TOLERANCE
          && levels.at(-1)! >= band.upperMinimum - TOLERANCE
          && levels.at(-1)! <= band.upperMaximum + TOLERANCE
          && levels.slice(1).every((level, levelIndex) => {
            const spacing = level - levels[levelIndex]
            return spacing >= railHeight - TOLERANCE && spacing <= MAXIMUM_RAIL_SPACING + TOLERANCE
          })
      })
      if (alignedValid) {
        group.forEach((band, index) => { band.levels = alignedLevels[index] })
      }
    }
    groupStart = groupEnd
  }
}

function alignSmallRailOffsets(bands: RailBand[], railHeight: number): void {
  for (let pass = 0; pass < bands.length; pass += 1) {
    let changed = false
    for (let bandIndex = 0; bandIndex < bands.length - 1; bandIndex += 1) {
      const first = bands[bandIndex]
      const second = bands[bandIndex + 1]
      if (Math.abs(first.endX - second.startX) > TOLERANCE) continue

      const matchedSecondLevels = new Set<number>()
      for (let levelIndex = 0; levelIndex < first.levels.length; levelIndex += 1) {
        const firstLevel = first.levels[levelIndex]
        const secondLevelIndex = second.levels
          .map((level, index) => ({ level, index }))
          .filter(({ index }) => !matchedSecondLevels.has(index))
          .sort((a, b) => Math.abs(a.level - firstLevel) - Math.abs(b.level - firstLevel))[0]?.index
        if (secondLevelIndex === undefined) continue
        const secondLevel = second.levels[secondLevelIndex]
        if (Math.abs(firstLevel - secondLevel) >= MINIMUM_STEP_HEIGHT - TOLERANCE) continue

        const firstRange = getRailLevelRange(first, levelIndex, railHeight)
        const secondRange = getRailLevelRange(second, secondLevelIndex, railHeight)
        const minimum = Math.max(firstRange.minimum, secondRange.minimum)
        const maximum = Math.min(firstRange.maximum, secondRange.maximum)
        if (minimum > maximum + TOLERANCE) continue

        const sharedLevel = Math.max(minimum, Math.min(maximum, (firstLevel + secondLevel) / 2))
        const firstLevels = [...first.levels]
        const secondLevels = [...second.levels]
        firstLevels[levelIndex] = sharedLevel
        secondLevels[secondLevelIndex] = sharedLevel
        if (!areBandLevelsValid(first, firstLevels, railHeight)
          || !areBandLevelsValid(second, secondLevels, railHeight)) continue

        first.levels = firstLevels
        second.levels = secondLevels
        matchedSecondLevels.add(secondLevelIndex)
        changed = true
      }
    }
    if (!changed) break
  }
}

function getRailLevelRange(
  band: RailBand,
  levelIndex: number,
  railHeight: number,
): { minimum: number; maximum: number } {
  let minimum = levelIndex === 0 ? band.lowerMinimum : Number.NEGATIVE_INFINITY
  let maximum = levelIndex === 0 ? band.lowerMaximum : Number.POSITIVE_INFINITY
  if (levelIndex === band.levels.length - 1) {
    minimum = Math.max(minimum, band.upperMinimum)
    maximum = Math.min(maximum, band.upperMaximum)
  }

  const previous = band.levels[levelIndex - 1]
  const next = band.levels[levelIndex + 1]
  if (previous !== undefined) {
    minimum = Math.max(minimum, previous + railHeight)
    maximum = Math.min(maximum, previous + MAXIMUM_RAIL_SPACING)
  }
  if (next !== undefined) {
    minimum = Math.max(minimum, next - MAXIMUM_RAIL_SPACING)
    maximum = Math.min(maximum, next - railHeight)
  }
  return { minimum, maximum }
}

function areBandLevelsValid(band: RailBand, levels: number[], railHeight: number): boolean {
  if (levels[0] < band.lowerMinimum - TOLERANCE
    || levels.at(-1)! > band.upperMaximum + TOLERANCE) return false
  return levels.slice(1).every((level, index) => {
    const spacing = level - levels[index]
    return spacing >= railHeight - TOLERANCE && spacing <= MAXIMUM_RAIL_SPACING + TOLERANCE
  })
}

function makePieces(bands: RailBand[], profileHeight: number): UkRailPlacement[] {
  const runs: UkRailPlacement[] = []
  let activeRuns: UkRailPlacement[] = []
  const maximumX = bands.at(-1)?.endX ?? 0
  for (const [bandIndex, band] of bands.entries()) {
    const nextActiveRuns: UkRailPlacement[] = []
    const matchedRuns = new Set<UkRailPlacement>()
    for (const centerHeight of band.levels) {
      const continuousRun = activeRuns.find((run) =>
        Math.abs(run.centerHeight - centerHeight) <= TOLERANCE
        && Math.abs(run.endX - band.startX) <= TOLERANCE,
      )
      if (continuousRun) {
        continuousRun.endX = band.endX
        matchedRuns.add(continuousRun)
        nextActiveRuns.push(continuousRun)
      } else {
        const run = { startX: band.startX, endX: band.endX, centerHeight }
        runs.push(run)
        nextActiveRuns.push(run)
      }
    }
    if (bandIndex > 0) {
      for (const previousRun of activeRuns) {
        if (!matchedRuns.has(previousRun)) {
          previousRun.endX = Math.min(previousRun.endX + STEP_OVERLAP, maximumX)
        }
      }
    }
    activeRuns = nextActiveRuns
  }

  removeRailRunCollisions(runs, profileHeight)

  return runs.flatMap((run) => {
    const pieceCount = Math.ceil((run.endX - run.startX) / MAXIMUM_PIECE_LENGTH)
    return Array.from({ length: pieceCount }, (_, pieceIndex) => ({
      startX: run.startX + (run.endX - run.startX) * pieceIndex / pieceCount,
      endX: run.startX + (run.endX - run.startX) * (pieceIndex + 1) / pieceCount,
      centerHeight: run.centerHeight,
    }))
  })
}

function removeRailRunCollisions(runs: UkRailPlacement[], profileHeight: number): void {
  const orderedRuns = [...runs].sort((first, second) =>
    first.startX - second.startX || first.centerHeight - second.centerHeight,
  )
  for (let firstIndex = 0; firstIndex < orderedRuns.length; firstIndex += 1) {
    const first = orderedRuns[firstIndex]
    for (let secondIndex = firstIndex + 1; secondIndex < orderedRuns.length; secondIndex += 1) {
      const second = orderedRuns[secondIndex]
      if (second.startX >= first.endX - TOLERANCE) break
      if (Math.abs(first.centerHeight - second.centerHeight) >= profileHeight - TOLERANCE) continue

      if (Math.abs(first.startX - second.startX) <= TOLERANCE) {
        throw new Error('Die Fassadenkontur erlaubt keine kollisionsfreie Positionierung der UK-Schienen.')
      }
      first.endX = Math.min(first.endX, second.startX)
    }
  }
}

function railFitsWall(
  rail: UkRailPlacement,
  contour: WallContour,
  railHeight: number,
): boolean {
  const criticalXs = [...new Set([
    rail.startX,
    rail.endX,
    ...contour.points.map((point) => point.x).filter((x) => x > rail.startX && x < rail.endX),
  ])].sort((first, second) => first - second)
  for (const x of criticalXs) {
    const bounds = getWallVerticalBounds(contour, x)
    if (rail.centerHeight - railHeight / 2 < bounds.bottom - TOLERANCE
      || rail.centerHeight + railHeight / 2 > bounds.top + TOLERANCE) return false
  }
  return true
}

function ensureMinimumPieceLengths(
  placements: UkRailPlacement[],
  contour: WallContour,
  width: number,
  profileHeight: number,
): UkRailPlacement[] {
  const extended = [...placements]
  for (let index = 0; index < extended.length; index += 1) {
    let placement = extended[index]
    const length = placement.endX - placement.startX
    if (length >= UK_RAIL_MINIMUM_PIECE_LENGTH - TOLERANCE) continue
    if (mergeShortPieceWithNeighbor(extended, index, contour, profileHeight)) {
      index = Math.max(-1, index - 1)
      continue
    }

    const minimumExtension = UK_RAIL_MINIMUM_PIECE_LENGTH - length
    const maximumExtension = minimumExtension + UK_RAIL_MINIMUM_PIECE_LENGTH
    for (let totalExtension = minimumExtension; totalExtension <= maximumExtension + TOLERANCE; totalExtension += 5) {
      const leftOptions = new Set<number>([0, totalExtension])
      for (let leftExtension = 5; leftExtension < totalExtension; leftExtension += 5) {
        leftOptions.add(leftExtension)
      }
      for (const leftExtension of leftOptions) {
        const rightExtension = totalExtension - leftExtension
        const candidate: UkRailPlacement = {
          ...placement,
          startX: placement.startX - leftExtension,
          endX: placement.endX + rightExtension,
        }
        if (candidate.startX < MINIMUM_END_INSET - TOLERANCE
          || candidate.endX > width - MINIMUM_END_INSET + TOLERANCE
          || !railFitsWall(candidate, contour, profileHeight)) continue
        const collides = extended.some((other, otherIndex) =>
          otherIndex !== index
          && Math.abs(candidate.centerHeight - other.centerHeight) < profileHeight - TOLERANCE
          && Math.min(candidate.endX, other.endX) - Math.max(candidate.startX, other.startX) > TOLERANCE,
        )
        if (!collides) {
          extended[index] = candidate
          break
        }
      }
      if (extended[index] !== placement) break
    }
    if (extended[index] === placement) {
      throw new Error(
        `Die Fassadenkontur erlaubt kein mindestens ${UK_RAIL_MINIMUM_PIECE_LENGTH} mm langes, kollisionsfreies UK-Schienenstück bei ${Math.round(placement.centerHeight)} mm Höhe.`,
      )
    }
  }
  return extended
}

function mergeShortPieceWithNeighbor(
  placements: UkRailPlacement[],
  shortIndex: number,
  contour: WallContour,
  profileHeight: number,
): boolean {
  const shortPiece = placements[shortIndex]
  let best: { index: number; placement: UkRailPlacement; length: number } | null = null
  for (let neighborIndex = 0; neighborIndex < placements.length; neighborIndex += 1) {
    if (neighborIndex === shortIndex) continue
    const neighbor = placements[neighborIndex]
    if (Math.abs(shortPiece.centerHeight - neighbor.centerHeight) >= MINIMUM_STEP_HEIGHT - TOLERANCE
      || Math.min(shortPiece.endX, neighbor.endX) < Math.max(shortPiece.startX, neighbor.startX) - TOLERANCE) continue

    const length = Math.max(shortPiece.endX, neighbor.endX) - Math.min(shortPiece.startX, neighbor.startX)
    if (length < UK_RAIL_MINIMUM_PIECE_LENGTH - TOLERANCE || length > MAXIMUM_PIECE_LENGTH + TOLERANCE) continue
    const combinedLength = (shortPiece.endX - shortPiece.startX) + (neighbor.endX - neighbor.startX)
    const centerHeight = (
      shortPiece.centerHeight * (shortPiece.endX - shortPiece.startX)
      + neighbor.centerHeight * (neighbor.endX - neighbor.startX)
    ) / combinedLength
    const candidate: UkRailPlacement = {
      startX: Math.min(shortPiece.startX, neighbor.startX),
      endX: Math.max(shortPiece.endX, neighbor.endX),
      centerHeight,
    }
    if (!railFitsWall(candidate, contour, profileHeight)) continue
    const collides = placements.some((other, otherIndex) =>
      otherIndex !== shortIndex
      && otherIndex !== neighborIndex
      && Math.abs(candidate.centerHeight - other.centerHeight) < profileHeight - TOLERANCE
      && Math.min(candidate.endX, other.endX) - Math.max(candidate.startX, other.startX) > TOLERANCE,
    )
    if (!collides && (!best || length < best.length)) {
      best = { index: neighborIndex, placement: candidate, length }
    }
  }
  if (!best) return false

  const replaceAt = Math.min(shortIndex, best.index)
  const removeAt = Math.max(shortIndex, best.index)
  placements[replaceAt] = best.placement
  placements.splice(removeAt, 1)
  return true
}

export function calculateUkRailPlacements(
  width: number,
  height: number,
  profile: UkRailProfile,
  wallContour: WallContour | null,
  supportRail?: UkRailSupportRailClearance,
): UkRailPlacement[] {
  if (![width, height].every(Number.isFinite) || width <= 2 * MINIMUM_END_INSET || height <= 0) {
    throw new Error('Die Fassadenbreite muss größer als 10 mm und die Höhe größer als 0 mm sein, um die UK-Schienen zu positionieren.')
  }
  if (!profile.contours.length || profile.height <= 0 || profile.depth <= 0) {
    throw new Error('Die UK-Schienenkontur enthält keine gültigen Abmessungen.')
  }

  const contour = wallContour ?? createRectangularContour(width, height)
  const startX = MINIMUM_END_INSET
  const endX = width - MINIMUM_END_INSET
  const bands = getRailBands(contour, profile, startX, endX, supportRail)
  return ensureMinimumPieceLengths(
    makePieces(bands, profile.height),
    contour,
    width,
    profile.height,
  )
}

export const UK_RAIL_MAXIMUM_PIECE_LENGTH = MAXIMUM_PIECE_LENGTH
export const UK_RAIL_MAXIMUM_SPACING = MAXIMUM_RAIL_SPACING
export const UK_RAIL_STEP_OVERLAP = STEP_OVERLAP
