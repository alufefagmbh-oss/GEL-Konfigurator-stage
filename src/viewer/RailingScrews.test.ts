import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { GEL2001_PROFILE } from '../dxf/gel2001Profile'
import { calculateSlabContour } from '../domain/concreteSlab'
import { calculateProfileParts, PROFILE_FLOOR_HEIGHT } from '../domain/railingProfile'
import { DEFAULT_STATIC_ASSUMPTIONS } from '../domain/staticAssumptions'
import { createRailingScrewGeometry, createScrewEdges, railingScrewMatrices } from './RailingScrews'

describe('Schrauben in der Profilvorschau', () => {
  it('creates a simplified countersunk screw with 105 mm total length', () => {
    const geometry = createRailingScrewGeometry()
    geometry.computeBoundingBox()
    expect(geometry.boundingBox?.min.y).toBe(-105)
    expect(geometry.boundingBox?.max.y).toBe(0)
    expect(geometry.boundingBox?.max.x).toBeCloseTo(10.5)
    geometry.dispose()
  })

  it('places one screw at each hole, including mitered segments and different load cases', () => {
    const contour = calculateSlabContour([{ length: 3000, angle: 180 }, { length: 2000, angle: 270 }], 500)
    if (!contour.points || !contour.dimensions) throw new Error('Ungültige Testkontur')
    const points = contour.points
    const thickness = 200
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))
    const scale = Math.max(maxX - minX, maxY - minY, thickness)
    const counts: number[] = []
    for (const assumptions of [DEFAULT_STATIC_ASSUMPTIONS, { location: 'outside', usage: 'public' } as const]) {
      const parts = calculateProfileParts(contour.dimensions, GEL2001_PROFILE, 0, assumptions)
      const holes = parts.flatMap((part) => part.holes)
      const matrices = railingScrewMatrices(parts, points, thickness)
      expect(matrices).toHaveLength(holes.length)
      const singleEdges = createScrewEdges(matrices.slice(0, 1))
      const allEdges = createScrewEdges(matrices)
      expect(singleEdges.getAttribute('position').count).toBe(3 * 24 * 2)
      expect(allEdges.getAttribute('position').count).toBe(singleEdges.getAttribute('position').count * holes.length)
      const firstPoint = new Vector3().fromBufferAttribute(singleEdges.getAttribute('position'), 0)
      const matchingPoint = new Vector3().fromBufferAttribute(allEdges.getAttribute('position'), 0)
      expect(firstPoint.distanceTo(matchingPoint)).toBeCloseTo(0)
      singleEdges.dispose()
      allEdges.dispose()
      matrices.forEach((matrix, index) => {
        const head = new Vector3().applyMatrix4(matrix)
        const tip = new Vector3(0, -105, 0).applyMatrix4(matrix)
        expect(head.x).toBeCloseTo((holes[index].x - (minX + maxX) / 2) / scale)
        expect(head.z).toBeCloseTo((holes[index].y - (minY + maxY) / 2) / scale)
        expect(head.y).toBeCloseTo((thickness / 2 + PROFILE_FLOOR_HEIGHT) / scale)
        expect(head.y - tip.y).toBeCloseTo(105 / scale)
      })
      counts.push(matrices.length)
    }
    expect(counts[1]).toBeGreaterThan(counts[0])
    expect(railingScrewMatrices([], points, thickness)).toHaveLength(0)
  })
})
