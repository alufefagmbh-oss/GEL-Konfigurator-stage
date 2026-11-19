import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseWallDxf } from './parseWallDxf'

function lineEntity(startX: number, startY: number, endX: number, endY: number): string {
  return [
    '0', 'LINE', '8', '0',
    '10', String(startX), '20', String(startY), '30', '0',
    '11', String(endX), '21', String(endY), '31', '0',
  ].join('\n')
}

function closedPolylineEntity(points: Array<[number, number]>): string {
  return [
    '0', 'LWPOLYLINE', '8', '0',
    '90', String(points.length), '70', '1',
    ...points.flatMap(([x, y]) => ['10', String(x), '20', String(y)]),
  ].join('\n')
}

function dxf(entities: string[]): string {
  return ['0', 'SECTION', '2', 'ENTITIES', ...entities.flatMap((entity) => entity.split('\n')), '0', 'ENDSEC', '0', 'EOF'].join('\n')
}

describe('parseWallDxf', () => {
  it('parses the rectangular wall DXF fixture', () => {
    const contents = readFileSync(new URL('./fixtures/rectangular-wall.dxf', import.meta.url), 'utf8')

    const contour = parseWallDxf(contents, 'rectangular-wall.dxf')

    expect(contour.width).toBe(2400)
    expect(contour.height).toBe(1200)
  })

  it('parses the sloped wall DXF fixture for profile trimming', () => {
    const contents = readFileSync(new URL('./fixtures/sloped-wall.dxf', import.meta.url), 'utf8')

    const contour = parseWallDxf(contents, 'sloped-wall.dxf')

    expect(contour.width).toBe(2400)
    expect(contour.height).toBe(1200)
    expect(contour.points).toContainEqual({ x: 2400, y: 80 })
  })

  it('joins separate LINE elements and normalizes the lower-left corner to the origin', () => {
    const contents = dxf([
      lineEntity(100, 50, 100, 350),
      lineEntity(400, 350, 100, 350),
      lineEntity(400, 50, 400, 350),
      lineEntity(100, 50, 400, 50),
    ])

    const contour = parseWallDxf(contents, 'wall.dxf')

    expect(contour.name).toBe('wall.dxf')
    expect(contour.width).toBe(300)
    expect(contour.height).toBe(300)
    expect(contour.points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 300 },
      { x: 300, y: 300 },
      { x: 300, y: 0 },
    ])
  })

  it('preserves sloped floor and ceiling contours with vertical side boundaries', () => {
    const contents = dxf([
      lineEntity(0, 0, 200, 10),
      lineEntity(200, 10, 200, 100),
      lineEntity(200, 100, 0, 110),
      lineEntity(0, 110, 0, 0),
    ])

    const contour = parseWallDxf(contents, 'sloped-wall.dxf')

    expect(contour.width).toBe(200)
    expect(contour.height).toBe(110)
    expect(contour.points).toContainEqual({ x: 200, y: 10 })
    expect(contour.points).toContainEqual({ x: 0, y: 110 })
  })

  it('preserves connected multi-segment floor and ceiling edges', () => {
    const contents = dxf([
      lineEntity(0, 0, 100, 20),
      lineEntity(100, 20, 200, 0),
      lineEntity(200, 0, 200, 100),
      lineEntity(200, 100, 0, 100),
      lineEntity(0, 100, 0, 0),
    ])

    const contour = parseWallDxf(contents, 'segmented-wall.dxf')

    expect(contour.width).toBe(200)
    expect(contour.height).toBe(100)
    expect(contour.points).toContainEqual({ x: 100, y: 20 })
  })

  it('rejects wall contours with multiple vertical spans', () => {
    const contents = dxf([
      closedPolylineEntity([[0, 0], [100, 0], [100, 100], [70, 100], [70, 40], [30, 40], [30, 100], [0, 100]]),
    ])

    expect(() => parseWallDxf(contents, 'notched-wall.dxf')).toThrow('genau eine Boden- und eine Deckenkante')
  })

  it('accepts a closed LWPOLYLINE', () => {
    const contents = dxf([
      closedPolylineEntity([[0, 0], [250, 0], [250, 400], [0, 400]]),
    ])

    const contour = parseWallDxf(contents, 'polyline-wall.dxf')

    expect(contour.width).toBe(250)
    expect(contour.height).toBe(400)
  })

  it('rejects an open contour', () => {
    const contents = dxf([
      lineEntity(0, 0, 200, 0),
      lineEntity(200, 0, 200, 100),
      lineEntity(200, 100, 0, 100),
    ])

    expect(() => parseWallDxf(contents, 'open.dxf')).toThrow('geschlossenen')
  })

  it('rejects a self-intersecting contour', () => {
    const contents = dxf([
      lineEntity(0, 0, 100, 100),
      lineEntity(100, 100, 0, 100),
      lineEntity(0, 100, 100, 0),
      lineEntity(100, 0, 0, 0),
    ])

    expect(() => parseWallDxf(contents, 'crossed.dxf')).toThrow('überschneidet sich selbst')
  })
})
