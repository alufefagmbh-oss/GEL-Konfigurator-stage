import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseUkRailDxf } from '../dxf/parseUkRailDxf'
import {
  calculateUkRailPlacements,
  UK_RAIL_MINIMUM_PIECE_LENGTH,
  UK_RAIL_MAXIMUM_PIECE_LENGTH,
  UK_RAIL_MAXIMUM_SPACING,
} from './ukRail'
import { getWallVerticalBounds } from './wallContour'
import type { WallContour } from './types'

const source = readFileSync(new URL('../../public/genUK-Schiene.dxf', import.meta.url), 'utf8')
const profile = parseUkRailDxf(source)

function expectNoOverlappingRailCollisions(placements: ReturnType<typeof calculateUkRailPlacements>) {
  for (let firstIndex = 0; firstIndex < placements.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < placements.length; secondIndex += 1) {
      const first = placements[firstIndex]
      const second = placements[secondIndex]
      const overlap = Math.min(first.endX, second.endX) - Math.max(first.startX, second.startX)
      if (overlap > 0 && first.centerHeight !== second.centerHeight) {
        expect(Math.abs(first.centerHeight - second.centerHeight)).toBeGreaterThanOrEqual(profile.height)
      }
    }
  }
}

function expectRailClearances(
  width: number,
  height: number,
  contour: WallContour | null,
  placements: ReturnType<typeof calculateUkRailPlacements>,
) {
  const wall: WallContour = contour ?? {
    name: 'Fassade',
    width,
    height,
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
  }
  const vertices = [...new Set(wall.points.map((point) => point.x))]
    .filter((x) => x >= 5 && x <= width - 5)
    .sort((first, second) => first - second)
  const sampleXs = [...new Set([
    5,
    width - 5,
    ...vertices,
    ...vertices.slice(1).map((x, index) => (vertices[index] + x) / 2),
  ])]

  for (const x of sampleXs) {
    const levels = [...new Set(placements
      .filter((rail) => rail.startX <= x + 1e-7 && rail.endX >= x - 1e-7)
      .map((rail) => rail.centerHeight))]
      .sort((first, second) => first - second)
    const bounds = getWallVerticalBounds(wall, x)
    expect(levels.length).toBeGreaterThanOrEqual(2)
    expect(levels[0] - bounds.bottom).toBeGreaterThanOrEqual(125 - 1e-7)
    expect(levels[0] - bounds.bottom).toBeLessThanOrEqual(300 + 1e-7)
    expect(bounds.top - levels.at(-1)!).toBeGreaterThanOrEqual(60 - 1e-7)
    expect(bounds.top - levels.at(-1)!).toBeLessThanOrEqual(300 + 1e-7)
    expect(levels.slice(1).every((level, index) =>
      level - levels[index] <= UK_RAIL_MAXIMUM_SPACING + 1e-7,
    )).toBe(true)
  }
}

describe('UK rail DXF profile', () => {
  it('uses the marked profile side and center axis from their DXF layers', () => {
    expect(profile.depth).toBeCloseTo(18.5)
    expect(profile.height).toBeCloseTo(60)
    expect(profile.profileSideDepth).toBe(0)
    expect(profile.centerAxisHeight).toBe(0)
    expect(Math.min(...profile.contours[0].points.map((point) => point.x))).toBe(0)
    expect(Math.max(...profile.contours[0].points.map((point) => point.x))).toBeCloseTo(18.5)
    expect(Math.min(...profile.contours[0].points.map((point) => point.y))).toBeCloseTo(-30)
    expect(Math.max(...profile.contours[0].points.map((point) => point.y))).toBeCloseTo(30)
  })
})

