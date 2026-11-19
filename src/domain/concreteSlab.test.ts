import { describe, expect, it } from 'vitest'
import { calculateSlabContour, parseSlabAngle, parseSlabDimension } from './concreteSlab'
import type { SlabSegment } from './concreteSlab'

describe('parseSlabDimension', () => {
  it('accepts dimensions in the supported range, including decimals and boundaries', () => {
    expect(parseSlabDimension('1')).toBe(1)
    expect(parseSlabDimension('3000.5')).toBe(3000.5)
    expect(parseSlabDimension('100000')).toBe(100000)
  })

  describe('parseSlabAngle', () => {
    it('accepts interior angles between zero and 360 degrees', () => {
      expect(parseSlabAngle('90')).toBe(90)
      expect(parseSlabAngle('180')).toBe(180)
      expect(parseSlabAngle('270')).toBe(270)
      expect(parseSlabAngle('359.9')).toBe(359.9)
      for (const value of ['', '0', '-1', '360', '361', 'Infinity']) expect(parseSlabAngle(value)).toBeNull()
    })
  })

  describe('calculateSlabContour', () => {
    const first: SlabSegment = { length: 3000, angle: 180 }
    const corner: SlabSegment = { length: 3000, angle: 90 }

    it('creates a rectangle at the requested dimensions', () => {
      expect(calculateSlabContour([first], 2000).points).toEqual([
        { x: 0, y: 1000 }, { x: 3000, y: 1000 },
        { x: 3000, y: -1000 }, { x: 0, y: -1000 },
      ])
    })

    it('uses the exterior lengths at a right-hand bend', () => {
      const result = calculateSlabContour([first, corner], 500)
      expect(result.error).toBeNull()
      expect(result.dimensions).not.toBeNull()
      const dimensions = result.dimensions!
      expect(dimensions[0].start).toEqual({ x: 0, y: 250 })
      expect(dimensions[0].end.x).toBeCloseTo(3000)
      expect(dimensions[1].end.y).toBeCloseTo(-2750)
      expect(dimensions[1].angle).toBe(90)
      for (const dimension of dimensions) {
        expect(Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y)).toBeCloseTo(dimension.length)
      }
    })

    it('supports straight, acute and multiple right-hand bends with measured exterior edges', () => {
      expect(calculateSlabContour([first, { ...corner, angle: 180 }], 500).error).toBeNull()
      expect(calculateSlabContour([first, { ...corner, angle: 60 }], 500).error).toBeNull()
      const result = calculateSlabContour([first, { ...corner, angle: 120 }, { ...corner, angle: 60 }], 500)
      expect(result.error).toBeNull()
      result.dimensions!.forEach((dimension) => {
        expect(Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y)).toBeCloseTo(dimension.length)
      })
      expect(result.dimensions!.map((dimension) => dimension.angle)).toEqual([null, 120, 60])
    })

    it.each([181, 225, 270, 315])('creates an inside corner at %i° and preserves entered lengths', (angle) => {
      const result = calculateSlabContour([first, { ...corner, angle }], 500)
      expect(result.error).toBeNull()
      expect(result.dimensions![1].angle).toBe(angle)
      for (const dimension of result.dimensions!) {
        expect(Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y)).toBeCloseTo(dimension.length)
      }
      expect(result.dimensions![1].end.y).toBeGreaterThan(result.dimensions![1].start.y)
    })

    it('preserves lengths at alternating inside and outside corners', () => {
      const result = calculateSlabContour([first, { ...corner, angle: 270 }, { ...corner, angle: 90 }], 500)
      expect(result.error).toBeNull()
      expect(result.dimensions!.map((dimension) => dimension.angle)).toEqual([null, 270, 90])
      for (const dimension of result.dimensions!) {
        expect(Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y)).toBeCloseTo(dimension.length)
      }
    })

    it('rejects degenerate and nearly reversed bends', () => {
      for (const angle of [0, 360, 360.001]) {
        expect(calculateSlabContour([first, { ...corner, angle }], 500).error).not.toBeNull()
      }
      expect(calculateSlabContour([first, { ...corner, angle: 359.999999 }], 500).error).toMatch(/zu nahe/)
    })

    it('rejects segments too short to produce a valid inner edge', () => {
      expect(calculateSlabContour([{ ...first, length: 1500 }, corner], 2000).error).toMatch(/zu kurz/)
    })

    it('rejects crossing or touching contours', () => {
      const segments = [first, corner, corner, corner, corner]
      expect(calculateSlabContour(segments, 500).error).toMatch(/überschneidet oder berührt/)
    })

    it('rejects invalid domain inputs', () => {
      expect(calculateSlabContour([], 500).error).not.toBeNull()
      expect(calculateSlabContour([first], 0).error).not.toBeNull()
      expect(calculateSlabContour([first, { ...corner, angle: 0 }], 500).error).not.toBeNull()
    })
  })

  it('rejects empty, non-finite and out-of-range values', () => {
    for (const value of ['', ' ', '0', '-1', '100001', 'Infinity', 'abc']) {
      expect(parseSlabDimension(value)).toBeNull()
    }
  })
})
