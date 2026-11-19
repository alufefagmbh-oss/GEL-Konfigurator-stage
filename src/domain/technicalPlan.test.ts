import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { calculateFacadeLayout } from './facadeLayout'
import { createTechnicalPlanGeometry, selectTechnicalPlanScale } from './technicalPlan'
import { DEFAULT_MASONRY_VIEW } from './masonryView'
import { calculateUkRailPlacements } from './ukRail'
import type { ProfileDefinition, WallContour } from './types'
import { parseUkRailDxf } from '../dxf/parseUkRailDxf'
import {
  calculateTechnicalPlanViewLayout,
  createTechnicalPlanPdf,
  createTechnicalPlanSheetSvg,
  getTechnicalPlanPositionNumbers,
  mapRightProjectionPoint,
  mapTopProjectionPoint,
} from '../pdf/createTechnicalPlanPdf'

const profile: ProfileDefinition = {
  name: 'Testprofil',
  source: 'example',
  width: 40,
  depth: 30,
  contours: [],
}
const backgroundImage = `data:image/png;base64,${readFileSync(
  new URL('../../public/linarte-konfigurator-logo.png', import.meta.url),
).toString('base64')}`

function createLayout(width: number, height: number, selectedProfile = profile) {
  const layout = calculateFacadeLayout({ width, height, profile: selectedProfile })
  if (!layout.isValid) throw new Error(layout.error)
  return layout
}

