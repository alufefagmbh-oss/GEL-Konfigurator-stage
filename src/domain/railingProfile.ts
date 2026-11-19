import type { SlabDimension, SlabPoint } from './concreteSlab'
import type { StaticAssumptions } from './staticAssumptions'
import { maximumSideFixingSpacing, SIDE_FIXING_AXIS_HEIGHT, SIDE_FIXING_BOLT_HEAD_HEIGHT, SIDE_FIXING_BOLT_HEAD_INSET, SIDE_FIXING_EDGE_DISTANCE, SIDE_FIXING_NUT_CLEARANCE, STEEL_PLATE_THICKNESS, type RailingMounting } from './railingMounting'

export const HOLE_RADIUS = 7
export const COUNTERSINK_RADIUS = 10.5
export const HOLE_EDGE_DISTANCE = 50
export const PROFILE_FLOOR_HEIGHT = 11
export const HOLE_CUTTER_TOP = PROFILE_FLOOR_HEIGHT + 1
export const MAX_PROFILE_STOCK_LENGTH = 4000

export interface ProfilePart {
  direction: SlabPoint
  start: SlabPoint
  end: SlabPoint
  startMiter: SlabPoint
  endMiter: SlabPoint
  offset: number
  section: SlabPoint[]
  holes: SlabPoint[]
}

export interface SideFixingWallBounds {
  inner: number
  outer: number
}

export function sideFixingWallBounds(section: SlabPoint[], height = SIDE_FIXING_AXIS_HEIGHT): SideFixingWallBounds {
  const intersections: number[] = []
  for (let index = 0; index < section.length; index += 1) {
    const start = section[index]
    const end = section[(index + 1) % section.length]
    if ((start.y > height) === (end.y > height)) continue
    intersections.push(start.x + (height - start.y) * (end.x - start.x) / (end.y - start.y))
  }
  intersections.sort((a, b) => a - b)
  const maxX = Math.max(...section.map((point) => point.x))
  for (let index = intersections.length - 2; index >= 0; index -= 2) {
    const inner = intersections[index]
    const outer = intersections[index + 1]
    if (outer >= maxX - 0.001) return { inner, outer }
  }
  throw new Error('Die blechseitige Profilwand konnte auf Höhe der Torbandschraubenachse nicht ermittelt werden.')
}

export function sideFixingHeadInsetDistance(section: SlabPoint[]): number {
  const wall = sideFixingWallBounds(section)
  return Math.min(wall.outer - wall.inner, SIDE_FIXING_BOLT_HEAD_INSET - SIDE_FIXING_BOLT_HEAD_HEIGHT)
}

export function sideFixingNutOffset(section: SlabPoint[]): number {
  return sideFixingHeadInsetDistance(section) + STEEL_PLATE_THICKNESS + SIDE_FIXING_NUT_CLEARANCE
}

export function maximumFixingSpacing(assumptions: StaticAssumptions): number {
  if (assumptions.usage === 'private') return assumptions.location === 'inside' ? 320 : 175
  return assumptions.location === 'inside' ? 160 : 110
}

export function profilePoint(part: ProfilePart, point: SlabPoint, end: boolean): SlabPoint {
  const anchor = end ? part.end : part.start
  const miter = end ? part.endMiter : part.startMiter
  return { x: anchor.x + miter.x * (part.offset + point.x), y: anchor.y + miter.y * (part.offset + point.x) }
}

export function profileCenterlineLength(parts: ProfilePart[]): number {
  return parts.reduce((total, part) => {
    const center = Math.max(...part.section.map((point) => point.x)) / 2
    const start = profilePoint(part, { x: center, y: 0 }, false)
    const end = profilePoint(part, { x: center, y: 0 }, true)
    return total + Math.hypot(end.x - start.x, end.y - start.y)
  }, 0)
}

export function maximumProfileOffset(depth: number, section: SlabPoint[]): number {
  return depth - (Math.max(...section.map((point) => point.x)) - Math.min(...section.map((point) => point.x)))
}

export function profileStockLength(part: ProfilePart): number {
  const projections = part.section.flatMap((point) => [false, true].map((end) => {
    const position = profilePoint(part, point, end)
    return (position.x - part.start.x) * part.direction.x + (position.y - part.start.y) * part.direction.y
  }))
  return Math.max(...projections) - Math.min(...projections)
}

export function createProfilePathParts(dimensions: SlabDimension[], section: SlabPoint[], offset: number): ProfilePart[] {
  if (section.length < 3) throw new Error('Die GEL2001-Kontur ist ungültig.')
  const directions = dimensions.map(({ start, end, length }) => ({ x: (end.x - start.x) / length, y: (end.y - start.y) / length }))
  const right = (direction: SlabPoint) => ({ x: direction.y, y: -direction.x })
  const miter = (a: SlabPoint, b: SlabPoint) => {
    const na = right(a)
    const nb = right(b)
    const denominator = 1 + a.x * b.x + a.y * b.y
    if (denominator < 1e-8) throw new Error('Der Winkel ist für eine Gehrung zu klein.')
    return { x: (na.x + nb.x) / denominator, y: (na.y + nb.y) / denominator }
  }
  return dimensions.map((dimension, index) => {
    const direction = directions[index]
    return {
      direction, start: dimension.start, end: dimension.end, offset, section, holes: [],
      startMiter: miter(directions[Math.max(0, index - 1)], direction),
      endMiter: miter(direction, directions[Math.min(index + 1, directions.length - 1)]),
    }
  })
}

