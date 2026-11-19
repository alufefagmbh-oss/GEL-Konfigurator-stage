import { describe, expect, it } from 'vitest'
import { createDirectMountScrewGeometry } from './createDirectMountScrewGeometry'
import {
  DIRECT_MOUNT_SCREW_HEAD_DIAMETER_MM,
  DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM,
  DIRECT_MOUNT_SCREW_SHAFT_DIAMETER_MM,
  DIRECT_MOUNT_SCREW_SHAFT_LENGTH_MM,
} from '../domain/directMountScrew'

describe('direct-mount screw geometry', () => {
  it('generates the specified head and shaft dimensions with the head seat at the origin', () => {
    const screw = createDirectMountScrewGeometry()

    expect(screw.boundingBox?.min.z).toBeCloseTo(-93.5)
    expect(screw.boundingBox?.max.z).toBeCloseTo(0)
    expect(screw.boundingBox?.min.x).toBeCloseTo(-9.25)
    expect(screw.boundingBox?.max.x).toBeCloseTo(9.25)
    expect(screw.boundingBox?.min.y).toBeCloseTo(-9.25)
    expect(screw.boundingBox?.max.y).toBeCloseTo(9.25)
    expect(DIRECT_MOUNT_SCREW_HEAD_DIAMETER_MM).toBe(18.5)
    expect(DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM).toBe(8.5)
    expect(DIRECT_MOUNT_SCREW_SHAFT_DIAMETER_MM).toBe(10)
    expect(DIRECT_MOUNT_SCREW_SHAFT_LENGTH_MM).toBe(85)

    const positions = screw.getAttribute('position')
    let shaftRadius = 0
    for (let index = 0; index < positions.count; index += 1) {
      if (positions.getZ(index) < -DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM - 1e-6) {
        shaftRadius = Math.max(
          shaftRadius,
          Math.hypot(positions.getX(index), positions.getY(index)),
        )
      }
    }
    expect(shaftRadius).toBeCloseTo(DIRECT_MOUNT_SCREW_SHAFT_DIAMETER_MM / 2)

    screw.dispose()
  })
})
