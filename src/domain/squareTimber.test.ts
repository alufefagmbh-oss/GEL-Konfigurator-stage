import { describe, expect, it } from 'vitest'
import { calculateSquareTimberFixings, calculateSquareTimbers, getSquareTimberWidth, usesSquareTimber } from './squareTimber'
import type { SupportRailPiece, SupportRailProfile, UkRailProfile } from './types'

describe('Kantholz', () => {
  it('wird erst ab mehr als 30 mm Distanz verwendet', () => {
    expect(usesSquareTimber(30)).toBe(false)
    expect(usesSquareTimber(30.5)).toBe(true)
  })

  it('reicht von der Oberkante der obersten UK-Schiene bis zur Auflager-Unterkante', () => {
    const piece = {
      origin: { x: 0, y: 10 },
      direction: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      startCut: { offset: 0, slope: 0 },
      endCut: { offset: 1000, slope: 0 },
    } as unknown as SupportRailPiece
    const timbers = calculateSquareTimbers(
      [{ x: 100, centerHeight: 400 }, { x: 100, centerHeight: 1000 }],
      { height: 60 } as UkRailProfile,
      [piece],
      { supportHeight: 0 } as SupportRailProfile,
      60,
    )
    expect(timbers).toHaveLength(1)
    expect(timbers[0]).toMatchObject({ x: 100, width: 60, depth: 60, bottom: 10, top: 1030, holeHeights: [400, 1000] })
  })

  it('begrenzt die Breite auf 80 mm bei größerer Tiefe', () => {
    expect(getSquareTimberWidth(60)).toBe(60)
    expect(getSquareTimberWidth(120)).toBe(80)
  })

  it('setzt erstes und letztes Kantholz 100 mm innerhalb der Schienenenden', () => {
    const fixings = calculateSquareTimberFixings([{ startX: 5, endX: 2005, centerHeight: 300 }], 60)
    expect(fixings[0].x).toBeCloseTo(5 + 100 + 30)
    expect(fixings.at(-1)!.x).toBeCloseTo(2005 - 100 - 30)
    expect(fixings.length).toBe(4)
  })
})