export function calculateProfileParts(
  dimensions: SlabDimension[],
  section: SlabPoint[],
  offset: number,
  assumptions: StaticAssumptions,
  mounting: Exclude<RailingMounting, 'none'> = '7B',
): ProfilePart[] {
  if (!Number.isFinite(offset) || (mounting === '7B' && offset < 0) || Math.abs(offset) > 100000) {
    throw new Error('Bitte einen gültigen Profilabstand eingeben.')
  }
  if (section.length < 3) throw new Error('Die GEL2001-Kontur ist ungültig.')
  const width = Math.max(...section.map((p) => p.x))
  const right = (direction: SlabPoint) => ({ x: direction.y, y: -direction.x })
  const paths = createProfilePathParts(dimensions, section, offset)
  return dimensions.flatMap((dimension, index) => {
    const direction = paths[index].direction
    const part = paths[index]
    for (const x of [0, width]) {
      const a = profilePoint(part, { x, y: 0 }, false)
      const b = profilePoint(part, { x, y: 0 }, true)
      if ((b.x - a.x) * direction.x + (b.y - a.y) * direction.y <= 0.01) {
        throw new Error(`Profilteil ${index + 1} ist für Randabstand und Gehrung zu kurz.`)
      }
    }
    const center = width / 2
    const start = profilePoint(part, { x: center, y: 0 }, false)
    const end = profilePoint(part, { x: center, y: 0 }, true)
    const centerLength = (end.x - start.x) * direction.x + (end.y - start.y) * direction.y
    if (centerLength < 2 * HOLE_EDGE_DISTANCE - 1e-7) {
      throw new Error(`Profilteil ${index + 1} ist für 50 mm Randabstand an beiden Enden zu kurz.`)
    }
    if (mounting === '7B') {
      for (const miter of [part.startMiter, part.endMiter]) {
        if (Math.abs(miter.x * direction.x + miter.y * direction.y) * COUNTERSINK_RADIUS >= HOLE_EDGE_DISTANCE) {
          throw new Error(`Die Bohrung in Profilteil ${index + 1} schneidet die Gehrung. Bitte den Winkel ändern.`)
        }
      }
    }
    const startSlope = part.startMiter.x * direction.x + part.startMiter.y * direction.y
    const endSlope = part.endMiter.x * direction.x + part.endMiter.y * direction.y
    const startMin = Math.min(startSlope * offset, startSlope * (offset + width))
    const endMax = dimension.length + Math.max(endSlope * offset, endSlope * (offset + width))
    const startCenter = startSlope * (offset + center)
    const endCenter = dimension.length + endSlope * (offset + center)
    const normal = right(direction)
    const minimumLength = 2 * HOLE_EDGE_DISTANCE
    const boundaries: number[] = []
    let previousMin = startMin
    let previousCenter = startCenter
    while (endMax - previousMin > MAX_PROFILE_STOCK_LENGTH + 1e-7) {
      const cut = Math.min(previousMin + MAX_PROFILE_STOCK_LENGTH, endCenter - minimumLength)
      if (cut - previousCenter < minimumLength - 1e-7) {
        throw new Error(`Profilteil ${index + 1} kann mit dieser Gehrung nicht innerhalb von 4.000 mm Rohprofillänge und 50 mm Bohrungsrandabstand gestückelt werden.`)
      }
      boundaries.push(cut)
      previousMin = cut
      previousCenter = cut
    }
    const pieces = Array.from({ length: boundaries.length + 1 }, (_, pieceIndex): ProfilePart => {
      const startCut = boundaries[pieceIndex - 1]
      const endCut = boundaries[pieceIndex]
      return {
        ...part,
        start: startCut === undefined ? part.start : { x: part.start.x + direction.x * startCut, y: part.start.y + direction.y * startCut },
        end: endCut === undefined ? part.end : { x: part.start.x + direction.x * endCut, y: part.start.y + direction.y * endCut },
        startMiter: startCut === undefined ? part.startMiter : normal,
        endMiter: endCut === undefined ? part.endMiter : normal,
        holes: [],
      }
    })
    for (const piece of pieces) {
      const pieceStart = profilePoint(piece, { x: center, y: 0 }, false)
      const pieceEnd = profilePoint(piece, { x: center, y: 0 }, true)
      const pieceLength = (pieceEnd.x - pieceStart.x) * direction.x + (pieceEnd.y - pieceStart.y) * direction.y
      if (pieceLength < minimumLength - 1e-7 || profileStockLength(piece) > MAX_PROFILE_STOCK_LENGTH + 1e-7) {
        throw new Error(`Profilteil ${index + 1} kann nicht mit 4.000 mm Rohprofillänge und 50 mm Bohrungsrandabstand gestückelt werden.`)
      }
      if (mounting === '7A') {
        const span = Math.max(0, pieceLength - 2 * SIDE_FIXING_EDGE_DISTANCE)
        const intervals = Math.ceil(span / maximumSideFixingSpacing(assumptions))
        const normal = right(direction)
        piece.holes = Array.from({ length: intervals + 1 }, (_, hole) => {
          const distance = SIDE_FIXING_EDGE_DISTANCE + (intervals === 0 ? 0 : span * hole / intervals)
          return {
            x: pieceStart.x + direction.x * distance + normal.x * center,
            y: pieceStart.y + direction.y * distance + normal.y * center,
          }
        })
      } else {
        const span = Math.max(0, pieceLength - minimumLength)
        const intervals = Math.ceil(span / maximumFixingSpacing(assumptions))
        piece.holes = Array.from({ length: intervals + 1 }, (_, hole) => {
          const distance = HOLE_EDGE_DISTANCE + (intervals === 0 ? 0 : span * hole / intervals)
          return { x: pieceStart.x + direction.x * distance, y: pieceStart.y + direction.y * distance }
        })
      }
    }
    return pieces
  })
}
