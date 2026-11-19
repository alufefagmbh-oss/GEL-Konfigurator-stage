import DxfParser from 'dxf-parser'
import type { Point2D, UkRailProfile } from '../domain/types'

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

function polygonArea(points: Point2D[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2
}

function getMarker(
  entities: DxfEntity[],
  layerName: string,
): [Point2D, Point2D] {
  const matches = entities.filter((entity) =>
    !entity.inPaperSpace
      && entity.type === 'LINE'
      && entity.layer?.toUpperCase() === layerName,
  )
  if (matches.length !== 1 || matches[0].vertices?.length !== 2) {
    throw new Error(`Die UK-DXF benötigt genau eine Linie auf dem Layer ${layerName}.`)
  }
  const vertices = matches[0].vertices
  if (!vertices) throw new Error(`Die Markierung auf Layer ${layerName} ist ungültig.`)
  return [vertices[0], vertices[1]]
}

function getPolylineMarker(
  entities: DxfEntity[],
  layerName: string,
): [Point2D, Point2D] {
  const matches = entities.filter((entity) =>
    !entity.inPaperSpace
      && (entity.type === 'LINE' || entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE')
      && entity.layer?.toUpperCase() === layerName.toUpperCase(),
  )
  if (matches.length !== 1 || matches[0].vertices?.length !== 2) {
    throw new Error(`Die UK-DXF benötigt genau eine gerade Zweipunkt-Markierung auf dem Layer ${layerName}.`)
  }
  const vertices = matches[0].vertices
  if (!vertices) throw new Error(`Die Markierung auf Layer ${layerName} ist ungültig.`)
  return [vertices[0], vertices[1]]
}

export function parseUkRailDxf(contents: string, fileName = 'UK-Schiene'): UkRailProfile {
  let drawing: ParsedDxf
  try {
    drawing = new DxfParser().parseSync(contents) as ParsedDxf
  } catch {
    throw new Error('Die UK-Schienen-DXF konnte nicht gelesen werden. Bitte prüfen Sie das Dateiformat.')
  }

  const profileEntities = (drawing.entities ?? []).filter((entity) =>
    !entity.inPaperSpace
      && entity.layer === '0'
      && (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE')
      && (entity.closed === true || entity.shape === true)
      && Array.isArray(entity.vertices),
  )
  if (profileEntities.length !== 1) {
    throw new Error('Die UK-DXF muss genau eine geschlossene Profilkontur auf Layer 0 enthalten.')
  }
  const vertices = profileEntities[0].vertices ?? []
  if (vertices.length < 3 || vertices.some((point) => Math.abs(point.bulge ?? 0) > 1e-8)) {
    throw new Error('Die UK-Schienenkontur muss mindestens drei gerade Profilkanten enthalten.')
  }

  const [sideStart, sideEnd] = getMarker(drawing.entities ?? [], '050_ALU_01')
  const [axisStart, axisEnd] = getMarker(drawing.entities ?? [], '011_MITTE')
  const [screwHeadStart, screwHeadEnd] = getPolylineMarker(drawing.entities ?? [], 'Ebene 1')
  const minimumX = Math.min(...vertices.map((point) => point.x))
  const maximumX = Math.max(...vertices.map((point) => point.x))
  const minimumY = Math.min(...vertices.map((point) => point.y))
  const maximumY = Math.max(...vertices.map((point) => point.y))
  const tolerance = 1e-5

  if (Math.abs(sideStart.x - sideEnd.x) > tolerance
    || Math.abs(sideStart.x - minimumX) > tolerance && Math.abs(sideStart.x - maximumX) > tolerance
    || Math.abs(Math.min(sideStart.y, sideEnd.y) - minimumY) > tolerance
    || Math.abs(Math.max(sideStart.y, sideEnd.y) - maximumY) > tolerance) {
    throw new Error('Die Linie auf Layer 050_ALU_01 muss eine vollständige Profilaußenkante markieren.')
  }
  if (Math.abs(axisStart.y - axisEnd.y) > tolerance
    || Math.abs(Math.min(axisStart.x, axisEnd.x) - minimumX) > tolerance
    || Math.abs(Math.max(axisStart.x, axisEnd.x) - maximumX) > tolerance
    || axisStart.y <= minimumY || axisStart.y >= maximumY) {
    throw new Error('Die Linie auf Layer 011_MITTE muss die mittlere Höhenachse der UK-Schiene markieren.')
  }
  if (Math.abs(screwHeadStart.x - screwHeadEnd.x) > tolerance
    || Math.min(screwHeadStart.y, screwHeadEnd.y) > axisStart.y + tolerance
    || Math.max(screwHeadStart.y, screwHeadEnd.y) < axisStart.y - tolerance) {
    throw new Error('Die Markierung auf Layer Ebene 1 muss eine zur 011_MITTE fluchtende Schraubenkopf-Ebene kennzeichnen.')
  }

  const depthDirection = Math.abs(sideStart.x - minimumX) <= tolerance ? 1 : -1
  const screwHeadPlaneDepth = (screwHeadStart.x - sideStart.x) * depthDirection
  const points = vertices.map((point) => ({
    x: (point.x - sideStart.x) * depthDirection,
    y: point.y - axisStart.y,
  }))
  const area = polygonArea(points)
  if (Math.abs(area) <= tolerance) {
    throw new Error('Die UK-Schienenkontur hat keine gültige Fläche.')
  }

  return {
    name: fileName,
    contours: [{ points, area }],
    depth: maximumX - minimumX,
    height: maximumY - minimumY,
    screwHeadPlaneDepth,
    profileSideDepth: 0,
    centerAxisHeight: 0,
  }
}

let cachedProfile: Promise<UkRailProfile> | undefined

export function loadUkRailProfile(): Promise<UkRailProfile> {
  if (!cachedProfile) {
    cachedProfile = (async () => {
      const response = await fetch(new URL('genUK-Schiene.dxf', document.baseURI))
      if (!response.ok) {
        throw new Error(`Die UK-Schienen-DXF konnte nicht geladen werden (HTTP ${response.status}).`)
      }
      return parseUkRailDxf(await response.text(), 'UK-Schiene')
    })().catch((error: unknown) => {
      cachedProfile = undefined
      throw error
    })
  }
  return cachedProfile
}