describe('technical plan geometry', () => {
  it('matches plan position numbers to the cut-list groups for profiles and substructure parts', () => {
    const width = 3000
    const height = 2500
    const layout = createLayout(width, height)
    const placements = layout.positions.map((axisX, layoutIndex) => ({
      axisX,
      profile,
      layoutIndex,
      isSwitchProfile: false,
    }))
    const numbers = getTechnicalPlanPositionNumbers({
      configuration: { width, height, endGap: 10, profile, ukRailView: { enabled: true } },
      layout,
      wallContour: null,
      placements,
      projectName: 'Positionsnummern',
      ukRailProfile: parseUkRailDxf(readFileSync(
        new URL('../../public/genUK-Schiene.dxf', import.meta.url),
        'utf8',
      )),
      ukRailPlacements: [
        { startX: 10, endX: 610, centerHeight: 125 },
        { startX: 610, endX: 1510, centerHeight: 125 },
      ],
      ukMountingData: {
        mountingMethod: 'direct-to-wall',
        holeDiameter: 10,
        plasticBlockDepth: 10,
        squareTimbers: [],
        fixings: [{ x: 310, centerHeight: 125 }],
        angleProfile: null,
        anglePlacements: [],
        connectorPlacements: [],
        connectorBounds: null,
        connectorLength: null,
        supportRailProfile: null,
        supportRailPieces: [],
        directMountClearance: 0,
        remainingWallClearance: 0,
      },
    })

    expect(new Set(numbers.profiles).size).toBe(1)
    expect(numbers.rails).toEqual([2, 3])
    expect(numbers.plasticBlocks).toBe(4)
  })

  it('prints cut-list position numbers on the facade elevation', () => {
    const width = 3000
    const height = 2500
    const layout = createLayout(width, height)
    const placements = layout.positions.map((axisX, layoutIndex) => ({
      axisX,
      profile,
      layoutIndex,
      isSwitchProfile: false,
    }))
    const options = {
      configuration: { width, height, endGap: 10, profile, ukRailView: { enabled: true } },
      layout,
      wallContour: null,
      placements,
      projectName: 'Positionsnummern',
      ukRailProfile: parseUkRailDxf(readFileSync(
        new URL('../../public/genUK-Schiene.dxf', import.meta.url),
        'utf8',
      )),
      ukRailPlacements: [{ startX: 10, endX: 1510, centerHeight: 125 }],
      ukMountingData: {
        mountingMethod: 'direct-to-wall' as const,
        holeDiameter: 10,
        plasticBlockDepth: 10,
        squareTimbers: [],
        fixings: [{ x: 310, centerHeight: 125 }],
        angleProfile: null,
        anglePlacements: [],
        connectorPlacements: [],
        connectorBounds: null,
        connectorLength: null,
        supportRailProfile: null,
        supportRailPieces: [],
        directMountClearance: 0,
        remainingWallClearance: 0,
      },
    }
    const pdf = createTechnicalPlanPdf(options, backgroundImage)
    const content = Buffer.from(pdf).toString('latin1')
    const streamStart = content.indexOf('stream\n') + 'stream\n'.length
    const streamEnd = content.indexOf('endstream', streamStart)
    const pageDrawing = inflateSync(Buffer.from(content.slice(streamStart, streamEnd), 'latin1')).toString('latin1')

    expect(pageDrawing).toContain('(001)')
    expect(pageDrawing).toContain('(002)')
    expect(pageDrawing).toContain('(003)')
  })

  it('selects the largest standard scale that fits the drawing area', () => {
    expect(selectTechnicalPlanScale(2400, 1200)).toBe(10)
    expect(selectTechnicalPlanScale(3000, 2500)).toBe(20)
    expect(selectTechnicalPlanScale(12000, 8000)).toBe(100)
    expect(selectTechnicalPlanScale(30000, 20000)).toBe(200)
    expect(selectTechnicalPlanScale(3000, 2500, 280, 125, 1200)).toBe(50)
  })

  it('shows the configured clearance between facade bounds and profile lengths', () => {
    const layout = createLayout(160, 100)
    const drawing = createTechnicalPlanGeometry({
      configuration: { width: 160, height: 100, endGap: 10, profile },
      layout,
      wallContour: null,
    })

    expect(drawing.profileOutlines[0]).toEqual([
      { x: -80, y: -40 },
      { x: -40, y: -40 },
      { x: -40, y: 40 },
      { x: -80, y: 40 },
    ])
  })

  it('rejects invalid scale inputs', () => {
    expect(() => selectTechnicalPlanScale(0, 1200)).toThrow('positive endliche')
  })

  it('creates a vector elevation rectangle and one outline per profile', () => {
    const layout = createLayout(160, 100)
    const drawing = createTechnicalPlanGeometry({
      configuration: { width: 160, height: 100, endGap: 0, profile },
      layout,
      wallContour: null,
    })

    expect(drawing.wallOutline).toEqual([
      { x: -80, y: -50 },
      { x: 80, y: -50 },
      { x: 80, y: 50 },
      { x: -80, y: 50 },
    ])
    expect(drawing.profileOutlines).toHaveLength(layout.profileCount)
    expect(drawing.profileOutlines[0]).toEqual([
      { x: -80, y: -50 },
      { x: -40, y: -50 },
      { x: -40, y: 50 },
      { x: -80, y: 50 },
    ])
  })

  it('derives each profile end from the sloped wall boundary', () => {
    const wallContour: WallContour = {
      name: 'Schräge Wand',
      width: 100,
      height: 100,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 50, y: 80 },
        { x: 0, y: 100 },
      ],
    }
    const profileWithOneInterval = { ...profile, width: 40 }
    const layout = createLayout(100, 100, profileWithOneInterval)
    const drawing = createTechnicalPlanGeometry({
      configuration: { width: 100, height: 100, endGap: 0, profile: profileWithOneInterval },
      layout,
      wallContour,
    })
    const middleProfile = drawing.profileOutlines[1]

    expect(middleProfile).toEqual([
      { x: 10, y: -50 },
      { x: 50, y: -50 },
      { x: 50, y: 50 },
      { x: 10, y: 34 },
    ])
  })

  it('projects profile sections and enabled masonry into the orthogonal views', () => {
    const layout = createLayout(160, 100)
    const drawing = createTechnicalPlanGeometry({
      configuration: {
        width: 160,
        height: 100,
        endGap: 0,
        profile,
        masonryView: { ...DEFAULT_MASONRY_VIEW, enabled: true },
      },
      layout,
      wallContour: null,
    })

    expect(drawing.profileProjections[0].sections[0]).toEqual([
      { x: -80, y: 0 },
      { x: -40, y: 0 },
      { x: -40, y: 30 },
      { x: -80, y: 30 },
    ])
    expect(drawing.masonryProjections).toHaveLength(1)
    expect(drawing.depthBounds).toEqual({ minimum: 0, maximum: 400 })
    expect(drawing.scaleDenominator).toBe(20)
  })

  it('places the right-side view left and the top view below the front in first-angle projection', () => {
    const layout = createLayout(3000, 2500)
    const geometry = createTechnicalPlanGeometry({
      configuration: { width: 3000, height: 2500, endGap: 0, profile },
      layout,
      wallContour: null,
    })
    const views = calculateTechnicalPlanViewLayout(geometry)
    const frontLeft = views.frontCenterX - geometry.facadeWidth / views.scale / 2
    const frontBottom = views.frontCenterY + geometry.facadeHeight / views.scale / 2
    const viewDepth = (geometry.depthBounds.maximum - geometry.depthBounds.minimum) / views.scale

    expect(views.rightViewRightX).toBeLessThan(frontLeft)
    expect(views.rightViewRightX).toBeCloseTo(frontLeft - 16)
    expect(views.topViewFrontY).toBeGreaterThan(frontBottom)
    expect(views.topViewBackY).toBeCloseTo(frontBottom + 16)
    expect(views.topViewFrontY - views.topViewBackY).toBeCloseTo(viewDepth)
    expect(views.topViewFrontY + 6).toBeGreaterThanOrEqual(240)
    expect(views.topViewFrontY + 6).toBeLessThanOrEqual(252)
    expect(geometry.facadeWidth / views.scale).toBeGreaterThan(geometry.facadeWidth / geometry.scaleDenominator)
  })

  it('projects the facade front to the left edge of the right view and the bottom of the plan view', () => {
    const layout = createLayout(3000, 2500)
    const geometry = createTechnicalPlanGeometry({
      configuration: { width: 3000, height: 2500, endGap: 0, profile },
      layout,
      wallContour: null,
    })
    const rightViewFront = mapRightProjectionPoint({ x: 0, y: 1250 }, geometry)
    const rightViewBack = mapRightProjectionPoint({ x: 30, y: 1250 }, geometry)
    const topViewFront = mapTopProjectionPoint({ x: 1500, y: 0 }, geometry)
    const topViewBack = mapTopProjectionPoint({ x: 1500, y: 30 }, geometry)

    expect(rightViewFront.x).toBeLessThan(rightViewBack.x)
    expect(topViewFront.y).toBeGreaterThan(topViewBack.y)
  })

  it('follows a sloped wall contour for the projected masonry add-ons', () => {
    const wallContour: WallContour = {
      name: 'Schräge Wand',
      width: 100,
      height: 100,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 50, y: 80 },
        { x: 0, y: 100 },
      ],
    }
    const masonryView = {
      ...DEFAULT_MASONRY_VIEW,
      enabled: true,
      topEnabled: true,
      topHeight: 10,
      sideEnabled: true,
      sideWidth: 5,
      bottomEnabled: true,
      bottomWallHeight: 10,
    }
    const layout = createLayout(100, 100)
    const drawing = createTechnicalPlanGeometry({
      configuration: { width: 100, height: 100, endGap: 0, profile, masonryView },
      layout,
      wallContour,
    })

    expect(drawing.masonryProjections[1].outline).toContainEqual({ x: 0, y: 30 })
    expect(drawing.masonryProjections[1].outline).toContainEqual({ x: 0, y: 60 })
    expect(drawing.masonryProjections[2].outline).toContainEqual({ x: -55, y: 50 })
    expect(drawing.masonryProjections[4].outline).toContainEqual({ x: 0, y: -60 })
  })

  it('requires a valid automatic profile layout', () => {
    const invalidLayout = calculateFacadeLayout({ width: 65, height: 100, profile })

    expect(() => createTechnicalPlanGeometry({
      configuration: { width: 65, height: 100, endGap: 0, profile },
      layout: invalidLayout,
      wallContour: null,
    })).toThrow('gültige Profilanordnung')
  })

  it('creates a framed A3 PDF and Arial labels for three projection views', () => {
    const width = 3000
    const height = 2500
    const layout = createLayout(width, height)
    const options = {
      configuration: { width, height, endGap: 10, profile },
      layout,
      wallContour: null,
      projectName: 'Neue Fassade',
      date: new Date(2026, 9, 15),
    }
    const sheet = createTechnicalPlanSheetSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>', options)
    const pdf = createTechnicalPlanPdf(options, backgroundImage)
    const content = Buffer.from(pdf).toString('latin1')
    const mediaBox = content.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)
    const streamStart = content.indexOf('stream\n') + 'stream\n'.length
    const streamEnd = content.indexOf('endstream', streamStart)
    const pageDrawing = inflateSync(Buffer.from(content.slice(streamStart, streamEnd), 'latin1')).toString('latin1')
    const labelCoordinates = [...sheet.matchAll(/<text x="([\d.]+)" y="([\d.]+)"/g)]
      .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }))

    expect(content.startsWith('%PDF-')).toBe(true)
    expect(mediaBox).not.toBeNull()
    expect(Number(mediaBox?.[1])).toBeCloseTo(1190.55, 2)
    expect(Number(mediaBox?.[2])).toBeCloseTo(841.89, 2)
    expect(sheet).toContain('font-family="Arial, sans-serif"')
    expect(sheet).toContain('Vorderansicht')
    expect(sheet).toContain('Rechtsansicht')
    expect(sheet).toContain('Draufsicht')
    expect(sheet).toContain('3.000 mm')
    expect(sheet).toContain('2.500 mm')
    expect(sheet).toContain('Neue Fassade')
    expect(sheet).toContain('Testprofil')
    expect(sheet).toContain('15.10.2026')
    expect(labelCoordinates.length).toBeGreaterThan(0)
    for (const { x, y } of labelCoordinates) {
      expect(x).toBeGreaterThanOrEqual(56.69)
      expect(x).toBeLessThanOrEqual(1162.2)
      expect(y).toBeGreaterThanOrEqual(28.35)
      expect(y).toBeLessThanOrEqual(813.55)
    }
    expect(pageDrawing).toContain('0.2 w')
    expect(pageDrawing).toContain('0.25 w')
    expect(pageDrawing).not.toMatch(/\n[fF]\n/)
  })

  it('includes the UK rail in the technical plan and reports its piece count', () => {
    const width = 3000
    const height = 2500
    const layout = createLayout(width, height)
    const ukRailProfile = parseUkRailDxf(readFileSync(
      new URL('../../public/genUK-Schiene.dxf', import.meta.url),
      'utf8',
    ))
    const configuration = {
      width,
      height,
      endGap: 10,
      profile,
      ukRailView: { enabled: true },
    }
    const ukRailPlacements = calculateUkRailPlacements(width, height, ukRailProfile, null)
    const options = {
      configuration,
      layout,
      wallContour: null,
      projectName: 'UK-Test',
      ukRailProfile,
      ukRailPlacements,
    }
    const sheet = createTechnicalPlanSheetSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>', options)
    const pdf = createTechnicalPlanPdf(options, backgroundImage)

    expect(ukRailPlacements).toHaveLength(3)
    expect(sheet).toContain('UK-Schiene: 3 Teilstücke')
    expect(Buffer.from(pdf).toString('latin1')).toContain('%PDF-')
  })
})
