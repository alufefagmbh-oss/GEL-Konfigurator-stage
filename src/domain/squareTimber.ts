import { getSupportRailCutPosition } from './supportRail'
import type {
  SquareTimberPlacement,
  SupportRailPiece,
  SupportRailProfile,
  UkRailFixingPlacement,
  UkRailPlacement,
  UkRailProfile,
} from './types'

export const SQUARE_TIMBER_MINIMUM_DISTANCE = 30
const TOLERANCE = 1e-7

export const SQUARE_TIMBER_MAXIMUM_WIDTH = 80
export const SQUARE_TIMBER_END_DISTANCE = 100
const SQUARE_TIMBER_MAXIMUM_SPACING = 800
const SQUARE_TIMBER_HOLE_END_MARGIN = 20

export function usesSquareTimber(distance: number): boolean {
  return distance > SQUARE_TIMBER_MINIMUM_DISTANCE + TOLERANCE
}

export function getSquareTimberWidth(depth: number): number {
  return Math.min(depth, SQUARE_TIMBER_MAXIMUM_WIDTH)
}

// Erstes/letztes Kantholz: Außenkante 100 mm innerhalb der UK-Schienenenden; dazwischen gleichmäßig, max. 800 mm Achsabstand.
export function calculateSquareTimberFixings(
  placements: UkRailPlacement[],
  width: number,
): UkRailFixingPlacement[] {
  if (placements.length === 0) return []
  const first = Math.min(...placements.map((rail) => rail.startX)) + SQUARE_TIMBER_END_DISTANCE + width / 2
  const last = Math.max(...placements.map((rail) => rail.endX)) - SQUARE_TIMBER_END_DISTANCE - width / 2
  if (last < first - TOLERANCE) {
    throw new Error('Die Fassade ist zu schmal für Kanthölzer mit 100 mm Abstand zu den UK-Schienenenden.')
  }
  const intervals = last - first <= TOLERANCE ? 0 : Math.ceil((last - first) / SQUARE_TIMBER_MAXIMUM_SPACING - TOLERANCE)
  const xs = intervals === 0 ? [first] : Array.from({ length: intervals + 1 }, (_, index) => first + (last - first) * index / intervals)
  return placements.flatMap((rail) => {
    const fixings = xs
      .filter((x) => x >= rail.startX + SQUARE_TIMBER_HOLE_END_MARGIN && x <= rail.endX - SQUARE_TIMBER_HOLE_END_MARGIN)
      .map((x) => ({ x, centerHeight: rail.centerHeight }))
    if (fixings.length === 0) {
      throw new Error('Ein UK-Schienenstück liegt auf keinem Kantholz auf. Bitte Fassadenbreite oder Schienenaufteilung prüfen.')
    }
    return fixings
  })
}

function getSupportRailBottomY(
  pieces: SupportRailPiece[],
  profile: SupportRailProfile,
  x: number,
): number {
  const low = -profile.supportHeight
  let bestY: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const piece of pieces) {
    if (Math.abs(piece.direction.x) < 1e-9) continue
    const t = (x - piece.origin.x - low * piece.normal.x) / piece.direction.x
    const start = getSupportRailCutPosition(piece.startCut, low)
    const end = getSupportRailCutPosition(piece.endCut, low)
    const distance = t < start ? start - t : t > end ? t - end : 0
    if (distance < bestDistance) {
      bestDistance = distance
      bestY = piece.origin.y + t * piece.direction.y + low * piece.normal.y
    }
  }
  if (bestY === null) throw new Error('Für das Kantholz fehlt die Auflager-Schiene als untere Begrenzung.')
  return bestY
}

export function calculateSquareTimbers(
  fixings: UkRailFixingPlacement[],
  railProfile: UkRailProfile,
  supportRailPieces: SupportRailPiece[],
  supportRailProfile: SupportRailProfile,
  depth: number,
): SquareTimberPlacement[] {
  const width = getSquareTimberWidth(depth)
  const columns = new Map<string, UkRailFixingPlacement[]>()
  for (const fixing of fixings) {
    const key = fixing.x.toFixed(6)
    columns.set(key, [...(columns.get(key) ?? []), fixing])
  }
  return [...columns.values()]
    .map((column) => {
      const x = column[0].x
      const top = Math.max(...column.map((fixing) => fixing.centerHeight)) + railProfile.height / 2
      const bottom = Math.max(
        getSupportRailBottomY(supportRailPieces, supportRailProfile,         x - width / 2),
        getSupportRailBottomY(supportRailPieces, supportRailProfile, x),
                getSupportRailBottomY(supportRailPieces, supportRailProfile, x + width / 2),
      )
      if (top - bottom < railProfile.height) {
        throw new Error('Ein vertikales Kantholz hat keine ausreichende Höhe zwischen Auflager-Schiene und oberster UK-Schiene.')
      }
      return {
        x,
        width,
        depth,
        bottom,
        top,
        holeHeights: column.map((fixing) => fixing.centerHeight).sort((first, second) => first - second),
      }
    })
    .sort((first, second) => first.x - second.x)
}
