import DxfParser from 'dxf-parser'
import type { SlabPoint } from '../domain/concreteSlab'

interface Entity {
  type?: string
  layer?: string
  inPaperSpace?: boolean
  shape?: boolean
  vertices?: Array<SlabPoint & { bulge?: number }>
}

export function parseGel2001(contents: string): SlabPoint[] {
  const drawing = new DxfParser().parseSync(contents) as { entities?: Entity[] }
  const entities = (drawing.entities ?? []).filter((entity) =>
    entity.type === 'LWPOLYLINE' && entity.layer === '0' && !entity.inPaperSpace)
  if (entities.length !== 2 || entities.some((entity) => entity.shape || !entity.vertices || entity.vertices.length < 2)) {
    throw new Error('Die GEL2001-Datei enthält nicht die erwarteten zwei offenen Profilkonturen.')
  }
  const first = entities[0].vertices!
  const second = entities[1].vertices!
  if ([...first, ...second].some((point) => point.bulge)) throw new Error('Die GEL2001-Kontur enthält nicht unterstützte Bögen.')
  const distance = (a: SlabPoint, b: SlabPoint) => Math.hypot(a.x - b.x, a.y - b.y)
  if (distance(first[first.length - 1], second[0]) > 0.02 || distance(second[second.length - 1], first[0]) > 0.02) {
    throw new Error('Die Endpunkte der GEL2001-Kontur liegen weiter als 0,02 mm auseinander.')
  }
  const midpoint = (a: SlabPoint, b: SlabPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const points = [
    midpoint(second[second.length - 1], first[0]),
    ...first.slice(1, -1),
    midpoint(first[first.length - 1], second[0]),
    ...second.slice(1, -1),
  ]
  const clean = points.filter((point, index) => index === 0 || distance(point, points[index - 1]) > 0.00001)
  const minX = Math.min(...clean.map((point) => point.x))
  const minY = Math.min(...clean.map((point) => point.y))
  return clean.map((point) => ({ x: point.x - minX, y: point.y - minY }))
}
