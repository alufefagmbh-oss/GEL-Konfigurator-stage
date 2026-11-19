import DxfParser from 'dxf-parser'
import { assertVerticallyMonotoneWallContour } from '../domain/wallContour'
import type { Point2D, WallContour } from '../domain/types'

interface DxfVertex extends Point2D {
  bulge?: number
}

interface DxfEntity {
  type?: string
  inPaperSpace?: boolean
  closed?: boolean
  shape?: boolean
  vertices?: DxfVertex[]
}

interface ParsedDxf {
  entities?: DxfEntity[]
}

interface Segment {
  start: Point2D
  end: Point2D
}

interface GraphEdge {
  start: number
  end: number
}

const ENDPOINT_TOLERANCE = 0.01
const GEOMETRY_TOLERANCE = 1e-7

function cross(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function isOnSegment(point: Point2D, start: Point2D, end: Point2D): boolean {
  return Math.abs(cross(start, end, point)) <= GEOMETRY_TOLERANCE
    && point.x >= Math.min(start.x, end.x) - GEOMETRY_TOLERANCE
    && point.x <= Math.max(start.x, end.x) + GEOMETRY_TOLERANCE
    && point.y >= Math.min(start.y, end.y) - GEOMETRY_TOLERANCE
    && point.y <= Math.max(start.y, end.y) + GEOMETRY_TOLERANCE
}

function segmentsIntersect(first: Segment, second: Segment): boolean {
  const firstStart = cross(first.start, first.end, second.start)
  const firstEnd = cross(first.start, first.end, second.end)
  const secondStart = cross(second.start, second.end, first.start)
  const secondEnd = cross(second.start, second.end, first.end)

  if (firstStart * firstEnd < -GEOMETRY_TOLERANCE
    && secondStart * secondEnd < -GEOMETRY_TOLERANCE) return true
  return Math.abs(firstStart) <= GEOMETRY_TOLERANCE && isOnSegment(second.start, first.start, first.end)
    || Math.abs(firstEnd) <= GEOMETRY_TOLERANCE && isOnSegment(second.end, first.start, first.end)
    || Math.abs(secondStart) <= GEOMETRY_TOLERANCE && isOnSegment(first.start, second.start, second.end)
    || Math.abs(secondEnd) <= GEOMETRY_TOLERANCE && isOnSegment(first.end, second.start, second.end)
}

function assertSimplePolygon(points: Point2D[]): void {
  for (let first = 0; first < points.length; first += 1) {
    const firstSegment = { start: points[first], end: points[(first + 1) % points.length] }
    for (let second = first + 1; second < points.length; second += 1) {
      if (second === first + 1 || first === 0 && second === points.length - 1) continue
      const secondSegment = { start: points[second], end: points[(second + 1) % points.length] }
      if (segmentsIntersect(firstSegment, secondSegment)) {
        throw new Error('Die Mauerkontur überschneidet sich selbst. Bitte korrigieren Sie die DXF-Geometrie.')
      }
    }
  }
}

function getContourSegments(entities: DxfEntity[]): Segment[] {
  const unsupportedCurves = entities.filter((entity) =>
    !entity.inPaperSpace && ['ARC', 'CIRCLE', 'ELLIPSE', 'SPLINE'].includes(entity.type ?? ''),
  )
  if (unsupportedCurves.length > 0) {
    const types = [...new Set(unsupportedCurves.map((entity) => entity.type))].join(', ')
    throw new Error(`Die Mauerkontur enthält noch nicht unterstützte Kurven (${types}). Bitte verwenden Sie LINE-Elemente oder Polylinien.`)
  }

  const segments: Segment[] = []
  const contourEntities = entities.filter((entity) =>
    !entity.inPaperSpace && (entity.type === 'LINE' || entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE'),
  )
  if (contourEntities.length === 0) {
    throw new Error('Keine Mauerkontur gefunden. Unterstützt werden LINE, LWPOLYLINE und POLYLINE im Modellbereich.')
  }

  for (const entity of contourEntities) {
    const vertices = entity.vertices ?? []
    if (entity.type === 'LINE' && vertices.length !== 2) {
      throw new Error('Ein LINE-Element der Mauerkontur besitzt keine gültigen zwei Endpunkte.')
    }
    if (vertices.length < 2) {
      throw new Error('Ein Konturelement der Mauerkontur enthält zu wenige Punkte.')
    }

    const isClosed = entity.type !== 'LINE' && (entity.closed === true || entity.shape === true)
    const segmentCount = vertices.length - 1 + (isClosed ? 1 : 0)
    for (let index = 0; index < segmentCount; index += 1) {
      const start = vertices[index]
      const end = vertices[(index + 1) % vertices.length]
      if (Math.abs(start.bulge ?? 0) > 1e-8) {
        throw new Error('Kreisbögen in der Mauerkontur werden noch nicht unterstützt. Bitte wandeln Sie sie in Liniensegmente um.')
      }
      if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) {
        throw new Error('Die Mauerkontur enthält ungültige Koordinaten.')
      }
      if (Math.hypot(end.x - start.x, end.y - start.y) <= GEOMETRY_TOLERANCE) continue
      segments.push({
        start: { x: start.x, y: start.y },
        end: { x: end.x, y: end.y },
      })
    }
  }

  if (segments.length < 3) {
    throw new Error('Die Mauerkontur benötigt mindestens drei gültige Liniensegmente.')
  }
  return segments
}

function joinSegments(segments: Segment[]): Point2D[] {
  const nodes: Point2D[] = []
  const edges: GraphEdge[] = []

  function nodeFor(point: Point2D): number {
    const matches = nodes
      .map((node, index) => ({ index, distance: Math.hypot(node.x - point.x, node.y - point.y) }))
      .filter((match) => match.distance <= ENDPOINT_TOLERANCE)
    if (matches.length > 1) {
      throw new Error('Die Mauerkontur hat mehrdeutige oder zu dicht beieinanderliegende Eckpunkte.')
    }
    if (matches.length === 1) return matches[0].index
    nodes.push(point)
    return nodes.length - 1
  }

  for (const segment of segments) {
    const start = nodeFor(segment.start)
    const end = nodeFor(segment.end)
    if (start === end) continue
    edges.push({ start, end })
  }

  const adjacentEdges = nodes.map(() => [] as number[])
  edges.forEach((edge, index) => {
    adjacentEdges[edge.start].push(index)
    adjacentEdges[edge.end].push(index)
  })
  if (adjacentEdges.some((edgeIndices) => edgeIndices.length !== 2)) {
    throw new Error('Die Mauerkontur muss aus geschlossenen, an jeder Ecke verbundenen Segmenten bestehen.')
  }

  const unvisitedEdges = new Set(edges.map((_, index) => index))
  const loops: Point2D[][] = []
  while (unvisitedEdges.size > 0) {
    const firstEdgeIndex = unvisitedEdges.values().next().value
    if (firstEdgeIndex === undefined) break
    const startNode = edges[firstEdgeIndex].start
    let currentNode = startNode
    const points = [nodes[startNode]]

    while (true) {
      const nextEdgeIndex = adjacentEdges[currentNode].find((index) => unvisitedEdges.has(index))
      if (nextEdgeIndex === undefined) {
        throw new Error('Die Mauerkontur konnte nicht zu einer geschlossenen Kontur verbunden werden.')
      }
      unvisitedEdges.delete(nextEdgeIndex)
      const edge = edges[nextEdgeIndex]
      currentNode = edge.start === currentNode ? edge.end : edge.start
      if (currentNode === startNode) break
      points.push(nodes[currentNode])
      if (points.length > edges.length) {
        throw new Error('Die Mauerkontur konnte nicht eindeutig geschlossen werden.')
      }
    }
    loops.push(points)
  }

  if (loops.length !== 1) {
    throw new Error('Die DXF muss genau eine geschlossene Mauerkontur enthalten.')
  }
  return loops[0]
}

function signedArea(points: Point2D[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2
}

function assertVerticalSide(points: Point2D[], x: number, label: string): void {
  const verticalLength = points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length]
    return Math.abs(point.x - x) <= ENDPOINT_TOLERANCE && Math.abs(next.x - x) <= ENDPOINT_TOLERANCE
      ? total + Math.abs(next.y - point.y)
      : total
  }, 0)
  if (verticalLength <= ENDPOINT_TOLERANCE) {
    throw new Error(`Die ${label} Begrenzung der Mauerkontur muss vertikal verlaufen.`)
  }
}

export function parseWallDxf(contents: string, fileName: string): WallContour {
  let drawing: ParsedDxf
  try {
    drawing = new DxfParser().parseSync(contents) as ParsedDxf
  } catch {
    throw new Error('Die DXF-Mauerkontur konnte nicht gelesen werden. Bitte prüfen Sie das Dateiformat.')
  }

  const segments = getContourSegments(drawing.entities ?? [])
  const points = joinSegments(segments)
  assertSimplePolygon(points)

  const area = signedArea(points)
  if (Math.abs(area) <= GEOMETRY_TOLERANCE) {
    throw new Error('Die Mauerkontur hat keine gültige Fläche.')
  }

  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const width = maxX - minX
  const height = maxY - minY
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Die Mauerkontur benötigt eine positive Breite und Höhe.')
  }

  assertVerticalSide(points, minX, 'linke')
  assertVerticalSide(points, maxX, 'rechte')

  const contour: WallContour = {
    name: fileName,
    width,
    height,
    points: points.map((point) => ({ x: point.x - minX, y: point.y - minY })),
  }
  assertVerticallyMonotoneWallContour(contour)
  return contour
}
