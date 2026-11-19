import type { WallContour } from './types'

const TOLERANCE = 1e-7
const LINE_TOLERANCE = 1e-6

export interface WallVerticalBounds {
  bottom: number
  top: number
}

export interface WallEdgeCutLine {
  leftHeight: number
  rightHeight: number
  centerHeight: number
  slope: number
  isKinked: boolean
}

export function getWallVerticalBounds(contour: WallContour, x: number): WallVerticalBounds {
  const intersections: number[] = []
  for (let index = 0; index < contour.points.length; index += 1) {
    const start = contour.points[index]
    const end = contour.points[(index + 1) % contour.points.length]
    const deltaX = end.x - start.x
    if (Math.abs(deltaX) <= TOLERANCE) {
      if (Math.abs(x - start.x) <= TOLERANCE) intersections.push(start.y, end.y)
      continue
    }

    const minimumX = Math.min(start.x, end.x)
    const maximumX = Math.max(start.x, end.x)
    if (x < minimumX - TOLERANCE || x > maximumX + TOLERANCE) continue
    const ratio = (x - start.x) / deltaX
    intersections.push(start.y + ratio * (end.y - start.y))
  }

  intersections.sort((first, second) => first - second)
  const uniqueIntersections = intersections.filter((value, index) =>
    index === 0 || Math.abs(value - intersections[index - 1]) > TOLERANCE,
  )
  if (uniqueIntersections.length !== 2) {
    throw new Error('Die Mauerkontur muss an jeder Profilposition genau eine Boden- und eine Deckenkante besitzen.')
  }

  return { bottom: uniqueIntersections[0], top: uniqueIntersections[1] }
}

export function insetWallContourVertically(contour: WallContour, inset: number): WallContour {
  if (!Number.isFinite(inset) || inset < 0) {
    throw new Error('Der vertikale Wandabstand muss eine nicht-negative endliche Zahl sein.')
  }
  if (inset === 0) return contour

  const xCoordinates = [...new Set(contour.points.map((point) => point.x))].sort((first, second) => first - second)
  const lowerEdge = xCoordinates.map((x) => {
    const bounds = getWallVerticalBounds(contour, x)
    if (bounds.top - bounds.bottom <= 2 * inset) {
      throw new Error('Die Mauerkontur ist an einer Stelle für den gewählten oberen und unteren Montagespalt zu niedrig.')
    }
    return { x, y: bounds.bottom + inset }
  })
  const upperEdge = [...xCoordinates].reverse().map((x) => {
    const bounds = getWallVerticalBounds(contour, x)
    return { x, y: bounds.top - inset }
  })
  return { ...contour, points: [...lowerEdge, ...upperEdge] }
}

export function getWallEdgeCutLine(
  contour: WallContour,
  leftX: number,
  rightX: number,
  edge: keyof WallVerticalBounds,
): WallEdgeCutLine {
  if (rightX - leftX <= TOLERANCE) {
    throw new Error('Die Profilbreite muss für die Gehrungsberechnung größer als null sein.')
  }

  const candidates: Array<{ slope: number; intercept: number; length: number }> = []
  for (let index = 0; index < contour.points.length; index += 1) {
    const start = contour.points[index]
    const end = contour.points[(index + 1) % contour.points.length]
    const deltaX = end.x - start.x
    if (Math.abs(deltaX) <= TOLERANCE) continue

    const overlapLeft = Math.max(leftX, Math.min(start.x, end.x))
    const overlapRight = Math.min(rightX, Math.max(start.x, end.x))
    if (overlapRight - overlapLeft <= TOLERANCE) continue

    const slope = (end.y - start.y) / deltaX
    const intercept = start.y - slope * start.x
    const midpoint = (overlapLeft + overlapRight) / 2
    const bounds = getWallVerticalBounds(contour, midpoint)
    if (Math.abs(slope * midpoint + intercept - bounds[edge]) > LINE_TOLERANCE) continue

    const heightDelta = slope * (overlapRight - overlapLeft)
    candidates.push({
      slope,
      intercept,
      length: Math.hypot(overlapRight - overlapLeft, heightDelta),
    })
  }

  candidates.sort((first, second) => second.length - first.length)
  const selected = candidates[0]
  if (!selected) {
    throw new Error('Für die Profilbreite wurde kein passender Abschnitt der Mauerkontur gefunden.')
  }

  return {
    leftHeight: selected.slope * leftX + selected.intercept,
    rightHeight: selected.slope * rightX + selected.intercept,
    centerHeight: selected.slope * ((leftX + rightX) / 2) + selected.intercept,
    slope: selected.slope,
    isKinked: candidates.some((candidate) =>
      Math.abs(candidate.slope - selected.slope) > TOLERANCE
      || Math.abs(candidate.intercept - selected.intercept) > LINE_TOLERANCE,
    ),
  }
}

export function assertVerticallyMonotoneWallContour(contour: WallContour): void {
  const xCoordinates = [...new Set(contour.points.map((point) => point.x))].sort((first, second) => first - second)
  for (const x of xCoordinates) getWallVerticalBounds(contour, x)
  for (let index = 0; index < xCoordinates.length - 1; index += 1) {
    const midpoint = (xCoordinates[index] + xCoordinates[index + 1]) / 2
    getWallVerticalBounds(contour, midpoint)
  }
}
