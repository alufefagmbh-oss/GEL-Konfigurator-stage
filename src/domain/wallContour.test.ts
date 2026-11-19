import { describe, expect, it } from 'vitest'
import { assertVerticallyMonotoneWallContour, getWallEdgeCutLine, getWallVerticalBounds, insetWallContourVertically } from './wallContour'
import type { WallContour } from './types'

const slopedContour: WallContour = {
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

describe('wall contour vertical bounds', () => {
  it('interpolates sloped floor and ceiling edges at a profile position', () => {
    expect(getWallVerticalBounds(slopedContour, 50)).toEqual({ bottom: 2.5, top: 107.5 })
  })

  it('insets both wall boundaries by the selected gap without changing its width', () => {
    const inset = insetWallContourVertically(slopedContour, 10)

    expect(inset.width).toBe(slopedContour.width)
    expect(getWallVerticalBounds(inset, 50)).toEqual({ bottom: 12.5, top: 97.5 })
    expect(getWallVerticalBounds(inset, 150)).toEqual({ bottom: 17.5, top: 92.5 })
  })

  it('rejects a vertical gap that leaves no positive wall height', () => {
    expect(() => insetWallContourVertically(slopedContour, 55)).toThrow('zu niedrig')
  })

  it('accepts a wall with multiple connected floor and ceiling segments', () => {
    const segmentedContour: WallContour = {
      ...slopedContour,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 20 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
        { x: 0, y: 100 },
      ],
    }

    expect(getWallVerticalBounds(segmentedContour, 100)).toEqual({ bottom: 20, top: 100 })
    expect(() => assertVerticallyMonotoneWallContour(segmentedContour)).not.toThrow()
  })

  it('chooses the longest contour segment overlapping the profile width', () => {
    const segmentedContour: WallContour = {
      name: 'segmented-wall.dxf',
      width: 100,
      height: 200,
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 10 },
        { x: 100, y: 50 },
        { x: 100, y: 200 },
        { x: 0, y: 200 },
      ],
    }

    const line = getWallEdgeCutLine(segmentedContour, 30, 70, 'bottom')
    expect(line.leftHeight).toBeCloseTo(10 / 3, 8)
    expect(line.rightHeight).toBeCloseTo(30, 8)
    expect(line.slope).toBeCloseTo(2 / 3, 8)
    expect(line.isKinked).toBe(true)
  })

  it('rejects contours with multiple vertical spans', () => {
    const notchedContour: WallContour = {
      name: 'notched-wall.dxf',
      width: 100,
      height: 100,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 70, y: 100 },
        { x: 70, y: 40 },
        { x: 30, y: 40 },
        { x: 30, y: 100 },
        { x: 0, y: 100 },
      ],
    }

    expect(() => assertVerticallyMonotoneWallContour(notchedContour)).toThrow('genau eine Boden- und eine Deckenkante')
  })
})
