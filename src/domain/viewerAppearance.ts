const GRID_GRAY_CANDIDATES = ['#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF']

function relativeLuminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)
  if (!channels || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    throw new Error(`Ungültige Hintergrundfarbe: ${hex}`)
  }
  const [red, green, blue] = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function getGridColors(backgroundColor: string): [string, string] {
  const backgroundLuminance = relativeLuminance(backgroundColor)
  const rankedCandidates = GRID_GRAY_CANDIDATES
    .map((color) => {
      const luminance = relativeLuminance(color)
      const lighter = Math.max(backgroundLuminance, luminance)
      const darker = Math.min(backgroundLuminance, luminance)
      return { color, contrast: (lighter + 0.05) / (darker + 0.05) }
    })
    .sort((first, second) => second.contrast - first.contrast)
  return [rankedCandidates[0].color, rankedCandidates[1].color]
}
