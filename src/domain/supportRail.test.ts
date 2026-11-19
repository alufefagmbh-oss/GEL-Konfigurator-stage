import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSupportRailDxf } from '../dxf/parseSupportRailDxf'
import { createSupportRailGeometry } from '../geometry/createSupportRailGeometry'
import {
  calculateSupportRailPieces,
  getSupportRailCorner,
  getSupportRailPieceLength,
} from './supportRail'
import type { WallContour } from './types'

const profile = parseSupportRailDxf(
  readFileSync(new URL('../../public/genAuflager-Schiene.dxf', import.meta.url), 'utf8'),
)

function contour(points: [number, number][], width: number, height: number): WallContour {
  return { name: 'test', width, height, points: points.map(([x, y]) => ({ x, y })) }
}

describe('Auflager-Schiene', () => {
  it('runs flush along a flat bottom edge, with the tab top at the profile ends', () => {
    const pieces = calculateSupportRailPieces(3000, null, profile, 10)
    expect(pieces).toHaveLength(1)
    const start = getSupportRailCorner(pieces[0], 'start', 0)
    const end = getSupportRailCorner(pieces[0], 'end', 0)
    expect(start.x).toBeCloseTo(5, 6)
    expect(end.x).toBeCloseTo(2995, 6)
    expect(start.y).toBeCloseTo(10, 6)
    expect(end.y).toBeCloseTo(10, 6)
    expect(getSupportRailPieceLength(pieces[0], profile)).toBeCloseTo(2990, 6)
  })

  it('splits rails longer than 6000 mm into equal square-cut pieces', () => {
    const pieces = calculateSupportRailPieces(13000, null, profile, 10)
    expect(pieces).toHaveLength(3)
    pieces.forEach((piece) => expect(getSupportRailPieceLength(piece, profile)).toBeLessThanOrEqual(6000))
    expect(getSupportRailCorner(pieces[0], 'end', 50).x).toBeCloseTo(5 + 12990 / 3, 6)
    expect(getSupportRailCorner(pieces[1], 'start', 50).x).toBeCloseTo(5 + 12990 / 3, 6)
  })

  it('miters the pieces at a kink of the lower facade contour', () => {
    const kinked = contour([[0, 0], [1000, 0], [2000, 1000], [2000, 2000], [0, 2000]], 2000, 2000)
    const pieces = calculateSupportRailPieces(2000, kinked, profile, 10)
    expect(pieces).toHaveLength(2)
    for (const height of [-1.5, 0, 50, 105]) {
      const end = getSupportRailCorner(pieces[0], 'end', height)
      const start = getSupportRailCorner(pieces[1], 'start', height)
      expect(end.x).toBeCloseTo(start.x, 6)
      expect(end.y).toBeCloseTo(start.y, 6)
    }
    const reference = getSupportRailCorner(pieces[1], 'start', 0)
    expect(reference.x).toBeCloseTo(1000, 6)
    expect(reference.y).toBeCloseTo(10, 6)
    expect(pieces[1].direction.y).toBeGreaterThan(0.7)
  })

  it('stays parallel to a sloped bottom edge and lifts the tab by the end gap', () => {
    const sloped = contour([[0, 0], [2000, 400], [2000, 2000], [0, 2000]], 2000, 2000)
    const [piece] = calculateSupportRailPieces(2000, sloped, profile, 10)
    const start = getSupportRailCorner(piece, 'start', 0)
    const end = getSupportRailCorner(piece, 'end', 0)
    expect((end.y - start.y) / (end.x - start.x)).toBeCloseTo(0.2, 9)
    expect(start.y).toBeCloseTo(11, 6)
  })

  it('builds a closed mesh whose volume equals cross-section area times length', () => {
    const [piece] = calculateSupportRailPieces(1010, null, profile, 10)
    const geometry = createSupportRailGeometry(profile, piece, 100)
    const positions = geometry.getAttribute('position')
    let volume = 0
    for (let index = 0; index < positions.count; index += 3) {
      const [a, b, c] = [0, 1, 2].map((offset) => ({
        x: positions.getX(index + offset),
        y: positions.getY(index + offset),
        z: positions.getZ(index + offset),
      }))
      volume += (
        a.x * (b.y * c.z - b.z * c.y)
        - a.y * (b.x * c.z - b.z * c.x)
        + a.z * (b.x * c.y - b.y * c.x)
      ) / 6
    }
    expect(volume).toBeCloseTo(Math.abs(profile.contours[0].area) * 1000, 0)
    expect(geometry.boundingBox!.max.y).toBeCloseTo(100, 6)
    expect(geometry.boundingBox!.min.y).toBeCloseTo(100 - profile.depth, 6)
    expect(geometry.boundingBox!.min.z).toBeCloseTo(10 - profile.supportHeight, 6)
  })
})
