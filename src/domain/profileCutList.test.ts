import { describe, expect, it } from 'vitest'
import { createProfileCutList } from './profileCutList'
import type { FacadeConfiguration, FacadeLayout, WallContour } from './types'

const profile = {
  name: 'Testprofil',
  source: 'standard' as const,
  width: 40,
  depth: 20,
  contours: [],
}

function createInput(wallContour: WallContour | null): {
  configuration: FacadeConfiguration
  layout: FacadeLayout
  wallContour: WallContour | null
} {
  return {
    configuration: { width: 100, height: 200, endGap: 0, profileColor: '#ffffff', profile },
    layout: {
      isValid: true,
      error: '',
      dimensionsValid: true,
      profileCount: 1,
      axisSpacing: 0,
      minimumSpacing: 0,
      maximumSpacing: 0,
      nominalSpacing: 60,
      spacings: [],
      spacingDeviations: [],
      adjustedSpacingCount: 0,
      totalCorrection: 0,
      rightEdgeDeviation: 0,
      method: 'nominal',
      positions: [0],
    },
    wallContour,
  }
}

describe('profile cut list', () => {
  it('reports straight square cuts and facade height without a wall contour', () => {
    const [row] = createProfileCutList(createInput(null))
    expect(row).toMatchObject({
      number: 1,
      axisPosition: 50,
      centerLength: 200,
      shortPointLength: 200,
      longPointLength: 200,
      bottomAngle: 0,
      topAngle: 0,
      note: '',
    })
  })

  it('uses a 10 mm default gap at both ends when no value is configured', () => {
    const input = createInput(null)
    delete input.configuration.endGap
    const [row] = createProfileCutList(input)

    expect(row.centerLength).toBe(180)
    expect(row.shortPointLength).toBe(180)
    expect(row.longPointLength).toBe(180)
  })

  it('shortens both ends by the configured gap for a wall contour', () => {
    const wallContour: WallContour = {
      name: 'Steigende Kante',
      width: 100,
      height: 200,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 20 },
        { x: 100, y: 180 },
        { x: 0, y: 200 },
      ],
    }
    const input = createInput(wallContour)
    input.configuration.endGap = 10
    const [row] = createProfileCutList(input)

    expect(row.centerLength).toBeCloseTo(160, 8)
    expect(row.shortPointLength).toBeCloseTo(152, 8)
    expect(row.longPointLength).toBeCloseTo(168, 8)
  })

  it('calculates signed saw mitres and point-to-point lengths for sloped edges', () => {
    const wallContour: WallContour = {
      name: 'Steigende Kante',
      width: 100,
      height: 200,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 20 },
        { x: 100, y: 180 },
        { x: 0, y: 200 },
      ],
    }
    const [row] = createProfileCutList(createInput(wallContour))
    expect(row.bottomAngle).toBeCloseTo(11.31, 2)
    expect(row.topAngle).toBeCloseTo(-11.31, 2)
    expect(row.centerLength).toBeCloseTo(180, 8)
    expect(row.shortPointLength).toBeCloseTo(172, 8)
    expect(row.longPointLength).toBeCloseTo(188, 8)
  })

  it('measures short and long points at matching profile-width edges', () => {
    const wallContour: WallContour = {
      name: 'Parallele steigende Kanten',
      width: 100,
      height: 220,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 20 },
        { x: 100, y: 220 },
        { x: 0, y: 200 },
      ],
    }
    const [row] = createProfileCutList(createInput(wallContour))
    expect(row.centerLength).toBeCloseTo(200, 8)
    expect(row.shortPointLength).toBeCloseTo(200, 8)
    expect(row.longPointLength).toBeCloseTo(200, 8)
  })

  it('uses the longest wall-edge segment across the profile width for the mitre', () => {
    const wallContour: WallContour = {
      name: 'Knick',
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
    const [row] = createProfileCutList(createInput(wallContour))
    expect(row.bottomAngle).toBeCloseTo(Math.atan(2 / 3) * 180 / Math.PI, 8)
    expect(row.centerLength).toBeCloseTo(183.3333333333, 8)
    expect(row.shortPointLength).toBeCloseTo(170, 8)
    expect(row.longPointLength).toBeCloseTo(196.6666666667, 8)
    expect(row.note).toContain('längster Konturabschnitt')
  })

  it('rejects an invalid profile layout', () => {
    const input = createInput(null)
    input.layout.isValid = false
    expect(() => createProfileCutList(input)).toThrow('gültige Profilanordnung')
  })
})
