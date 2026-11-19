import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseGel2001 } from '../dxf/parseGel2001'
import { GEL2001_PROFILE } from '../dxf/gel2001Profile'
import { calculateSlabContour } from './concreteSlab'
import { calculateProfileParts, maximumFixingSpacing, maximumProfileOffset, profileCenterlineLength, profilePoint, profileStockLength, sideFixingHeadInsetDistance, sideFixingNutOffset, sideFixingWallBounds } from './railingProfile'
import { DEFAULT_STATIC_ASSUMPTIONS } from './staticAssumptions'
import { maximumSideFixingSpacing, SIDE_FIXING_AXIS_HEIGHT, SIDE_FIXING_BOLT_HEAD_DIAMETER, SIDE_FIXING_BOLT_HEAD_HEIGHT, SIDE_FIXING_BOLT_HEAD_INSET, SIDE_FIXING_HOLE_DIAMETER, SIDE_FIXING_NUT_CLEARANCE, STEEL_PLATE_HEIGHT, STEEL_PLATE_MARGIN, STEEL_PLATE_THICKNESS } from './railingMounting'

const section = parseGel2001(readFileSync(join('public', 'GEL2001.dxf'), 'utf8'))

describe('Montagefall 7B', () => {
  it('uses the supplied profile with closed gaps and preserved dimensions', () => {
    expect(GEL2001_PROFILE).toHaveLength(section.length)
    section.forEach((point, index) => {
      expect(GEL2001_PROFILE[index].x).toBeCloseTo(point.x, 10)
      expect(GEL2001_PROFILE[index].y).toBeCloseTo(point.y, 10)
    })

    expect(section.length).toBeGreaterThan(20)
    expect(Math.max(...section.map((p) => p.x))).toBeCloseTo(53.01, 1)
    expect(Math.max(...section.map((p) => p.y))).toBeCloseTo(135, 1)
    expect(section.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))).toBe(false)
  })

  it.each([60, 90, 120, 180, 225, 270, 315])('joins the profile pieces at the %i° miter', (angle) => {
    const contour = calculateSlabContour([{ length: 3000, angle: 180 }, { length: 2500, angle }], 500)
    expect(contour.error).toBeNull()
    const parts = calculateProfileParts(contour.dimensions!, section, 25, DEFAULT_STATIC_ASSUMPTIONS)
    expect(parts).toHaveLength(2)
    for (const point of section) {
      const end = profilePoint(parts[0], point, true)
      const start = profilePoint(parts[1], point, false)
      expect(end.x).toBeCloseTo(start.x, 6)
      expect(end.y).toBeCloseTo(start.y, 6)
    }
    const edge = profilePoint(parts[0], { x: 0, y: 0 }, false)
    expect(edge.x).toBeCloseTo(0)
    expect(edge.y).toBeCloseTo(225)
  })

  it('rejects invalid offsets and profiles too short for the miter', () => {
    const contour = calculateSlabContour([{ length: 3000, angle: 180 }, { length: 2500, angle: 90 }], 500)
    expect(() => calculateProfileParts(contour.dimensions!, section, -1, DEFAULT_STATIC_ASSUMPTIONS)).toThrow()
    expect(() => calculateProfileParts(contour.dimensions!, section, 4000, DEFAULT_STATIC_ASSUMPTIONS)).toThrow()
  })

  it.each([
    [{ location: 'inside', usage: 'private' }, 320],
    [{ location: 'outside', usage: 'private' }, 175],
    [{ location: 'inside', usage: 'public' }, 160],
    [{ location: 'outside', usage: 'public' }, 110],
  ] as const)('distributes holes with maximum spacing %i', (assumptions, maximum) => {
    const contour = calculateSlabContour([{ length: 3000, angle: 180 }], 500)
    const part = calculateProfileParts(contour.dimensions!, section, 0, assumptions)[0]
    expect(maximumFixingSpacing(assumptions)).toBe(maximum)
    const start = profilePoint(part, { x: 53.007020552083 / 2, y: 0 }, false)
    const end = profilePoint(part, { x: 53.007020552083 / 2, y: 0 }, true)
    expect(Math.hypot(part.holes[0].x - start.x, part.holes[0].y - start.y)).toBeCloseTo(50)
    expect(Math.hypot(part.holes.at(-1)!.x - end.x, part.holes.at(-1)!.y - end.y)).toBeCloseTo(50)
    for (let i = 1; i < part.holes.length; i++) {
      expect(Math.hypot(part.holes[i].x - part.holes[i - 1].x, part.holes[i].y - part.holes[i - 1].y)).toBeLessThanOrEqual(maximum)
    }
    expect(part.holes.length).toBe(Math.ceil(2900 / maximum) + 1)
  })

  it('handles a single centered hole at exactly 100 mm and rejects shorter pieces', () => {
    const dimensions = (length: number) => calculateSlabContour([{ length, angle: 180 }], 500).dimensions!
    expect(calculateProfileParts(dimensions(100), section, 0, DEFAULT_STATIC_ASSUMPTIONS)[0].holes).toHaveLength(1)
    expect(() => calculateProfileParts(dimensions(99), section, 0, DEFAULT_STATIC_ASSUMPTIONS)).toThrow('zu kurz')
  })

  it.each([90, 270])('places end holes 50 mm from the %i° miter on the centerline', (angle) => {
    const contour = calculateSlabContour([{ length: 3000, angle: 180 }, { length: 2500, angle }], 500)
    const parts = calculateProfileParts(contour.dimensions!, section, 25, DEFAULT_STATIC_ASSUMPTIONS)
    const width = Math.max(...section.map((point) => point.x))
    for (const part of parts) {
      const start = profilePoint(part, { x: width / 2, y: 0 }, false)
      const end = profilePoint(part, { x: width / 2, y: 0 }, true)
      expect(Math.hypot(part.holes[0].x - start.x, part.holes[0].y - start.y)).toBeCloseTo(50)
      expect(Math.hypot(part.holes.at(-1)!.x - end.x, part.holes.at(-1)!.y - end.y)).toBeCloseTo(50)
    }
  })

  it('sums the profile centerlines including offset and miter effects', () => {
    const single = calculateSlabContour([{ length: 3000, angle: 180 }], 500)
    expect(profileCenterlineLength(calculateProfileParts(single.dimensions!, section, 0, DEFAULT_STATIC_ASSUMPTIONS))).toBeCloseTo(3000)
    for (const [angle, sign] of [[90, -1], [270, 1]] as const) {
      const contour = calculateSlabContour([{ length: 3000, angle: 180 }, { length: 2500, angle }], 500)
      const parts = calculateProfileParts(contour.dimensions!, section, 25, DEFAULT_STATIC_ASSUMPTIONS)
      const width = Math.max(...section.map((point) => point.x))
      expect(profileCenterlineLength(parts)).toBeCloseTo(5500 + sign * 2 * (25 + width / 2))
    }
    expect(profileCenterlineLength([])).toBe(0)
  })

  it.each([[4000, [4000]], [4000.1, [3900.1, 100]], [8000, [4000, 4000]], [8050, [4000, 3950, 100]], [12000, [4000, 4000, 4000]]] as const)(
    'splits a straight %i mm profile into stock lengths %s', (length, expected) => {
      const contour = calculateSlabContour([{ length, angle: 180 }], 500)
      const parts = calculateProfileParts(contour.dimensions!, section, 0, DEFAULT_STATIC_ASSUMPTIONS)
      expect(parts).toHaveLength(expected.length)
      parts.forEach((part, i) => {
        expect(profileStockLength(part)).toBeCloseTo(expected[i], 6)
        const start = profilePoint(part, { x: 53.007020552083 / 2, y: 0 }, false)
        const end = profilePoint(part, { x: 53.007020552083 / 2, y: 0 }, true)
        expect(Math.hypot(part.holes[0].x - start.x, part.holes[0].y - start.y)).toBeCloseTo(50)
        expect(Math.hypot(part.holes.at(-1)!.x - end.x, part.holes.at(-1)!.y - end.y)).toBeCloseTo(50)
        if (i > 0) for (const point of section) {
          expect(profilePoint(parts[i - 1], point, true).x).toBeCloseTo(profilePoint(part, point, false).x, 6)
          expect(profilePoint(parts[i - 1], point, true).y).toBeCloseTo(profilePoint(part, point, false).y, 6)
        }
      })
      expect(profileCenterlineLength(parts)).toBeCloseTo(length)
    },
  )

  it.each([90, 270])('respects stock length and keeps joints on %i° miters', (angle) => {
    const contour = calculateSlabContour([{ length: 6000, angle: 180 }, { length: 6000, angle }], 500)
    const parts = calculateProfileParts(contour.dimensions!, section, 100, DEFAULT_STATIC_ASSUMPTIONS)
    expect(parts).toHaveLength(4)
    for (const part of parts) expect(profileStockLength(part)).toBeLessThanOrEqual(4000 + 1e-7)
    for (const point of section) {
      const end = profilePoint(parts[1], point, true)
      const start = profilePoint(parts[2], point, false)
      expect(end.x).toBeCloseTo(start.x, 6)
      expect(end.y).toBeCloseTo(start.y, 6)
    }
  })

  it('limits the edge distance by the actual profile width', () => {
    expect(maximumProfileOffset(500, section)).toBeCloseTo(500 - 53.007020552083)
    expect(maximumProfileOffset(40, section)).toBeLessThan(0)
  })
})

