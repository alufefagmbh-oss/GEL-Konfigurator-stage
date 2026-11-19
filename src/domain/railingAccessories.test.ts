import { describe, expect, it } from 'vitest'
import { calculateSlabContour } from './concreteSlab'
import { calculateGlassPanels, calculateRailingAccessories, CLAMP_WEDGE_END_OFFSET, CLAMP_WEDGE_LENGTH, DEFAULT_GLASS_PANEL_GAP, DEFAULT_MAX_GLASS_PANEL_WIDTH, GEL2001_CLAMP_WEDGES, GEL2001_GLASS_SHOE, GLASS_BOTTOM_HEIGHT, GLASS_CENTER_X, GLASS_GAP, GLASS_HEIGHT, GLASS_PANE_THICKNESS, GLASS_SHOE_END_OFFSET, GLASS_SHOE_LENGTH, MAX_CLAMP_WEDGE_GAP, MAX_GLASS_SHOE_GAP } from './railingAccessories'
import { profilePoint } from './railingProfile'
import { GEL2001_PROFILE } from '../dxf/gel2001Profile'

describe('GEL2001-Zubehör', () => {
  it('uses the simplified shoe and corrected clamp-wedge profiles from the supplied contour', () => {
    const points = GEL2001_CLAMP_WEDGES.flat()
    expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(95.51845, 4)
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(110.69367, 4)
    expect(GEL2001_GLASS_SHOE).toHaveLength(65)
    expect(Math.min(...GEL2001_GLASS_SHOE.map((point) => point.x))).toBeCloseTo(9.18631, 4)
    expect(Math.max(...GEL2001_GLASS_SHOE.map((point) => point.x))).toBeCloseTo(43.82773, 4)
  })

  it('places Glasschuhe at 30 mm end distance with at most 300 mm clear gaps and cuts the last Klemmkeil to fit', () => {
    const dimensions = calculateSlabContour([{ length: 3000, angle: 180 }], 500).dimensions!
    const layout = calculateRailingAccessories(dimensions, 0, GEL2001_PROFILE)
    const center = Math.max(...GEL2001_PROFILE.map((point) => point.x)) / 2
    const positions = (parts: typeof layout.clampWedges) => parts
        .map((part) => {
          const start = profilePoint(part, { x: center, y: 0 }, false)
          const end = profilePoint(part, { x: center, y: 0 }, true)
          return { start: start.x, end: end.x }
        })
        .sort((a, b) => a.start - b.start)
    const shoes = positions(layout.glassShoes)
    expect(shoes).toHaveLength(9)
    expect(shoes[0].start).toBeCloseTo(GLASS_SHOE_END_OFFSET, 5)
    expect(3000 - shoes.at(-1)!.end).toBeCloseTo(GLASS_SHOE_END_OFFSET, 5)
    for (const shoe of shoes) expect(shoe.end - shoe.start).toBeCloseTo(GLASS_SHOE_LENGTH, 5)
    for (let index = 1; index < shoes.length; index += 1) {
      expect(shoes[index].start - shoes[index - 1].end).toBeLessThanOrEqual(MAX_GLASS_SHOE_GAP)
    }

    const clampWedges = positions(layout.clampWedges.filter((part) => part.section === layout.clampWedges[0].section))
    expect(clampWedges[0].start).toBeCloseTo(CLAMP_WEDGE_END_OFFSET, 5)
    expect(3000 - clampWedges.at(-1)!.end).toBeCloseTo(CLAMP_WEDGE_END_OFFSET, 5)
    for (let index = 1; index < clampWedges.length; index += 1) {
      expect(clampWedges[index].start - clampWedges[index - 1].end).toBeCloseTo(MAX_CLAMP_WEDGE_GAP, 5)
    }
    expect(clampWedges.at(-1)!.end - clampWedges.at(-1)!.start).toBeLessThanOrEqual(CLAMP_WEDGE_LENGTH)
    expect(clampWedges.at(-1)!.end - clampWedges.at(-1)!.start).toBeGreaterThan(0)
  })

  it('splits the glass into equal panels no wider than the configured maximum', () => {
    const dimensions = calculateSlabContour([{ length: 3000, angle: 180 }], 500).dimensions!
    const panels = calculateGlassPanels(dimensions, 0, GEL2001_PROFILE)
    expect(panels).toHaveLength(6)
    const panes = panels.filter((_, index) => index % 2 === 0)
    expect(panes[0].width).toBeCloseTo(panes[1].width, 8)
    expect(panes[1].width).toBeCloseTo(panes[2].width, 8)
    expect(panes[0].width).toBeLessThanOrEqual(DEFAULT_MAX_GLASS_PANEL_WIDTH)
    for (const pane of panes) {
      expect(pane.thickness).toBe(GLASS_PANE_THICKNESS)
      expect(pane.bottom).toBeCloseTo(16.051625, 6)
      expect(pane.top).toBe(GLASS_HEIGHT)
    }
    expect(GLASS_BOTTOM_HEIGHT).toBeCloseTo(30.051625 - 14, 6)
    const centers = panes.map((pane) => ({
      start: profilePoint(pane.path, { x: 26.328247, y: 0 }, false),
      end: profilePoint(pane.path, { x: 26.328247, y: 0 }, true),
    }))
    for (let index = 1; index < centers.length; index += 1) {
      expect(centers[index].start.x - centers[index - 1].end.x).toBeCloseTo(DEFAULT_GLASS_PANEL_GAP, 5)
    }
    expect(panels[1].center - panels[0].center - panels[0].thickness).toBeCloseTo(GLASS_GAP, 6)
  })

  it('uses the configured panel width and allows a zero panel gap', () => {
    const dimensions = calculateSlabContour([{ length: 3000, angle: 180 }], 500).dimensions!
    const panels = calculateGlassPanels(dimensions, 0, GEL2001_PROFILE, GLASS_HEIGHT, GLASS_PANE_THICKNESS, 1000, 0)
    const panes = panels.filter((_, index) => index % 2 === 0)
    expect(panes).toHaveLength(3)
    expect(panes[0].width).toBeCloseTo(1000, 5)
    expect(panes[1].width).toBeCloseTo(panes[0].width, 5)
    expect(panes[2].width).toBeCloseTo(panes[0].width, 5)
    expect(() => calculateGlassPanels(dimensions, 0, GEL2001_PROFILE, GLASS_HEIGHT, GLASS_PANE_THICKNESS, 100, 2000)).toThrow('Scheibenspalt')
  })

  it.each([90, 120, 240, 270])('uses square butt joints without overlap at a %i° corner', (angle) => {
    const dimensions = calculateSlabContour([{ length: 3000, angle: 180 }, { length: 2500, angle }], 500).dimensions!
    const panels = calculateGlassPanels(dimensions, 25, GEL2001_PROFILE, GLASS_HEIGHT, 10, 1250, 5)
    const first = panels.filter((panel) => Math.abs(panel.path.direction.x - 1) < 1e-8)
    const second = panels.filter((panel) => Math.abs(panel.path.direction.x - 1) >= 1e-8)
    const previous = first.at(-1)!
    const next = second[0]
    for (const panel of panels) {
      const { direction, startMiter, endMiter } = panel.path
      expect(startMiter.x * direction.x + startMiter.y * direction.y).toBeCloseTo(0, 8)
      expect(endMiter.x * direction.x + endMiter.y * direction.y).toBeCloseTo(0, 8)
      expect(panel.width).toBeLessThanOrEqual(1250)
    }
    const prevDir = previous.path.direction
    const normal = { x: prevDir.y, y: -prevDir.x }
    const origin = profilePoint(previous.path, { x: GLASS_CENTER_X, y: 0 }, true)
    const projection = (point: { x: number; y: number }, axis: { x: number; y: number }) =>
      (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y
    const leadingCorners = second.slice(0, 2).flatMap((panel) => [
      profilePoint(panel.path, { x: panel.center - panel.thickness / 2, y: 0 }, false),
      profilePoint(panel.path, { x: panel.center + panel.thickness / 2, y: 0 }, false),
    ])
    const side = Math.sign(next.path.direction.x * normal.x + next.path.direction.y * normal.y)
    expect(Math.min(...leadingCorners.map((point) => side * projection(point, normal))) - (10 + GLASS_GAP / 2)).toBeCloseTo(5, 6)
    expect(Math.max(...leadingCorners.map((point) => projection(point, prevDir)))).toBeCloseTo(0, 6)
  })

  it('keeps the configured gap at a straight junction', () => {
    const dimensions = calculateSlabContour([{ length: 3000, angle: 180 }, { length: 2500, angle: 180 }], 500).dimensions!
    const panels = calculateGlassPanels(dimensions, 0, GEL2001_PROFILE, GLASS_HEIGHT, 10, 5000, 5)
    const end = profilePoint(panels[0].path, { x: GLASS_CENTER_X, y: 0 }, true)
    const start = profilePoint(panels[2].path, { x: GLASS_CENTER_X, y: 0 }, false)
    expect(start.x - end.x).toBeCloseTo(5, 6)
  })

  it('handles a zero gap at corners and rejects an insufficient following section', () => {
    const dimensions = calculateSlabContour([{ length: 3000, angle: 180 }, { length: 2500, angle: 90 }], 500).dimensions!
    const panels = calculateGlassPanels(dimensions, 0, GEL2001_PROFILE, GLASS_HEIGHT, 10, 5000, 0)
    const previous = panels[0]
    const next = panels[2]
    const previousCenter = profilePoint(previous.path, { x: GLASS_CENTER_X, y: 0 }, true)
    const closestCorner = profilePoint(next.path, { x: next.center - next.thickness / 2, y: 0 }, false)
    const otherCorner = profilePoint(panels[3].path, { x: panels[3].center + panels[3].thickness / 2, y: 0 }, false)
    const normal = { x: previous.path.direction.y, y: -previous.path.direction.x }
    const distances = [closestCorner, otherCorner].map((point) =>
      Math.abs((point.x - previousCenter.x) * normal.x + (point.y - previousCenter.y) * normal.y))
    expect(Math.min(...distances)).toBeCloseTo(10 + GLASS_GAP / 2, 6)
    expect(() => calculateGlassPanels(dimensions, 0, GEL2001_PROFILE, GLASS_HEIGHT, 10, 5000, 3000)).toThrow('zu kurz')
  })

  it.each([90, 270])('joins both continuous sealing lips at the %i° corner with matching miters', (angle) => {
    const dimensions = calculateSlabContour([
      { length: 3000, angle: 180 },
      { length: 2500, angle },
    ], 500).dimensions!
    const { sealLips } = calculateRailingAccessories(dimensions, 25, GEL2001_PROFILE)
    expect(sealLips).toHaveLength(4)
    for (let lip = 0; lip < 2; lip += 1) {
      const first = sealLips[lip * 2]
      const second = sealLips[lip * 2 + 1]
      for (const point of first.section) {
        const end = profilePoint(first, point, true)
        const start = profilePoint(second, point, false)
        expect(end.x).toBeCloseTo(start.x, 6)
        expect(end.y).toBeCloseTo(start.y, 6)
      }
    }
  })

  it('rejects runs too short for the specified shoe end distances', () => {
    const dimensions = calculateSlabContour([{ length: 150, angle: 180 }], 500).dimensions!
    expect(() => calculateRailingAccessories(dimensions, 0, GEL2001_PROFILE)).toThrow('Glasschuh')
  })
})
