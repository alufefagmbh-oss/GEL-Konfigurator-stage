import { describe, expect, it } from 'vitest'
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { calculateSlabContour } from '../domain/concreteSlab'
import { calculateProfileParts, sideFixingWallBounds } from '../domain/railingProfile'
import { calculateRailingAccessories } from '../domain/railingAccessories'
import { DEFAULT_STATIC_ASSUMPTIONS } from '../domain/staticAssumptions'
import { SIDE_FIXING_AXIS_HEIGHT } from '../domain/railingMounting'
import { GEL2001_PROFILE } from '../dxf/gel2001Profile'
import { createProfileHoleEdges, createRailingProfileGeometry } from './RailingProfiles'

describe('Profilvorschau mit Bohrungen', () => {
  it('cuts only the blechseitige 7A wall at the DXF axis height', () => {
    const contour = calculateSlabContour([{ length: 1000, angle: 180 }], 10)
    if (!contour.points || !contour.dimensions) throw new Error('Ungültige Testkontur')
    const width = Math.max(...GEL2001_PROFILE.map((point) => point.x))
    const part = calculateProfileParts(contour.dimensions, GEL2001_PROFILE, -width, DEFAULT_STATIC_ASSUMPTIONS, '7A')[0]
    const geometry = createRailingProfileGeometry(part, contour.points, 195, '7A', 0)
    const material = new MeshBasicMaterial({ side: DoubleSide })
    const mesh = new Mesh(geometry, material)
    const minX = Math.min(...contour.points.map((point) => point.x))
    const maxX = Math.max(...contour.points.map((point) => point.x))
    const minY = Math.min(...contour.points.map((point) => point.y))
    const maxY = Math.max(...contour.points.map((point) => point.y))
    const scale = Math.max(maxX - minX, maxY - minY, 195)
    const hole = part.holes[1]
    const normal = new Vector3(part.direction.y, 0, -part.direction.x)
    const wall = sideFixingWallBounds(part.section)
    const wallCenter = (wall.inner + wall.outer) / 2
    const base = new Vector3(
      (hole.x + normal.x * (wallCenter - wall.outer) - (minX + maxX) / 2) / scale,
      SIDE_FIXING_AXIS_HEIGHT / scale,
      (hole.y + normal.z * (wallCenter - wall.outer) - (minY + maxY) / 2) / scale,
    )
    const outward = new Raycaster(base, normal)
    const outside = base.clone().addScaledVector(normal, (wall.outer - wallCenter + 1) / scale)
    const inward = new Raycaster(outside, normal.clone().negate())
    try {
      expect(outward.intersectObject(mesh)).toHaveLength(0)
      const oppositeWall = inward.intersectObject(mesh)
      expect(oppositeWall.length).toBeGreaterThan(0)
      expect(oppositeWall[0].distance * scale).toBeGreaterThan(30)
    } finally {
      geometry.dispose()
      material.dispose()
    }
  })

  it('cuts the through hole and the countersink in the profile floor', () => {
    const contour = calculateSlabContour([{ length: 1000, angle: 180 }], 500)
    if (!contour.points || !contour.dimensions) throw new Error('Ungültige Testkontur')
    const part = calculateProfileParts(contour.dimensions, GEL2001_PROFILE, 0, DEFAULT_STATIC_ASSUMPTIONS)[0]
    const thickness = 200
    const points = contour.points
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))
    const scale = Math.max(maxX - minX, maxY - minY, thickness)
    const geometry = createRailingProfileGeometry(part, points, thickness)
    const material = new MeshBasicMaterial({ side: DoubleSide })
    const mesh = new Mesh(geometry, material)
    const hole = part.holes[1]
    const holeEdges = createProfileHoleEdges(part, points, thickness)
    const intersections = (dx: number) => new Raycaster(
      new Vector3((hole.x + dx - (minX + maxX) / 2) / scale, (thickness / 2 + 12) / scale, (hole.y - (minY + maxY) / 2) / scale),
      new Vector3(0, -1, 0),
    ).intersectObject(mesh)
    try {
      expect(intersections(0)).toHaveLength(0)
      const sink = intersections(8)
      expect(sink.length).toBeGreaterThan(0)
      expect(sink[0].point.y * scale - thickness / 2).toBeGreaterThan(7.5)
      expect(sink[0].point.y * scale - thickness / 2).toBeLessThan(10)
      expect(intersections(12)[0].point.y * scale - thickness / 2).toBeCloseTo(11, 1)
      const positions = holeEdges.getAttribute('position')
      expect(positions.count).toBe(part.holes.length * 24 * 2)
      expect(positions.getY(0) * scale - thickness / 2).toBeCloseTo(11)
    } finally {
      geometry.dispose()
      holeEdges.dispose()
      material.dispose()
    }
  })

  it('creates closed mesh geometry from every supplied GEL2001 accessory contour', () => {
    const contour = calculateSlabContour([{ length: 3000, angle: 180 }], 500)
    if (!contour.points || !contour.dimensions) throw new Error('Ungültige Testkontur')
    const accessories = calculateRailingAccessories(contour.dimensions, 0, GEL2001_PROFILE)
    const parts = [...accessories.sealLips, ...accessories.clampWedges, ...accessories.glassShoes]
    for (const part of parts) {
      const geometry = createRailingProfileGeometry(part, contour.points, 200)
      try {
        const positions = geometry.getAttribute('position')
        expect(positions.count).toBeGreaterThan(0)
        for (let index = 0; index < positions.count; index += 1) {
          expect(Number.isFinite(positions.getX(index))).toBe(true)
          expect(Number.isFinite(positions.getY(index))).toBe(true)
          expect(Number.isFinite(positions.getZ(index))).toBe(true)
        }
      } finally { geometry.dispose() }
    }
  })
})
