import { describe, expect, it } from 'vitest'
import { getWallVerticalBounds } from './wallContour'
import { DEFAULT_MASONRY_VIEW } from './masonryView'
import {
  calculateDirectMountClearance,
  calculateUkAngleConnectorPlacements,
  calculateUkAnglePlacements,
  calculateUkRailFixings,
  ensureUkRailAngleSupport,
  getUkPlasticBlockDepth,
  getUkRailHoleDiameter,
  getUkAngleProfileContours,
  getUkAngleConnectorMaximumSpacing,
  getUkAngleConnectorFrontContactDepth,
  getUkAnglePositions,
} from './ukMounting'
import type { FacadeConfiguration, UkAnglePlacement, UkAngleProfile, UkRailPlacement, UkRailProfile } from './types'

const railProfile: UkRailProfile = {
  name: 'test rail',
  contours: [],
  height: 60,
  depth: 18.5,
  screwHeadPlaneDepth: 15,
  profileSideDepth: 0,
  centerAxisHeight: 0,
}

const angleProfile: UkAngleProfile = {
  name: 'test angle',
  contours: [],
  width: 50,
  depth: 40,
  centerAxisX: 0,
}

function makeAngles(positions: number[]): UkAnglePlacement[] {
  return positions.map((centerX) => ({ centerX, startHeight: 5, endHeight: 1925 }))
}

