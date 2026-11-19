import DxfParser from 'dxf-parser'
import type { Point2D, SupportRailProfile } from '../domain/types'

interface DxfEntity {
  type?: string
  layer?: string
  inPaperSpace?: boolean
  vertices?: Point2D[]
}

interface ParsedDxf {
  entities?: DxfEntity[]
}

const TOLERANCE = 1e-5
const CONTOUR_LAYER = '002_KONTUR'
const REAR_FACE_LAYER = 'Ebene 1'
const SUPPORT_LAYER = 'Auflage_Profile'

function polygonArea(points: Point2D[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2
}

function distanceToSegment(point: Point2D, start: Point2D, end: Point2D): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - start.x - ratio * dx, point.y - start.y - ratio * dy)
}

function getSingleEntity(entities: DxfEntity[], layer: string, types: string[]): Point2D[] {
  const matches = entities.filter((entity) =>
    !entity.inPaperSpace && entity.layer === layer && types.includes(entity.type ?? ''),
  )
  if (matches.length !== 1 || !matches[0].vertices) {
    throw new Error(`Die Auflager-Schienen-DXF benötigt genau ein Element auf dem Layer ${layer}.`)
  }
  return matches[0].vertices
}

export function parseSupportRailDxf(contents: string, fileName = 'Auflager-Schiene'): SupportRailProfile {
  let drawing: ParsedDxf
  try {
    drawing = new DxfParser().parseSync(contents) as ParsedDxf
  } catch {
    throw new Error('Die Auflager-Schienen-DXF konnte nicht gelesen werden.')
  }
  const entities = drawing.entities ?? []
  const rawContour = getSingleEntity(entities, CONTOUR_LAYER, ['LWPOLYLINE', 'POLYLINE'])
  const [rearStart, rearEnd] = getSingleEntity(entities, REAR_FACE_LAYER, ['LINE'])
  const [supportStart, supportEnd] = getSingleEntity(entities, SUPPORT_LAYER, ['LINE'])
  if (rawContour.length < 3 || !rearEnd || !supportEnd) {
    throw new Error('Die Auflager-Schienen-DXF enthält keine gültige Kontur oder Markierung.')
  }

  const contour = rawContour.map(({ x, y }) => ({ x, y }))
  if (Math.hypot(contour[0].x - contour.at(-1)!.x, contour[0].y - contour.at(-1)!.y) <= TOLERANCE) {
    contour.pop()
  } else if (distanceToSegment(contour.at(-1)!, contour[0], contour[1]) <= 1e-4) {
    // Offene Kontur: Der letzte Punkt liegt auf der ersten Kante, der Startpunkt ist nur ein überstehendes Stück.
    contour.shift()
  }
  const minX = Math.min(...contour.map((point) => point.x))
  const maxX = Math.max(...contour.map((point) => point.x))
  const minY = Math.min(...contour.map((point) => point.y))
  const maxY = Math.max(...contour.map((point) => point.y))

  const rearIsMaximum = Math.abs(rearStart.x - maxX) <= TOLERANCE
  if (Math.abs(rearStart.x - rearEnd.x) > TOLERANCE
    || !rearIsMaximum && Math.abs(rearStart.x - minX) > TOLERANCE
    || Math.abs(Math.min(rearStart.y, rearEnd.y) - minY) > TOLERANCE
    || Math.abs(Math.max(rearStart.y, rearEnd.y) - maxY) > TOLERANCE) {
    throw new Error('Die Markierung auf Layer Ebene 1 muss die gesamte Rückseite der Auflager-Schiene kennzeichnen.')
  }
  if (Math.abs(supportStart.y - supportEnd.y) > TOLERANCE
    || supportStart.y <= minY + TOLERANCE
    || supportStart.y >= maxY - TOLERANCE) {
    throw new Error('Die Markierung auf Layer Auflage_Profile muss die waagerechte Lascheoberseite kennzeichnen.')
  }

  // Tiefe wächst von der Rückseite (am L-Winkel) in Richtung Fassade.
  const points = contour.map((point) => ({
    x: rearIsMaximum ? maxX - point.x : point.x - minX,
    y: point.y - minY,
  }))
  const area = polygonArea(points)
  if (Math.abs(area) <= TOLERANCE) {
    throw new Error('Die Kontur der Auflager-Schiene hat keine gültige Fläche.')
  }

  return {
    name: fileName,
    contours: [{ points, area }],
    depth: maxX - minX,
    height: maxY - minY,
    supportHeight: supportStart.y - minY,
  }
}

let cachedProfile: Promise<SupportRailProfile> | undefined

export function loadSupportRailProfile(): Promise<SupportRailProfile> {
  if (!cachedProfile) {
    cachedProfile = (async () => {
      const response = await fetch(new URL('genAuflager-Schiene.dxf', document.baseURI))
      if (!response.ok) {
        throw new Error(`Die Auflager-Schienen-DXF konnte nicht geladen werden (HTTP ${response.status}).`)
      }
      return parseSupportRailDxf(await response.text())
    })().catch((error: unknown) => {
      cachedProfile = undefined
      throw error
    })
  }
  return cachedProfile
}
