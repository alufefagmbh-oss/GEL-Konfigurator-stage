import DxfParser from 'dxf-parser'
import type { Point2D, ProfileContour, ProfileDefinition } from '../domain/types'

interface DxfVertex extends Point2D {
  bulge?: number
}

interface DxfEntity {
  type?: string
  closed?: boolean
  shape?: boolean
  inPaperSpace?: boolean
  vertices?: DxfVertex[]
}

interface ParsedDxf {
  entities?: DxfEntity[]
}

function polygonArea(points: Point2D[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2
}

function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current]
    const b = polygon[previous]
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

function expandPolyline(vertices: DxfVertex[]): Point2D[] {
  const points: Point2D[] = []
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index]
    const end = vertices[(index + 1) % vertices.length]
    points.push({ x: start.x, y: start.y })
    const bulge = start.bulge ?? 0
    if (Math.abs(bulge) < 1e-8) continue

    const chordX = end.x - start.x
    const chordY = end.y - start.y
    const chordLength = Math.hypot(chordX, chordY)
    if (chordLength < 1e-8) continue
    const angle = 4 * Math.atan(bulge)
    const centerOffset = chordLength / (2 * Math.tan(angle / 2))
    const centerX = (start.x + end.x) / 2 - (chordY / chordLength) * centerOffset
    const centerY = (start.y + end.y) / 2 + (chordX / chordLength) * centerOffset
    const radius = Math.hypot(start.x - centerX, start.y - centerY)
    const startAngle = Math.atan2(start.y - centerY, start.x - centerX)
    const steps = Math.max(2, Math.ceil(Math.abs(angle) / (Math.PI / 36)))

    for (let step = 1; step < steps; step += 1) {
      const sampleAngle = startAngle + angle * step / steps
      points.push({
        x: centerX + Math.cos(sampleAngle) * radius,
        y: centerY + Math.sin(sampleAngle) * radius,
      })
    }
  }
  return points
}

export function parseProfileDxf(contents: string, fileName: string): ProfileDefinition {
  let drawing: ParsedDxf
  try {
    drawing = new DxfParser().parseSync(contents) as ParsedDxf
  } catch {
    throw new Error('Die DXF-Datei konnte nicht gelesen werden. Bitte prüfen Sie das Dateiformat.')
  }

  const polylines = (drawing.entities ?? []).filter((entity) =>
    !entity.inPaperSpace
      && (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE')
      && Array.isArray(entity.vertices),
  )
  if (polylines.length === 0) {
    throw new Error('Keine geschlossene Polylinie gefunden. Unterstützt werden LWPOLYLINE und POLYLINE.')
  }

  const contours: ProfileContour[] = []
  for (const entity of polylines) {
    if (entity.closed !== true && entity.shape !== true) {
      throw new Error('Die DXF enthält eine offene Polylinie. Bitte schließen Sie die Profilkontur in der Zeichnung.')
    }
    const vertices = entity.vertices ?? []
    const expanded = expandPolyline(vertices)
    if (expanded.length < 3) continue
    const area = polygonArea(expanded)
    if (Math.abs(area) < 1e-6) continue
    contours.push({ points: expanded, area })
  }

  if (contours.length === 0) {
    throw new Error('Die DXF enthält keine gültige geschlossene Profilkontur.')
  }

  contours.sort((first, second) => Math.abs(second.area) - Math.abs(first.area))
  const outer = contours[0]
  const holes = contours.slice(1)
  if (holes.some((contour) => !pointInPolygon(contour.points[0], outer.points))) {
    throw new Error('Mehrere getrennte Außenkonturen werden noch nicht unterstützt. Bitte laden Sie ein einzelnes Profil.')
  }

  const allPoints = contours.flatMap((contour) => contour.points)
  const minX = Math.min(...allPoints.map((point) => point.x))
  const maxX = Math.max(...allPoints.map((point) => point.x))
  const minY = Math.min(...allPoints.map((point) => point.y))
  const maxY = Math.max(...allPoints.map((point) => point.y))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return {
    name: fileName,
    source: 'dxf',
    width: maxX - minX,
    depth: maxY - minY,
    contours: contours.map((contour) => ({
      ...contour,
      points: contour.points.map((point) => ({ x: point.x - centerX, y: point.y - centerY })),
    })),
  }
}
