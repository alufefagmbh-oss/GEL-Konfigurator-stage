import { getWallVerticalBounds } from './wallContour'
import type { Point2D, SupportRailCut, SupportRailPiece, SupportRailProfile, WallContour } from './types'

export const SUPPORT_RAIL_MAXIMUM_LENGTH = 6000
export const SUPPORT_RAIL_UK_RAIL_MARGIN = 30
export const SUPPORT_RAIL_END_INSET = 5
const TOLERANCE = 1e-6
const SLOPE_TOLERANCE = 1e-9

interface BottomSegment {
  start: Point2D
  end: Point2D
}

function getBottomSegments(
  width: number,
  wallContour: WallContour | null,
  endGap: number,
): BottomSegment[] {
  if (!wallContour) {
    return [{ start: { x: SUPPORT_RAIL_END_INSET, y: endGap }, end: { x: width - SUPPORT_RAIL_END_INSET, y: endGap } }]
  }
  const xs = [...new Set([SUPPORT_RAIL_END_INSET, width - SUPPORT_RAIL_END_INSET, ...wallContour.points.map((point) => point.x)])]
    .filter((x) => x >= SUPPORT_RAIL_END_INSET - TOLERANCE && x <= width - SUPPORT_RAIL_END_INSET + TOLERANCE)
    .sort((first, second) => first - second)
  const segments: BottomSegment[] = []
  for (let index = 0; index < xs.length - 1; index += 1) {
    const x0 = xs[index]
    const x1 = xs[index + 1]
    const length = x1 - x0
    if (length <= TOLERANCE) continue
    // Innerhalb eines Intervalls ist die Unterkante linear; Stützstellen im Inneren vermeiden senkrechte Konturkanten.
    const q1 = x0 + length * 0.25
    const q3 = x0 + length * 0.75
    const b1 = getWallVerticalBounds(wallContour, q1).bottom
    const b3 = getWallVerticalBounds(wallContour, q3).bottom
    const slope = (b3 - b1) / (q3 - q1)
    const start = { x: x0, y: b1 - slope * (q1 - x0) + endGap }
    const end = { x: x1, y: b3 + slope * (x1 - q3) + endGap }
    const previous = segments.at(-1)
    if (previous
      && Math.abs(previous.end.y - start.y) <= 1e-5
      && Math.abs(getSlope(previous) - slope) <= SLOPE_TOLERANCE) {
      previous.end = end
    } else {
      segments.push({ start, end })
    }
  }
  return segments
}

function getSlope(segment: BottomSegment): number {
  return (segment.end.y - segment.start.y) / (segment.end.x - segment.start.x)
}

function getDirection(segment: BottomSegment): Point2D {
  const length = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y)
  return { x: (segment.end.x - segment.start.x) / length, y: (segment.end.y - segment.start.y) / length }
}

function createCut(
  origin: Point2D,
  direction: Point2D,
  normal: Point2D,
  cutNormal: Point2D,
  pointOnCut: Point2D,
): SupportRailCut {
  const alongDirection = cutNormal.x * direction.x + cutNormal.y * direction.y
  const alongNormal = cutNormal.x * normal.x + cutNormal.y * normal.y
  const distance = cutNormal.x * (pointOnCut.x - origin.x) + cutNormal.y * (pointOnCut.y - origin.y)
  return { offset: distance / alongDirection, slope: -alongNormal / alongDirection }
}

export function getSupportRailCutPosition(cut: SupportRailCut, height: number): number {
  return cut.offset + cut.slope * height
}

export function getSupportRailCorner(
  piece: SupportRailPiece,
  edge: 'start' | 'end',
  height: number,
): Point2D {
  const t = getSupportRailCutPosition(edge === 'start' ? piece.startCut : piece.endCut, height)
  return {
    x: piece.origin.x + t * piece.direction.x + height * piece.normal.x,
    y: piece.origin.y + t * piece.direction.y + height * piece.normal.y,
  }
}

function getHeightRange(profile: SupportRailProfile): [number, number] {
  return [-profile.supportHeight, profile.height - profile.supportHeight]
}