describe('UK rail positioning', () => {
  it('uses at least two horizontal rails and respects the limits on a rectangular facade', () => {
    const placements = calculateUkRailPlacements(3000, 2500, profile, null)
    const levels = [...new Set(placements.map((placement) => placement.centerHeight))]

    expect(placements.every((placement) => placement.startX === 5 && placement.endX === 2995)).toBe(true)
    expect(levels.length).toBeGreaterThanOrEqual(2)
    expect(levels[0]).toBeGreaterThanOrEqual(125)
    expect(levels[0]).toBeLessThanOrEqual(300)
    expect(2500 - levels.at(-1)!).toBeGreaterThanOrEqual(60)
    expect(2500 - levels.at(-1)!).toBeLessThanOrEqual(300)
    expect(levels.slice(1).every((level, index) => level - levels[index] <= UK_RAIL_MAXIMUM_SPACING)).toBe(true)
    expectRailClearances(3000, 2500, null, placements)
  })

  it('keeps the lowest rail 30 mm above the support rail when one is present', () => {
    const supportRail = { height: 105, referenceOffset: 10, margin: 30 }
    const [first] = calculateUkRailPlacements(3000, 2500, profile, null, supportRail)
    // Oberkante Auflager-Schiene 115 mm, plus 30 mm Abstand, plus halbe Schienenhöhe
    expect(first.centerHeight).toBeCloseTo(115 + 30 + 30, 6)
    const [withoutSupport] = calculateUkRailPlacements(3000, 2500, profile, null)
    expect(withoutSupport.centerHeight).toBeCloseTo(125, 6)
  })

  it('steps the rails when a sloped lower edge no longer allows one horizontal run', () => {
    const contour: WallContour = {
      name: 'Schräge Fassade',
      width: 1000,
      height: 2500,
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 300 },
        { x: 1000, y: 2500 },
        { x: 0, y: 2500 },
      ],
    }
    const placements = calculateUkRailPlacements(1000, 2500, profile, contour)
    const lowerRails = placements.filter((placement) => placement.centerHeight < 800)

    expectNoOverlappingRailCollisions(placements)
    expectRailClearances(1000, 2500, contour, placements)
    expect(lowerRails.length).toBeGreaterThanOrEqual(2)
    expect(lowerRails.some((rail) => rail.startX === 5 && rail.endX === 995)).toBe(false)

    const middleRail = placements.find((rail) =>
      rail.startX === 5 && rail.endX === 995 && rail.centerHeight < 2200,
    )
    expect(middleRail).toBeDefined()
  })

  it('keeps rails continuous when the required height offset is below 150 mm', () => {
    const contour: WallContour = {
      name: 'Leicht schräge Unterkante',
      width: 1000,
      height: 2500,
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 149 },
        { x: 1000, y: 2500 },
        { x: 0, y: 2500 },
      ],
    }
    const placements = calculateUkRailPlacements(1000, 2500, profile, contour)
    const lowerRails = placements.filter((placement) => placement.centerHeight < 500)

    expect(lowerRails).toHaveLength(1)
    expect(lowerRails[0].startX).toBe(5)
    expect(lowerRails[0].endX).toBe(995)
    expectNoOverlappingRailCollisions(placements)
    expectRailClearances(1000, 2500, contour, placements)
  })

  it('steps rails when no continuous level can satisfy both bottom clearances', () => {
    const contour: WallContour = {
      name: 'Stärker schräge Unterkante',
      width: 1000,
      height: 2500,
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 300 },
        { x: 1000, y: 2500 },
        { x: 0, y: 2500 },
      ],
    }
    const placements = calculateUkRailPlacements(1000, 2500, profile, contour)
    const lowerRails = placements.filter((placement) => placement.centerHeight < 800)

    expect(lowerRails).toHaveLength(2)
    expect(Math.abs(lowerRails[0].centerHeight - lowerRails[1].centerHeight)).toBeGreaterThanOrEqual(profile.height)
    expect(lowerRails.some((rail) => rail.startX === 5 && rail.endX === 995)).toBe(false)
    expectNoOverlappingRailCollisions(placements)
  })

  it('keeps the upper clearance and maximum axis spacing valid across stepped bands', () => {
    const contour: WallContour = {
      name: 'Schräge Oberkante',
      width: 1000,
      height: 2500,
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 2320 },
        { x: 0, y: 2500 },
      ],
    }

    const placements = calculateUkRailPlacements(1000, 2500, profile, contour)
    expectNoOverlappingRailCollisions(placements)
    for (const midpoint of [255, 745]) {
      const levels = placements
        .filter((placement) => placement.startX <= midpoint && placement.endX >= midpoint)
        .map((placement) => placement.centerHeight)
        .sort((a, b) => a - b)
      expect(levels.length).toBeGreaterThanOrEqual(2)
      expect(levels.slice(1).every((level, index) => level - levels[index] <= UK_RAIL_MAXIMUM_SPACING)).toBe(true)
      const bottom = 0
      const top = 2500 - (midpoint / 1000) * 180
      expect(levels[0] - bottom).toBeGreaterThanOrEqual(125)
      expect(levels[0] - bottom).toBeLessThanOrEqual(300)
      expect(top - levels.at(-1)!).toBeGreaterThanOrEqual(60)
      expect(top - levels.at(-1)!).toBeLessThanOrEqual(300)
    }
  })

  it('avoids rail collisions across a range of sloped lower and upper facade edges', () => {
    for (const slope of [126, 130, 180, 251, 377, 620, 900]) {
      const lowerSlope: WallContour = {
        name: 'Schräge Unterkante',
        width: 2000,
        height: 3500,
        points: [
          { x: 0, y: 0 },
          { x: 2000, y: slope },
          { x: 2000, y: 3500 },
          { x: 0, y: 3500 },
        ],
      }
      const upperSlope: WallContour = {
        name: 'Schräge Oberkante',
        width: 2000,
        height: 3500,
        points: [
          { x: 0, y: 0 },
          { x: 2000, y: 0 },
          { x: 2000, y: 3500 - slope },
          { x: 0, y: 3500 },
        ],
      }

      const lowerRails = calculateUkRailPlacements(2000, 3500, profile, lowerSlope)
      const upperRails = calculateUkRailPlacements(2000, 3500, profile, upperSlope)
      expectNoOverlappingRailCollisions(lowerRails)
      expectNoOverlappingRailCollisions(upperRails)
      expectRailClearances(2000, 3500, lowerSlope, lowerRails)
      expectRailClearances(2000, 3500, upperSlope, upperRails)
    }
  })

  it('removes colliding step overlaps on an irregular facade contour', () => {
    const contour: WallContour = {
      name: 'Unregelmäßig schräge Fassade',
      width: 6000,
      height: 3500,
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 330 },
        { x: 2200, y: 370 },
        { x: 3600, y: 720 },
        { x: 4800, y: 880 },
        { x: 6000, y: 1050 },
        { x: 6000, y: 3300 },
        { x: 4800, y: 3320 },
        { x: 3600, y: 3500 },
        { x: 2200, y: 3400 },
        { x: 1000, y: 3490 },
        { x: 0, y: 3500 },
      ],
    }
    const placements = calculateUkRailPlacements(6000, 3500, profile, contour)

    expectNoOverlappingRailCollisions(placements)
    expectRailClearances(6000, 3500, contour, placements)
    expect(placements.every(({ startX, endX }) =>
      endX - startX >= UK_RAIL_MINIMUM_PIECE_LENGTH - 1e-7,
    )).toBe(true)
  })

  it('splits overlong rails into butt-jointed pieces no longer than six metres', () => {
    const placements = calculateUkRailPlacements(13000, 2500, profile, null)
    const level = placements[0].centerHeight
    const pieces = placements.filter((placement) => placement.centerHeight === level)

    expect(pieces.length).toBe(3)
    expect(pieces[0].startX).toBe(5)
    expect(pieces.at(-1)?.endX).toBe(12995)
    expect(pieces.every((piece) => piece.endX - piece.startX <= UK_RAIL_MAXIMUM_PIECE_LENGTH)).toBe(true)
    expect(pieces[0].endX).toBe(pieces[1].startX)
    expect(pieces[1].endX).toBe(pieces[2].startX)
  })

  it('keeps step overlaps within the facade end insets', () => {
    const contour: WallContour = {
      name: 'Schräge Fassade',
      width: 1000,
      height: 2500,
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 300 },
        { x: 1000, y: 2500 },
        { x: 0, y: 2500 },
      ],
    }
    const placements = calculateUkRailPlacements(1000, 2500, profile, contour)

    expect(placements.every((placement) => placement.startX >= 5 && placement.endX <= 995)).toBe(true)
  })

  it('rejects facade widths that cannot retain the required five millimetre end insets', () => {
    expect(() => calculateUkRailPlacements(10, 2500, profile, null)).toThrow('größer als 10 mm')
  })
})
