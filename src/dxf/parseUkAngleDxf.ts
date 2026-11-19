import DxfParser from 'dxf-parser'
import type { UkAngleProfile, Point2D } from '../domain/types'

interface DxfVertex extends Point2D {
  bulge?: number
}

interface DxfEntity {
  type?: string
  layer?: string
  inPaperSpace?: boolean
  closed?: boolean
  shape?: boolean
  vertices?: DxfVertex[]
}

interface ParsedDxf {
  entities?: DxfEntity[]
}

const TOLERANCE = 1e-5

function getMarker(entities: DxfEntity[], layer: string): [Point2D, Point2D] {
  const markers = entities.filter((entity) =>
    !entity.inPaperSpace && entity.type === 'LINE' && entity.layer?.toUpperCase() === layer,
  )
  if (markers.length !== 1 || markers[0].vertices?.length !== 2) {
    throw new Error(`Die L-Winkel-DXF benötigt genau eine Markierung auf Layer ${layer}.`)
  }
  return [markers[0].vertices![0], markers[0].vertices![1]]
}

function polygonArea(points: Point2D[]): number {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2
}

export function parseUkAngleDxf(contents: string, fileName = 'L-Winkel 50x40x2'): UkAngleProfile {
  let drawing: ParsedDxf
  try {
    drawing = new DxfParser().parseSync(contents) as ParsedDxf
  } catch {
    throw new Error('Die DXF des L-Winkels konnte nicht gelesen werden.')
  }
  const entities = (drawing.entities ?? []).filter((entity) => !entity.inPaperSpace)
  const profiles = entities.filter((entity) =>
    entity.layer === '0'
    && (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE')
    && Array.isArray(entity.vertices)
    && (entity.closed === true || entity.shape === true
      || entity.vertices.length > 3
        && Math.hypot(
          entity.vertices[0].x - entity.vertices.at(-1)!.x,
          entity.vertices[0].y - entity.vertices.at(-1)!.y,
        ) <= TOLERANCE),
  )
  if (profiles.length !== 1) {
    throw new Error('Die L-Winkel-DXF muss genau eine geschlossene Kontur auf Layer 0 enthalten.')
  }

  const rawPoints = profiles[0].vertices ?? []
  if (rawPoints.length < 4 || rawPoints.some((point) => Math.abs(point.bulge ?? 0) > TOLERANCE)) {
    throw new Error('Die L-Winkel-Kontur muss mindestens drei gerade Kanten enthalten.')
  }
  const points = rawPoints.map(({ x, y }) => ({ x, y }))
  if (Math.hypot(points[0].x - points.at(-1)!.x, points[0].y - points.at(-1)!.y) <= TOLERANCE) {
    points.pop()
  }

  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const [faceStart, faceEnd] = getMarker(entities, '050_ALU_01')
  const [axisStart, axisEnd] = getMarker(entities, '011_MITTE')
  if (Math.abs(faceStart.y - faceEnd.y) > TOLERANCE
    || Math.abs(faceStart.y - minY) > TOLERANCE
    || Math.abs(Math.min(faceStart.x, faceEnd.x) - minX) > TOLERANCE
    || Math.abs(Math.max(faceStart.x, faceEnd.x) - maxX) > TOLERANCE) {
    throw new Error('Die Markierung 050_ALU_01 muss die gesamte Montagefläche des L-Winkels kennzeichnen.')
  }
  if (Math.abs(axisStart.x - axisEnd.x) > TOLERANCE
    || Math.abs(Math.min(axisStart.y, axisEnd.y) - minY) > TOLERANCE
    || Math.abs(Math.max(axisStart.y, axisEnd.y) - maxY) > TOLERANCE) {
    throw new Error('Die Markierung 011_MITTE muss die Profilachse des L-Winkels kennzeichnen.')
  }

  const normalizedPoints = points.map((point) => ({
    x: point.x - axisStart.x,
    y: point.y - minY,
  }))
  const area = polygonArea(normalizedPoints)
  if (Math.abs(area) <= TOLERANCE) throw new Error('Die L-Winkel-Kontur hat keine gültige Fläche.')
  return {
    name: fileName,
    contours: [{ points: normalizedPoints, area }],
    width: maxX - minX,
    depth: maxY - minY,
    centerAxisX: 0,
  }
}

let cachedProfile: Promise<UkAngleProfile> | undefined

export function loadUkAngleProfile(): Promise<UkAngleProfile> {
  if (!cachedProfile) {
    cachedProfile = (async () => {
      const response = await fetch(new URL('gen_L-50-40-2.dxf', document.baseURI))
      if (!response.ok) {
        throw new Error(`Die L-Winkel-DXF konnte nicht geladen werden (HTTP ${response.status}).`)
      }
      return parseUkAngleDxf(await response.text())
    })().catch((error: unknown) => {
      cachedProfile = undefined
      throw error
    })
  }
  return cachedProfile
}
