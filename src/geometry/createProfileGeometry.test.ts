import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createProfileGeometry } from './createProfileGeometry'
import { getWallVerticalBounds } from '../domain/wallContour'
import type { ProfileDefinition, WallContour } from '../domain/types'

const profile: ProfileDefinition = {
  name: 'Testprofil',
  source: 'example',
  width: 42,
  depth: 30,
  contours: [{
    area: 1260,
    points: [
      { x: -21, y: -15 },
      { x: 21, y: -15 },
      { x: 21, y: 15 },
      { x: -21, y: 15 },
    ],
  }],
}

describe('createProfileGeometry wall trimming', () => {
  it('shortens straight profile geometry by the selected gap at both ends', () => {
    const geometry = createProfileGeometry(profile, 100, undefined, undefined, 10)

    expect(geometry.boundingBox?.min.y).toBeCloseTo(-40, 5)
    expect(geometry.boundingBox?.max.y).toBeCloseTo(40, 5)
    geometry.dispose()
  })

  it('applies the vertical gap inward from sloped wall edges', () => {
    const contour: WallContour = {
      name: 'sloped-wall.dxf',
      width: 200,
      height: 110,
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 10 },
        { x: 200, y: 100 },
        { x: 0, y: 110 },
      ],
    }
    const geometry = createProfileGeometry(profile, 130, { contour, axisX: -50 }, undefined, 10)
    const position = geometry.getAttribute('position')
    for (let index = 0; index < position.count; index += 1) {
      const wallX = position.getX(index) - 50 + contour.width / 2
      const bounds = getWallVerticalBounds(contour, wallX)
      const y = position.getY(index) + contour.height / 2
      const lowerCut = bounds.bottom + 10
      const upperCut = bounds.top - 10
      expect(y >= lowerCut - 1e-5 && y <= upperCut + 1e-5).toBe(true)
    }
    geometry.dispose()
  })

  it('trims profile ends to the selected facade boundary planes', () => {
    const geometry = createProfileGeometry(profile, 100, undefined, { leftX: -10, rightX: 12 })
    expect(geometry.boundingBox?.min.x).toBeCloseTo(-10, 5)
    expect(geometry.boundingBox?.max.x).toBeCloseTo(12, 5)
    geometry.dispose()
  })

  it('cuts profile ends to sloped wall boundaries across the profile width', () => {
    const contour: WallContour = {
      name: 'sloped-wall.dxf',
      width: 200,
      height: 110,
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 10 },
        { x: 200, y: 100 },
        { x: 0, y: 110 },
      ],
    }

    const geometry = createProfileGeometry(profile, 130, { contour, axisX: -50 })
    const untrimmedGeometry = createProfileGeometry(profile, 130)
    const position = geometry.getAttribute('position')
    const bounds = geometry.boundingBox
    let triangleArea = 0
    for (let index = 0; index < position.count; index += 3) {
      const first = new THREE.Vector3().fromBufferAttribute(position, index)
      const second = new THREE.Vector3().fromBufferAttribute(position, index + 1)
      const third = new THREE.Vector3().fromBufferAttribute(position, index + 2)
      triangleArea += second.sub(first).cross(third.sub(first)).length() / 2
    }
    expect(bounds).not.toBeNull()
    expect(triangleArea).toBeGreaterThan(10_000)
    expect(bounds!.min.y).toBeCloseTo(-53.55, 5)
    expect(bounds!.max.y).toBeCloseTo(53.55, 5)
    expect(bounds!.min.y).toBeGreaterThan(untrimmedGeometry.boundingBox!.min.y)
    expect(bounds!.max.y).toBeLessThan(untrimmedGeometry.boundingBox!.max.y)

    for (let index = 0; index < position.count; index += 1) {
      const wallX = position.getX(index) - 50 + contour.width / 2
      const wallBounds = getWallVerticalBounds(contour, wallX)
      const expectedBottom = wallBounds.bottom - contour.height / 2
      const expectedTop = wallBounds.top - contour.height / 2
      const y = position.getY(index)
      expect(Math.min(Math.abs(y - expectedBottom), Math.abs(y - expectedTop))).toBeLessThan(1e-5)
    }

    geometry.dispose()
    untrimmedGeometry.dispose()
  })

  it('extends the longest segmented floor section across the full profile width', () => {
    const contour: WallContour = {
      name: 'segmented-wall.dxf',
      width: 200,
      height: 100,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 20 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
        { x: 0, y: 100 },
      ],
    }

    const geometry = createProfileGeometry(profile, contour.height, { contour, axisX: 10 })
    const position = geometry.getAttribute('position')
    const actualContourKink = Array.from({ length: position.count }, (_, index) =>
      Math.abs(position.getX(index)) < 1e-5 && Math.abs(position.getY(index) + 30) < 1e-5,
    ).some(Boolean)

    expect(geometry.boundingBox?.min.y).toBeCloseTo(-36.2, 5)
    expect(actualContourKink).toBe(false)
    geometry.dispose()
  })
})
