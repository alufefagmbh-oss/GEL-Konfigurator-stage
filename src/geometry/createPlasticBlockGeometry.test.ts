import { describe, expect, it } from 'vitest'
import { createPlasticBlockGeometry } from './createPlasticBlockGeometry'

describe('plastic mounting block geometry', () => {
  it('creates a 60 × 60 mm block with depth centered on the rail fixing axis', () => {
    const geometry = createPlasticBlockGeometry(10, 12)
    geometry.computeBoundingBox()
    expect(geometry.boundingBox?.min.toArray()).toEqual([-30, -30, -5])
    expect(geometry.boundingBox?.max.toArray()).toEqual([30, 30, 5])
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0)
    geometry.dispose()
  })

  it('rejects holes that cannot fit inside the block', () => {
    expect(() => createPlasticBlockGeometry(10, 60)).toThrow(/kleiner als 60 mm/)
  })
})
