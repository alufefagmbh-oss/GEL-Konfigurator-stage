import { describe, expect, it } from 'vitest'
import { getSpidiConnectorTransforms } from './spidiConnector'

describe('Spidi wall connector transforms', () => {
  it('points the local X axis toward the wall and seats its flat X-max face on the wall plane', () => {
    const transforms = getSpidiConnectorTransforms(
      { centerX: 500, centerHeight: 600, frontContactDepth: 62 },
      { minX: 0, maxX: 116, minY: -50, maxY: 81, minZ: -114, maxZ: 114 },
      200,
      3000,
      2500,
    )

    expect(transforms.cad).toEqual([
      0, -1, 0, 477.5,
      1, 0, 0, 84,
      0, 0, 1, 600,
    ])
    const [a11, a12, a13, a14, a21, a22, a23, a24, a31, a32, a33, a34] = transforms.cad
    expect([
      a11 * 1 + a12 * 0 + a13 * 0,
      a21 * 1 + a22 * 0 + a23 * 0,
      a31 * 1 + a32 * 0 + a33 * 0,
    ]).toEqual([0, 1, 0])
    expect(a21 * 116 + a24).toBe(200)
    expect(a14 - 15.5 + 38).toBe(500)
    expect(a34).toBe(600)
    expect(transforms.viewer[3]).toBe(-1022.5)
    expect(transforms.viewer[7]).toBe(-650)
    expect(transforms.viewer[11]).toBe(-84)
  })

  it('moves the connector with the wall distance and keeps CAD and viewer consistent', () => {
    const bounds = { minX: 0, maxX: 116, minY: -50, maxY: 81, minZ: -114, maxZ: 114 }
    const placement = { centerX: 500, centerHeight: 600, frontContactDepth: 62 }
    const transforms = getSpidiConnectorTransforms(placement, bounds, 150, 3000, 2500, -36.1)
    expect(transforms.cad[7]).toBe(34)
    expect(transforms.viewer[11]).toBeCloseTo(-(34 - 36.1), 10)
  })
})
