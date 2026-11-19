import { describe, expect, it } from 'vitest'
import { createUkAngleGeometry } from './createUkAngleGeometry'
import type { UkAngleProfile } from '../domain/types'

const profile: UkAngleProfile = {
  name: 'asymmetric test angle',
  contours: [{
    points: [
      { x: -40, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 40 },
      { x: -40, y: 40 },
    ],
    area: 2000,
  }],
  width: 50,
  depth: 40,
  centerAxisX: 0,
}

describe('createUkAngleGeometry', () => {
  it('mirrors the angle profile around its axis when requested', () => {
    const original = createUkAngleGeometry(profile, 100)
    const mirrored = createUkAngleGeometry(profile, 100, true)
    original.computeBoundingBox()
    mirrored.computeBoundingBox()

    expect(original.boundingBox?.min.x).toBe(-40)
    expect(original.boundingBox?.max.x).toBe(10)
    expect(mirrored.boundingBox?.min.x).toBe(-10)
    expect(mirrored.boundingBox?.max.x).toBe(40)

    original.dispose()
    mirrored.dispose()
  })
})