describe('UK second mounting level', () => {
  it('defaults direct-mount holes to 13 mm and sizes the block to the wall clearance', () => {
    const configuration: FacadeConfiguration = {
      width: 3000,
      height: 2500,
      profileColor: '#ffffff',
      profile: {
        name: 'test profile',
        source: 'standard',
        width: 40,
        depth: 20,
        contours: [],
      },
      masonryView: { ...DEFAULT_MASONRY_VIEW, enabled: false, facadeOffset: 200 },
      ukRailView: { enabled: true },
    }
    const facadeProfileDepth = 50
    const expectedDepth = calculateDirectMountClearance(configuration, railProfile, facadeProfileDepth)

    expect(getUkRailHoleDiameter(configuration)).toBe(13)
    expect(expectedDepth).toBe(124)
    expect(getUkPlasticBlockDepth(configuration, railProfile, facadeProfileDepth)).toBe(expectedDepth)
    expect(getUkPlasticBlockDepth({
      ...configuration,
      ukRailView: { enabled: true, plasticBlockDepth: 30 },
    }, railProfile, facadeProfileDepth)).toBe(30)
  })

  it('keeps angle positions within 150 mm of the ends and at most 800 mm apart', () => {
    const positions = getUkAnglePositions(3450)
    expect(positions[0]).toBe(150)
    expect(positions.at(-1)).toBe(3300)
    expect(positions.slice(1).every((position, index) => position - positions[index] <= 800)).toBe(true)
  })

  it('distributes wall connectors evenly along every angle with no more than the configured spacing', () => {
    const angles = [
      { centerX: 150, startHeight: 20, endHeight: 1980 },
      { centerX: 950, startHeight: 120, endHeight: 1780 },
    ]
    const placements = calculateUkAngleConnectorPlacements(
      angles,
      600,
      { minX: 0, maxX: 116, minZ: -114, maxZ: 114 },
      50,
    )
    const firstAnglePlacements = placements.filter((placement) => placement.centerX === 150)
    const secondAnglePlacements = placements.filter((placement) => placement.centerX === 950)

    expect(firstAnglePlacements).toHaveLength(4)
    expect(secondAnglePlacements).toHaveLength(3)
    expect(firstAnglePlacements[0].centerHeight).toBe(334)
    expect(firstAnglePlacements.at(-1)?.centerHeight).toBe(1666)
    for (const [group, start, end] of [
      [firstAnglePlacements, 20, 1980],
      [secondAnglePlacements, 120, 1780],
    ] as const) {
      expect(group[0].centerHeight - 114 - start).toBe(200)
      expect(end - (group.at(-1)!.centerHeight + 114)).toBe(200)
      expect(group.slice(1).every((placement, index) =>
        placement.centerHeight - group[index].centerHeight <= 600,
      )).toBe(true)
      expect(group.every((placement) => placement.frontContactDepth === 50)).toBe(true)
    }
  })

  it('rejects connector geometry taller than an angle', () => {
    expect(() => calculateUkAngleConnectorPlacements(
      [{ centerX: 250, startHeight: 10, endHeight: 200 }],
      600,
      { minX: 0, maxX: 116, minZ: -114, maxZ: 114 },
      50,
    )).toThrow(/kürzer als das Maueranschlussteil/)
  })

  it('keeps connectors when the connector is long relative to the angle position', () => {
    const bounds = { minX: 0, maxX: 116, minZ: -114, maxZ: 114 }
    expect(calculateUkAngleConnectorPlacements(
      [{ centerX: 250, startHeight: 0, endHeight: 1000 }],
      600,
      bounds,
      90,
    ).length).toBeGreaterThan(0)
  })

  it('finds the L-angle front surface in the CAD depth coordinates', () => {
    const profile: UkAngleProfile = {
      ...angleProfile,
      contours: [{
        area: 100,
        points: [{ x: 0, y: 12 }, { x: 50, y: 12 }, { x: 50, y: 40 }],
      }],
    }
    expect(getUkAngleConnectorFrontContactDepth(profile, 36.1, railProfile)).toBe(74.1)
    expect(() => getUkAngleConnectorFrontContactDepth(angleProfile, 36.1, railProfile))
      .toThrow(/enthält keine Punkte/)
  })

  it('defaults the maximum connector spacing to 600 mm', () => {
    expect(getUkAngleConnectorMaximumSpacing({
      width: 1000,
      height: 1000,
      profileColor: '#ffffff',
      profile: { name: 'test', source: 'standard', width: 40, depth: 20, contours: [] },
      ukRailView: { enabled: true },
    })).toBe(600)
  })

  it('rejects widths that cannot fit two edge angles', () => {
    expect(() => getUkAnglePositions(300)).toThrow(/größer als 300 mm/)
  })

  it('sizes each angle from the local facade contour with the required end clearances', () => {
    const wall = {
      name: 'sloped wall',
      width: 1000,
      height: 2000,
      points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 2000 }, { x: 0, y: 1800 }],
    }
    const placements = calculateUkAnglePlacements(1000, 2000, wall)
    expect(placements[0].startHeight).toBe(20)
    expect(placements[0].endHeight).toBe(1810)
    expect(placements.at(-1)?.endHeight).toBe(1950)
  })

  it('sizes each angle from the lower and upper wall clearances at its position', () => {
    const wall = {
      name: 'sloped lower wall edge',
      width: 1000,
      height: 2000,
      points: [{ x: 0, y: 0 }, { x: 1000, y: 500 }, { x: 1000, y: 2000 }, { x: 0, y: 2000 }],
    }
    const placements = calculateUkAnglePlacements(1000, 2000, wall)

    expect(placements[0].startHeight).toBeCloseTo(95)
    expect(placements.at(-1)?.startHeight).toBeCloseTo(445)
    for (const angle of placements) {
      const bounds = getWallVerticalBounds(wall, angle.centerX)
      expect(angle.startHeight).toBeCloseTo(bounds.bottom + 20)
      expect(angle.endHeight).toBeCloseTo(bounds.top - 20)
    }
  })

  it('keeps angles 10 mm inside profiles when the facade end gap is customized', () => {
    const placements = calculateUkAnglePlacements(1000, 2000, null, undefined, 15)

    expect(placements[0].startHeight).toBe(25)
    expect(placements[0].endHeight).toBe(1975)
  })

  it('mirrors angle placements from the facade centerline to the right', () => {
    const placements = calculateUkAnglePlacements(1450, 2000, null)
    expect(placements.map(({ centerX, mirrored }) => [centerX, mirrored])).toEqual([
      [150, false],
      [725, true],
      [1300, true],
    ])
  })

  it('mirrors each DXF profile around its center axis without changing the source', () => {
    const profile = {
      ...angleProfile,
      contours: [{
        points: [{ x: -40, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 40 }],
        area: 1000,
      }],
    }
    const mirrored = getUkAngleProfileContours(profile, true)[0]
    expect(mirrored.points).toEqual([
      { x: -10, y: 40 },
      { x: -10, y: 0 },
      { x: 40, y: 0 },
    ])
    expect(profile.contours[0].points[0].x).toBe(-40)
  })

  it('places fixings 50 mm from rail ends with no more than 800 mm between them', () => {
    const fixings = calculateUkRailFixings([{ startX: 100, endX: 1950, centerHeight: 800 }])
    expect(fixings[0].x).toBe(150)
    expect(fixings.at(-1)?.x).toBe(1900)
    expect(fixings.every((fixing) => fixing.centerHeight === 800)).toBe(true)
    expect(fixings.slice(1).every((fixing, index) => fixing.x - fixings[index].x <= 800)).toBe(true)
  })

  it('requires 150 mm of rail for two fixing holes 50 mm from the ends', () => {
    expect(() => calculateUkRailFixings([{ startX: 0, endX: 149, centerHeight: 300 }]))
      .toThrow(/150 mm/)
    expect(calculateUkRailFixings([{ startX: 0, endX: 150, centerHeight: 300 }])).toEqual([
      { x: 50, centerHeight: 300 },
      { x: 100, centerHeight: 300 },
    ])
  })

  it('extends a rail to the nearest two angles before changing angle spacing', () => {
    const rail: UkRailPlacement = { startX: 350, endX: 400, centerHeight: 500 }
    const result = ensureUkRailAngleSupport(2000, 2000, null, railProfile, angleProfile, [rail])

    expect(result.anglePlacements).toHaveLength(4)
    expect(result.railPlacements[0].startX).toBe(150)
    expect(result.railPlacements[0].endX).toBeCloseTo(716.6666667)
  })

  it('adds local angle supports when rail extension would collide with another rail', () => {
    const rails: UkRailPlacement[] = [
      { startX: 500, endX: 600, centerHeight: 500 },
      { startX: 700, endX: 1200, centerHeight: 550 },
    ]
    const defaultAngles = makeAngles(getUkAnglePositions(4000))

    expect(defaultAngles).toHaveLength(6)
    const result = ensureUkRailAngleSupport(4000, 2000, null, railProfile, angleProfile, rails)
    expect(result.anglePlacements.length).toBeGreaterThan(defaultAngles.length)
    expect(result.railPlacements[0]).toEqual(rails[0])
    for (const rail of result.railPlacements) {
      const supports = result.anglePlacements.filter((angle) =>
        Math.min(rail.endX, angle.centerX + angleProfile.width / 2)
          - Math.max(rail.startX, angle.centerX - angleProfile.width / 2) >= 10 - 1e-7
        && angle.startHeight <= rail.centerHeight + railProfile.height / 2
        && angle.endHeight >= rail.centerHeight - railProfile.height / 2,
      )
      expect(supports.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps extended rails inside a sloped facade contour', () => {
    const wall = {
      name: 'sloped facade',
      width: 1000,
      height: 2000,
      points: [{ x: 0, y: 0 }, { x: 1000, y: 600 }, { x: 1000, y: 2000 }, { x: 0, y: 2000 }],
    }
    const rail: UkRailPlacement = { startX: 700, endX: 800, centerHeight: 520 }
    const result = ensureUkRailAngleSupport(1000, 2000, wall, railProfile, angleProfile, [rail])

    expect(result.railPlacements).toHaveLength(1)
    for (const x of [result.railPlacements[0].startX, result.railPlacements[0].endX, 800]) {
      const bounds = getWallVerticalBounds(wall, x)
      expect(result.railPlacements[0].centerHeight - railProfile.height / 2)
        .toBeGreaterThanOrEqual(bounds.bottom - 1e-7)
      expect(result.railPlacements[0].centerHeight + railProfile.height / 2)
        .toBeLessThanOrEqual(bounds.top + 1e-7)
    }
  })

  it('adds two local supports for a short rail trapped between adjacent rails', () => {
    const rails: UkRailPlacement[] = [
      { startX: 1312.86, endX: 1964.29, centerHeight: 533.39 },
      { startX: 1964.29, endX: 2062.43, centerHeight: 528.38 },
      { startX: 2062.43, endX: 3032.70, centerHeight: 523.38 },
    ]
    const result = ensureUkRailAngleSupport(
      3447.22,
      2410.37,
      null,
      railProfile,
      angleProfile,
      rails,
    )

    expect(result.railPlacements[1]).toEqual(rails[1])
    const shortRailSupports = result.anglePlacements.filter((angle) =>
      Math.min(rails[1].endX, angle.centerX + angleProfile.width / 2)
        - Math.max(rails[1].startX, angle.centerX - angleProfile.width / 2) >= 10 - 1e-7
      && angle.startHeight <= rails[1].centerHeight + railProfile.height / 2
      && angle.endHeight >= rails[1].centerHeight - railProfile.height / 2,
    )
    expect(shortRailSupports.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the reported thirteen-piece layout instead of dropping all rails', () => {
    const rails: UkRailPlacement[] = [
      { startX: 10, endX: 811.43, centerHeight: 829.91 },
      { startX: 10, endX: 661.43, centerHeight: 1906.24 },
      { startX: 661.43, endX: 1462.86, centerHeight: 681.65 },
      { startX: 661.43, endX: 3437.22, centerHeight: 1211.23 },
      { startX: 661.43, endX: 1312.86, centerHeight: 1903.69 },
      { startX: 1312.86, endX: 1964.29, centerHeight: 533.39 },
      { startX: 1312.86, endX: 3032.70, centerHeight: 1901.13 },
      { startX: 1964.29, endX: 2062.43, centerHeight: 528.38 },
      { startX: 2062.43, endX: 3032.70, centerHeight: 523.38 },
      { startX: 2882.70, endX: 3309.96, centerHeight: 348.38 },
      { startX: 2882.70, endX: 3309.96, centerHeight: 2049.10 },
      { startX: 3159.96, endX: 3437.22, centerHeight: 238.67 },
      { startX: 3159.96, endX: 3437.22, centerHeight: 2197.07 },
    ]
    const result = ensureUkRailAngleSupport(
      3447.22,
      2410.37,
      null,
      railProfile,
      angleProfile,
      rails,
    )

    expect(result.railPlacements).toHaveLength(rails.length)
    for (const rail of result.railPlacements) {
      const supports = result.anglePlacements.filter((angle) =>
        Math.min(rail.endX, angle.centerX + angleProfile.width / 2)
          - Math.max(rail.startX, angle.centerX - angleProfile.width / 2) >= 10 - 1e-7
        && angle.startHeight <= rail.centerHeight + railProfile.height / 2
        && angle.endHeight >= rail.centerHeight - railProfile.height / 2,
      )
      expect(supports.length).toBeGreaterThanOrEqual(2)
    }
  })
})
