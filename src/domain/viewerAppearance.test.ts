import { describe, expect, it } from 'vitest'
import { getGridColors } from './viewerAppearance'

function luminance(hex: string): number {
  const [red, green, blue] = hex.slice(1).match(/.{2}/g)!.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(first: string, second: string): number {
  const brighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (brighter + 0.05) / (darker + 0.05)
}

describe('viewer grid colors', () => {
  it.each(['#FFFFFF', '#F5F5F5', '#101010', '#808080', '#87CEEB'])('keeps both grid colors visible on %s', (background) => {
    const colors = getGridColors(background)
    expect(new Set(colors).size).toBe(2)
    expect(colors.every((color) => contrast(color, background) >= 2.5)).toBe(true)
  })

  it('rejects malformed background colors', () => {
    expect(() => getGridColors('skyblue')).toThrow('Ungültige Hintergrundfarbe')
  })
})
