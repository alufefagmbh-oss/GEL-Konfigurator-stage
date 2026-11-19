import { describe, expect, it } from 'vitest'
import { calculateSlabContour } from './concreteSlab'
import { DEFAULT_STATIC_ASSUMPTIONS } from './staticAssumptions'
import { calculateProfileParts, profilePoint, profileStockLength, sideFixingWallBounds } from './railingProfile'
import { calculateRailingAccessories } from './railingAccessories'
import { GEL2001_PROFILE } from '../dxf/gel2001Profile'
import { createRailingManufacturingData, profileManufacturingData } from './railingManufacturing'

describe('AV-Daten für Geländer', () => {
  it.each([90, 270])('derives signed cut and hole coordinates from the raw start at %i degrees', (angle) => {
    const dimensions = calculateSlabContour([{ length: 3000, angle: 180 }, { length: 2500, angle }], 500).dimensions!
    const profiles = calculateProfileParts(dimensions, GEL2001_PROFILE, 25, DEFAULT_STATIC_ASSUMPTIONS)
    for (const [index, profile] of profiles.entries()) {
      const data = profileManufacturingData(profile, `P${index + 1}`)
      const normal = { x: profile.direction.y, y: -profile.direction.x }
      const projection = (p: { x: number; y: number }) =>
        (p.x - profile.start.x) * profile.direction.x + (p.y - profile.start.y) * profile.direction.y
      const rawStart = Math.min(projection(profilePoint(profile, { x: 0, y: 0 }, false)),
        projection(profilePoint(profile, { x: data.width, y: 0 }, false)))
      expect(data.stockLength).toBeCloseTo(profileStockLength(profile), 8)
      expect(data.startAtZero + rawStart).toBeCloseTo(projection(profilePoint(profile, { x: 0, y: 0 }, false)), 8)
      expect(data.endAtWidth + rawStart).toBeCloseTo(projection(profilePoint(profile, { x: data.width, y: 0 }, true)), 8)
      expect(data.startAngle).toBeCloseTo(Math.atan((data.startAtWidth - data.startAtZero) / data.width) * 180 / Math.PI)
      for (const [i, hole] of profile.holes.entries()) {
        expect(data.holes[i].longitudinal + rawStart).toBeCloseTo(projection(hole), 8)
        expect(data.holes[i].lateral).toBeCloseTo((hole.x - profile.start.x) * normal.x + (hole.y - profile.start.y) * normal.y - profile.offset, 8)
      }
    }
  })

  it('groups identical profiles while preserving individual machining positions and all accessory counts', () => {
    const dimensions = calculateSlabContour([{ length: 3100, angle: 180 }], 500).dimensions!
    const profile = calculateProfileParts(dimensions, GEL2001_PROFILE, 0, DEFAULT_STATIC_ASSUMPTIONS)[0]
    const accessories = calculateRailingAccessories(dimensions, 0, GEL2001_PROFILE)
    const data = createRailingManufacturingData([profile, profile], accessories)
    expect(data.profiles.map((item) => item.position)).toEqual(['P001', 'P002'])
    expect(data.items.map((item) => item.position)).toEqual(data.items.map((_, index) => String(index + 1).padStart(3, '0')))
    expect(data.items[0].quantity).toBe(2)
    expect(data.items[0].note).toContain('P001, P002')
    const total = (name: string) => data.items.filter((item) => item.description.startsWith(name)).reduce((sum, item) => sum + item.quantity, 0)
    expect(total('Glasschuh')).toBe(accessories.glassShoes.length)
    expect(total('Klemmleiste')).toBe(accessories.clampWedges.length)
    expect(data.items.filter((item) => item.description.startsWith('Klemmleiste'))).toHaveLength(1)
    expect(data.items.find((item) => item.description === 'Klemmleisten')).toMatchObject({ length: null, note: '' })
    expect(data.items.find((item) => item.description === 'Glasschuhe')).toMatchObject({ length: null, note: '' })
    expect(data.items.filter((item) => item.description.startsWith('Dichtlippe'))).toHaveLength(2)
    expect(data.items.filter((item) => item.description.startsWith('Dichtlippe')).every((item) => item.unit === 'lfm' && item.length === null && item.note.includes('Baustelle'))).toBe(true)
    expect(total('Dichtlippe')).toBeCloseTo(accessories.sealLips.reduce((sum, part) => sum + profileStockLength(part) / 1000, 0), 8)
    expect(total('Senkkopfschraube')).toBe(profile.holes.length * 2)
    expect(data.items.every((item) => item.note !== 'Gerade geschnitten')).toBe(true)
  })

  it('splits long profiles and preserves every hole in the matching position', () => {
    const dimensions = calculateSlabContour([{ length: 9000, angle: 180 }], 500).dimensions!
    const profiles = calculateProfileParts(dimensions, GEL2001_PROFILE, 0, DEFAULT_STATIC_ASSUMPTIONS)
    const data = createRailingManufacturingData(profiles, { glassShoes: [], clampWedges: [], sealLips: [] })
    expect(profiles).toHaveLength(3)
    expect(data.profiles.map((item) => item.holes.length)).toEqual(profiles.map((part) => part.holes.length))
    expect(data.items.filter((item) => item.description.startsWith('GEL2001')).reduce((n, item) => n + item.quantity, 0)).toBe(3)
  })

  it('lists only the profile and Torbandschrauben for Montagefall 7A', () => {
    const dimensions = calculateSlabContour([{ length: 3000, angle: 180 }], 10).dimensions!
    const width = Math.max(...GEL2001_PROFILE.map((point) => point.x))
    const profiles = calculateProfileParts(dimensions, GEL2001_PROFILE, -width, DEFAULT_STATIC_ASSUMPTIONS, '7A')
    const data = createRailingManufacturingData(profiles, { glassShoes: [], clampWedges: [], sealLips: [] }, '7A')
    expect(data.items.some((item) => item.description.startsWith('Stahlblech'))).toBe(false)
    expect(data.items.find((item) => item.description.startsWith('Torbandschraube'))?.quantity).toBe(profiles[0].holes.length)
    expect(data.items.find((item) => item.description.startsWith('Torbandschraube'))?.note).toContain('61,0 mm')
    const wall = sideFixingWallBounds(profiles[0].section)
    const detail = profileManufacturingData(profiles[0], 'P001', '7A')
    expect(detail.holes[0].lateral).toBeCloseTo(wall.outer, 6)
    expect(data.mounting).toBe('7A')
  })
})