export function getSupportRailPieceLength(piece: SupportRailPiece, profile: SupportRailProfile): number {
  const [low, high] = getHeightRange(profile)
  return Math.max(...[low, high].map((height) =>
    getSupportRailCutPosition(piece.endCut, height) - getSupportRailCutPosition(piece.startCut, height),
  ))
}

export function getSupportRailShortestEdge(piece: SupportRailPiece, profile: SupportRailProfile): number {
  const [low, high] = getHeightRange(profile)
  return Math.min(...[low, high].map((height) =>
    getSupportRailCutPosition(piece.endCut, height) - getSupportRailCutPosition(piece.startCut, height),
  ))
}

function createSegmentPieces(
  segment: BottomSegment,
  startCut: { normal: Point2D; point: Point2D },
  endCut: { normal: Point2D; point: Point2D },
  profile: SupportRailProfile,
  maximumLength: number,
): SupportRailPiece[] {
  const direction = getDirection(segment)
  const normal = { x: -direction.y, y: direction.x }
  const origin = segment.start
  const segmentLength = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y)
  const first = createCut(origin, direction, normal, startCut.normal, startCut.point)
  const last = createCut(origin, direction, normal, endCut.normal, endCut.point)

  const build = (count: number): SupportRailPiece[] => Array.from({ length: count }, (_, index) => {
    const joint = (position: number): SupportRailCut => createCut(
      origin,
      direction,
      normal,
      direction,
      { x: origin.x + direction.x * position, y: origin.y + direction.y * position },
    )
    return {
      origin,
      direction,
      normal,
      startCut: index === 0 ? first : joint(segmentLength * index / count),
      endCut: index === count - 1 ? last : joint(segmentLength * (index + 1) / count),
      maximumLength,
    }
  })

  for (let count = Math.max(1, Math.ceil(segmentLength / maximumLength)); count < 200; count += 1) {
    const pieces = build(count)
    if (pieces.some((piece) => getSupportRailShortestEdge(piece, profile) <= TOLERANCE)) {
      throw new Error('Ein Abschnitt der unteren Fassadenkontur ist zu kurz für die Gehrungsschnitte der Auflager-Schiene.')
    }
    if (pieces.every((piece) => getSupportRailPieceLength(piece, profile) <= maximumLength + 1e-6)) return pieces
  }
  throw new Error('Die Auflager-Schiene konnte nicht in Stücke bis 6.000 mm Länge geteilt werden.')
}

export function calculateSupportRailPieces(
  width: number,
  wallContour: WallContour | null,
  profile: SupportRailProfile,
  endGap: number,
  maximumLength = SUPPORT_RAIL_MAXIMUM_LENGTH,
): SupportRailPiece[] {
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error('Die Fassadenbreite für die Auflager-Schiene ist ungültig.')
  }
  const segments = getBottomSegments(width, wallContour, endGap)
  const pieces: SupportRailPiece[] = []
  segments.forEach((segment, index) => {
    const previous = segments[index - 1]
    const next = segments[index + 1]
    const connectedToPrevious = previous !== undefined && Math.abs(previous.end.y - segment.start.y) <= 1e-5
    const connectedToNext = next !== undefined && Math.abs(next.start.y - segment.end.y) <= 1e-5
    const direction = getDirection(segment)
    const getBoundary = (neighbor: BottomSegment | undefined, connected: boolean, point: Point2D) => {
      if (!connected || !neighbor) return { normal: { x: 1, y: 0 }, point }
      const other = getDirection(neighbor)
      const sum = { x: other.x + direction.x, y: other.y + direction.y }
      const length = Math.hypot(sum.x, sum.y)
      return { normal: { x: sum.x / length, y: sum.y / length }, point }
    }
    pieces.push(...createSegmentPieces(
      segment,
      getBoundary(previous, connectedToPrevious, segment.start),
      getBoundary(next, connectedToNext, segment.end),
      profile,
      maximumLength,
    ))
  })
  return pieces
}