describe('Montagefall 7A', () => {
  it.each([
    [{ location: 'inside', usage: 'private' }, 740],
    [{ location: 'outside', usage: 'private' }, 400],
    [{ location: 'inside', usage: 'public' }, 370],
    [{ location: 'outside', usage: 'public' }, 270],
  ] as const)('uses the table spacing %i for side fixings', (assumptions, maximum) => {
    const contour = calculateSlabContour([{ length: 3000, angle: 180 }], STEEL_PLATE_THICKNESS)
    const width = Math.max(...section.map((point) => point.x))
    const part = calculateProfileParts(contour.dimensions!, section, -width, assumptions, '7A')[0]
    const face = profilePoint(part, { x: width, y: 0 }, false)
    expect(maximumSideFixingSpacing(assumptions)).toBe(maximum)
    expect(Math.hypot(part.holes[0].x - face.x, part.holes[0].y - face.y)).toBeCloseTo(50)
    expect(Math.abs(part.holes[0].y - face.y)).toBeCloseTo(0)
    for (let index = 1; index < part.holes.length; index += 1) {
      expect(Math.hypot(part.holes[index].x - part.holes[index - 1].x, part.holes[index].y - part.holes[index - 1].y)).toBeLessThanOrEqual(maximum)
    }
    expect(part.holes.length).toBe(Math.ceil(2900 / maximum) + 1)
  })

  it('uses the DXF screw axis and the fixed steel plate dimensions', () => {
    expect(SIDE_FIXING_AXIS_HEIGHT).toBeCloseTo(61.009450501442, 10)
    expect(SIDE_FIXING_HOLE_DIAMETER).toBe(11)
    expect(STEEL_PLATE_HEIGHT).toBe(195)
    expect(STEEL_PLATE_MARGIN).toBe(30)
  })

  it('seats the 25 by 5 mm domed head at the inside face with a 12.7 mm inset', () => {
    const wall = sideFixingWallBounds(section)
    expect(SIDE_FIXING_BOLT_HEAD_DIAMETER).toBe(25)
    expect(SIDE_FIXING_BOLT_HEAD_HEIGHT).toBe(5)
    expect(wall.outer - wall.inner + SIDE_FIXING_BOLT_HEAD_HEIGHT).toBeCloseTo(SIDE_FIXING_BOLT_HEAD_INSET, 1)
  })

  it('positions the nut beyond the outer face of the steel plate', () => {
    const wall = sideFixingWallBounds(section)
    expect(sideFixingHeadInsetDistance(section)).toBeCloseTo(wall.outer - wall.inner)
    expect(sideFixingNutOffset(section) - sideFixingHeadInsetDistance(section))
      .toBe(STEEL_PLATE_THICKNESS + SIDE_FIXING_NUT_CLEARANCE)
  })
})
