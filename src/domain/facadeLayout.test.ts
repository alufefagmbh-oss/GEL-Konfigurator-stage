import { describe, expect, it } from 'vitest'
import { calculateFacadeLayout } from './facadeLayout'
import { getStandardProfile } from './standardProfiles'

const profile = {
  name: 'Testprofil',
  source: 'example' as const,
  width: 40,
  depth: 25,
  contours: [],
}

function calculateForAxisSpan(requiredAxisSpan: number) {
  return calculateFacadeLayout({
    width: requiredAxisSpan + profile.width,
    height: 2500,
    profile: { ...profile },
  })
}

describe('calculateFacadeLayout', () => {
  it('keeps every axis at 60 mm for an exact nominal span', () => {
    const layout = calculateForAxisSpan(120)

    expect(layout.isValid).toBe(true)
    expect(layout.profileCount).toBe(3)
    expect(layout.spacings).toEqual([60, 60])
    expect(layout.method).toBe('nominal')
    expect(layout.rightEdgeDeviation).toBeCloseTo(0, 8)
  })

  it('compresses from the right and uses the fewest changed axes', () => {
    const layout = calculateForAxisSpan(1015)

    expect(layout.method).toBe('compress')
    expect(layout.totalCorrection).toBeCloseTo(-5, 8)
    expect(layout.spacings.slice(-3)).toEqual([59, 58, 58])
    expect(layout.adjustedSpacingCount).toBe(3)
  })

  it('stretches from the right when nominal overshoot is over 30 mm', () => {
    const layout = calculateForAxisSpan(965)

    expect(layout.method).toBe('stretch')
    expect(layout.totalCorrection).toBeCloseTo(5, 8)
    expect(layout.spacings.slice(-3)).toEqual([61, 62, 62])
  })

  it('handles 1 mm and 10 mm compression corrections', () => {
    const oneMillimeter = calculateForAxisSpan(1019)
    const tenMillimeters = calculateForAxisSpan(1010)

    expect(oneMillimeter.spacings.at(-1)).toBe(59)
    expect(oneMillimeter.adjustedSpacingCount).toBe(1)
    expect(tenMillimeters.spacings.slice(-5)).toEqual([58, 58, 58, 58, 58])
    expect(tenMillimeters.adjustedSpacingCount).toBe(5)
  })

  it('prefers compression at and below 30 mm overshoot, and stretching above it', () => {
    expect(calculateForAxisSpan(991).method).toBe('compress')
    expect(calculateForAxisSpan(990).method).toBe('compress')
    expect(calculateForAxisSpan(989).method).toBe('stretch')
  })

  it('places both profile edges exactly at the facade boundaries', () => {
    const layout = calculateForAxisSpan(965)
    const width = 965 + profile.width

    expect(layout.positions[0] - profile.width / 2).toBeCloseTo(-width / 2, 8)
    expect(layout.positions.at(-1)! + profile.width / 2).toBeCloseTo(width / 2, 8)
  })

  it('keeps every spacing within 58-62 mm and sums to the required span', () => {
    for (const requiredAxisSpan of [58, 120, 965, 991, 10000, 100000]) {
      const layout = calculateForAxisSpan(requiredAxisSpan)

      expect(layout.isValid).toBe(true)
      expect(layout.minimumSpacing).toBeGreaterThanOrEqual(58)
      expect(layout.maximumSpacing).toBeLessThanOrEqual(62)
      expect(layout.spacings.reduce((sum, spacing) => sum + spacing, 0)).toBeCloseTo(requiredAxisSpan, 7)
    }
  })

  it('uses the 120 mm nominal spacing and ±2 mm range for Block 16L', () => {
    const block16L = getStandardProfile('block16L')
    const layout = calculateFacadeLayout({
      width: block16L.width + 242,
      height: 2500,
      profile: block16L,
    })

    expect(layout.isValid).toBe(true)
    expect(layout.nominalSpacing).toBe(120)
    expect(layout.spacings[0]).toBeCloseTo(120, 4)
    expect(layout.spacings[1]).toBeCloseTo(122, 4)
    expect(layout.minimumSpacing).toBeCloseTo(120, 4)
    expect(layout.maximumSpacing).toBeCloseTo(122, 4)
    expect(layout.spacingDeviations[0]).toBeCloseTo(0, 4)
    expect(layout.spacingDeviations[1]).toBeCloseTo(2, 4)
  })

  it('aligns the DXF end markers with the facade edges without changing profile contours', () => {
    const even = getStandardProfile('even')
    const endings = { left: 'high' as const, right: 'low' as const }
    const layout = calculateFacadeLayout({
      width: 3000,
      height: 2500,
      profile: even,
      facadeEnds: endings,
    })
    expect(layout.isValid).toBe(true)
    expect(layout.positions[0] + even.leftEndX!).toBeCloseTo(-1500, 8)
    expect(layout.positions.at(-1)! + even.rightEndX!).toBeCloseTo(1500, 8)
  })

  it('rejects Block 16L high-high and low-low end combinations', () => {
    const block16L = getStandardProfile('block16L')
    const highHigh = calculateFacadeLayout({
      width: 3000,
      height: 2500,
      profile: block16L,
      facadeEnds: { left: 'high', right: 'high' },
    })
    const lowLow = calculateFacadeLayout({
      width: 3000,
      height: 2500,
      profile: block16L,
      facadeEnds: { left: 'low', right: 'low' },
    })

    expect(highHigh.isValid).toBe(false)
    expect(highHigh.error).toContain('kein passendes Wechselprofil')
    expect(lowLow.isValid).toBe(false)
    expect(lowLow.error).toContain('kein passendes Wechselprofil')
  })

  it('uses exact 30 mm pitches around the rear low-low switch profile', () => {
    const profile = getStandardProfile('even')
    const layout = calculateFacadeLayout({
      width: 3000,
      height: 2500,
      profile,
      facadeEnds: { left: 'low', right: 'low' },
    })
    expect(layout.isValid).toBe(true)
    expect(layout.spacings.slice(0, 2)).toEqual([30, 30])
    expect(layout.spacingDeviations.slice(0, 2)).toEqual([0, 0])
    expect(layout.spacings.slice(2).every((spacing) => spacing >= 58 && spacing <= 62)).toBe(true)
    expect(layout.rightEdgeDeviation).toBeCloseTo(0, 8)
  })

  it('uses the DXF axis markers to close each end-finish combination exactly', () => {
    const profile = getStandardProfile('even')
    const combinations = [
      { left: 'high' as const, right: 'low' as const },
      { left: 'low' as const, right: 'high' as const },
      { left: 'high' as const, right: 'high' as const },
      { left: 'low' as const, right: 'low' as const },
    ]

    for (const facadeEnds of combinations) {
      const layout = calculateFacadeLayout({ width: 3000, height: 2500, profile, facadeEnds })
      const leftMarker = facadeEnds.left === 'low' ? -profile.rightEndX! : profile.leftEndX!
      const rightMarker = facadeEnds.right === 'high' ? -profile.leftEndX! : profile.rightEndX!

      expect(layout.isValid).toBe(true)
      expect(layout.positions[0] + leftMarker).toBeCloseTo(-1500, 5)
      expect(layout.positions.at(-1)! + rightMarker).toBeCloseTo(1500, 5)
      if (facadeEnds.left === 'high' && facadeEnds.right === 'high') {
        expect(layout.spacings.slice(0, 2)).toEqual([60, 60])
      }
      if (facadeEnds.left === 'low' && facadeEnds.right === 'low') {
        expect(layout.spacings.slice(0, 2)).toEqual([30, 30])
      }
    }
  })

  it('allows Block 16L axes to compress to 118 mm', () => {
    const block16L = getStandardProfile('block16L')
    const layout = calculateFacadeLayout({
      width: block16L.width + 238,
      height: 2500,
      profile: block16L,
    })

    expect(layout.isValid).toBe(true)
    expect(layout.spacings[0]).toBeCloseTo(120, 4)
    expect(layout.spacings[1]).toBeCloseTo(118, 4)
    expect(layout.minimumSpacing).toBeCloseTo(118, 4)
    expect(layout.maximumSpacing).toBeCloseTo(120, 4)
  })

  it('reports an error instead of returning an invalid raster', () => {
    const layout = calculateForAxisSpan(65)

    expect(layout.isValid).toBe(false)
    expect(layout.positions).toEqual([])
    expect(layout.error).toContain('kein Raster')
  })

  it('rejects non-positive facade dimensions', () => {
    const layout = calculateFacadeLayout({
      width: 0,
      height: 2500,
      profile: { ...profile },
    })

    expect(layout.isValid).toBe(false)
    expect(layout.dimensionsValid).toBe(false)
    expect(layout.error).toContain('positive')
  })
})
