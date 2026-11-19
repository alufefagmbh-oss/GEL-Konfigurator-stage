import type { SlabDimension, SlabPoint } from './concreteSlab'
import { createProfilePathParts, profilePoint } from './railingProfile'
import type { ProfilePart } from './railingProfile'

export const CLAMP_WEDGE_LENGTH = 180
export const MAX_CLAMP_WEDGE_GAP = 20
export const GLASS_SHOE_LENGTH = 100
export const MAX_GLASS_SHOE_GAP = 300
export const GLASS_SHOE_END_OFFSET = 30
export const CLAMP_WEDGE_END_OFFSET = 10
export const GLASS_HEIGHT = 1100
export const GLASS_PANE_THICKNESS = 10
export const GLASS_GAP = 1
export const DEFAULT_MAX_GLASS_PANEL_WIDTH = 1250
export const DEFAULT_GLASS_PANEL_GAP = 5
export const GLASS_BOTTOM_HEIGHT = 16.051625
export const GLASS_CENTER_X = 26.507020610297

export interface GlassPanel {
  path: ProfilePart
  width: number
  center: number
  thickness: number
  bottom: number
  top: number
}

interface DxfVertex extends SlabPoint {
  bulge?: number
}

const sealLipContours: DxfVertex[][] = [
  [
    { x: 3.016325933025, y: 135.5915451185 }, { x: 16.727794165669, y: 143.545624014859 },
    { x: 14.446717850962, y: 120.302415500608 }, { x: 3.782081461679, y: 120.302415500608 },
    { x: 3.782081461679, y: 131.604388764501 }, { x: 5.7574959264, y: 131.604388764501 },
    { x: 5.7574959264, y: 135.5915451185 }, { x: 3.016325933025, y: 135.5915451185 },
  ],
  [
    { x: 49.997715287569, y: 135.5915451185 }, { x: 36.286247054925, y: 143.545624014859 },
    { x: 38.567323369632, y: 120.302415500608 }, { x: 49.231959758915, y: 120.302415500608 },
    { x: 49.231959758915, y: 131.604388764501 }, { x: 47.256545294194, y: 131.604388764501 },
    { x: 47.256545294194, y: 135.5915451185 }, { x: 49.997715287569, y: 135.5915451185 },
  ],
]

const clampWedgeContours: DxfVertex[][] = [
  [
    { x: 6.374230923866, y: 110.672842202656 }, { x: 16.087238782944, y: 110.693666149882 },
    { x: 15.968812225668, y: 95.518450071952 }, { x: 6.962689681324, y: 95.588733360298 },
    { x: 6.374230923866, y: 110.672842202656 },
  ],
  [
    { x: 46.639810296728, y: 110.672842202656 }, { x: 36.92680243765, y: 110.693666149882 },
    { x: 37.045228994926, y: 95.518450071952 }, { x: 46.05135153927, y: 95.588733360298 },
    { x: 46.639810296728, y: 110.672842202656 },
  ],
]

const glassShoeContour: DxfVertex[] = [
  { x: 27.986312851278, y: 13.051804436912 }, { x: 24.98619013182, y: 13.051624957771 },
  { x: 24.986238244682, y: 11.000621304594 }, { x: 21.78225008787, y: 11.000460532236 },
  { x: 21.782157603878, y: 13.051804436911 }, { x: 18.78203488442, y: 13.051624957771 },
  { x: 18.782127368411, y: 11.00028106248 }, { x: 12.801066897237, y: 10.999923270628 },
  { x: 12.800790483996, y: 15.620369097546 }, { x: 9.500790484002, y: 17.202802329237 },
  { x: 9.500790484002, y: 17.696333796819 }, { x: 12.746448329307, y: 17.695189751457 },
  { x: 12.664063282078, y: 21.608479494795 }, { x: 9.341180384697, y: 23.201885652926 },
  { x: 9.341180384697, y: 23.695417120509 }, { x: 12.620137079788, y: 23.694974103563 },
  { x: 12.530463079643, y: 27.954489110452 }, { x: 9.186312851279, y: 29.558093490188 },
  { x: 9.186312851279, y: 30.051624957771 }, { x: 15.586312851284, y: 30.051624957771 },
  { x: 15.586312851279, y: 27.536294012062 }, { x: 16.086312851279, y: 27.536294012062 },
  { x: 16.086312851279, y: 26.536294012062 }, { x: 15.586312851279, y: 26.536294012062 },
  { x: 15.58631285128, y: 23.389176542735 }, { x: 16.08631285128, y: 23.389176542735 },
  { x: 16.08631285128, y: 22.389176542735 }, { x: 15.58631285128, y: 22.389176542735 },
  { x: 15.586312851279, y: 19.536294012062 }, { x: 16.086312851279, y: 19.536294012062 },
  { x: 16.086312851279, y: 18.536294012062 }, { x: 15.586312851279, y: 18.536294012062 },
  { x: 15.586312851279, y: 16.05162495777 }, { x: 26.507020610297, y: 16.05162495777 },
  { x: 37.427728369315, y: 16.05162495777 }, { x: 37.427728369315, y: 18.536294012062 },
  { x: 36.927728369315, y: 18.536294012062 }, { x: 36.927728369315, y: 19.536294012062 },
  { x: 37.427728369315, y: 19.536294012062 }, { x: 37.427728369314, y: 22.389176542735 },
  { x: 36.927728369314, y: 22.389176542735 }, { x: 36.927728369314, y: 23.389176542735 },
  { x: 37.427728369314, y: 23.389176542735 }, { x: 37.427728369315, y: 26.536294012062 },
  { x: 36.927728369315, y: 26.536294012062 }, { x: 36.927728369315, y: 27.536294012062 },
  { x: 37.427728369315, y: 27.536294012062 }, { x: 37.42772836931, y: 30.051624957771 },
  { x: 43.827728369315, y: 30.051624957771 }, { x: 43.827728369315, y: 29.558093490188 },
  { x: 40.483578140951, y: 27.954489110452 }, { x: 40.393904140806, y: 23.694974103563 },
  { x: 43.672860835897, y: 23.695417120509 }, { x: 43.672860835897, y: 23.201885652926 },
  { x: 40.349977938516, y: 21.608479494795 }, { x: 40.267592891287, y: 17.695189751457 },
  { x: 43.513250736592, y: 17.696333796819 }, { x: 43.513250736592, y: 17.202802329237 },
  { x: 40.213250736598, y: 15.620369097546 }, { x: 40.212974323357, y: 10.999923270628 },
  { x: 34.190544029662, y: 11.000283537256 }, { x: 34.190468098679, y: 13.051804436911 },
  { x: 31.19034537922, y: 13.051624957771 }, { x: 31.190421296918, y: 11.000463007013 },
  { x: 27.98636096939, y: 11.000620607038 },
]

function expandClosedContour(vertices: DxfVertex[]): SlabPoint[] {
  const contour: DxfVertex[] = []
  for (const vertex of vertices) {
    const previous = contour.at(-1)
    if (previous && Math.hypot(previous.x - vertex.x, previous.y - vertex.y) < 1e-8) {
      if (vertex.bulge !== undefined) previous.bulge = vertex.bulge
      continue
    }
    contour.push({ ...vertex })
  }
  if (contour.length > 1 && Math.hypot(contour[0].x - contour.at(-1)!.x, contour[0].y - contour.at(-1)!.y) < 1e-6) {
    contour.pop()
  }
  const points: SlabPoint[] = []
  for (let index = 0; index < contour.length; index += 1) {
    const start = contour[index]
    const end = contour[(index + 1) % contour.length]
    points.push({ x: start.x, y: start.y })
    const bulge = start.bulge ?? 0
    if (Math.abs(bulge) < 1e-8) continue
    const chordX = end.x - start.x
    const chordY = end.y - start.y
    const chordLength = Math.hypot(chordX, chordY)
    if (chordLength < 1e-8) continue
    const angle = 4 * Math.atan(bulge)
    const centerOffset = chordLength / (2 * Math.tan(angle / 2))
    const centerX = (start.x + end.x) / 2 - chordY / chordLength * centerOffset
    const centerY = (start.y + end.y) / 2 + chordX / chordLength * centerOffset
    const radius = Math.hypot(start.x - centerX, start.y - centerY)
    const startAngle = Math.atan2(start.y - centerY, start.x - centerX)
    const steps = Math.max(2, Math.ceil(Math.abs(angle) / (Math.PI / 36)))
    for (let step = 1; step < steps; step += 1) {
      const sampleAngle = startAngle + angle * step / steps
      points.push({ x: centerX + Math.cos(sampleAngle) * radius, y: centerY + Math.sin(sampleAngle) * radius })
    }
  }
  return points
}

export const GEL2001_SEAL_LIPS: SlabPoint[][] = sealLipContours.map(expandClosedContour)
export const GEL2001_CLAMP_WEDGES: SlabPoint[][] = clampWedgeContours.map(expandClosedContour)
export const GEL2001_GLASS_SHOE: SlabPoint[] = expandClosedContour(glassShoeContour)

function placePart(path: ProfilePart, section: SlabPoint[], profileWidth: number, distance: number, length: number): ProfilePart {
  const center = profileWidth / 2
  const startCenter = profilePoint(path, { x: center, y: 0 }, false)
  const normal = { x: path.direction.y, y: -path.direction.x }
  const centerStart = { x: startCenter.x + path.direction.x * distance, y: startCenter.y + path.direction.y * distance }
  const centerEnd = { x: centerStart.x + path.direction.x * length, y: centerStart.y + path.direction.y * length }
  const start = { x: centerStart.x - normal.x * (path.offset + center), y: centerStart.y - normal.y * (path.offset + center) }
  const end = { x: centerEnd.x - normal.x * (path.offset + center), y: centerEnd.y - normal.y * (path.offset + center) }
  return { ...path, start, end, startMiter: normal, endMiter: normal, section, holes: [] }
}

function repeatParts(paths: ProfilePart[], section: SlabPoint[], partLength: number, maximumGap: number, profileWidth: number, label: string): ProfilePart[] {
  return paths.flatMap((path, pathIndex) => {
    const center = profileWidth / 2
    const startCenter = profilePoint(path, { x: center, y: 0 }, false)
    const endCenter = profilePoint(path, { x: center, y: 0 }, true)
    const length = Math.hypot(endCenter.x - startCenter.x, endCenter.y - startCenter.y)
    if (length < partLength + 2 * GLASS_SHOE_END_OFFSET - 1e-7) throw new Error(`Abschnitt ${pathIndex + 1} ist zu kurz für einen ${label} mit 30 mm Endabstand.`)
    const usableLength = length - 2 * GLASS_SHOE_END_OFFSET
    const count = Math.max(1, Math.ceil((usableLength + maximumGap) / (partLength + maximumGap)))
    const gap = count === 1 ? 0 : (usableLength - count * partLength) / (count - 1)
    if (gap < -1e-7 || gap > maximumGap + 1e-7) throw new Error(`Der Abstand der ${label} kann auf Abschnitt ${pathIndex + 1} nicht eingehalten werden.`)
    return Array.from({ length: count }, (_, index) => {
      const distance = GLASS_SHOE_END_OFFSET + index * (partLength + gap)
      return placePart(path, section, profileWidth, distance, partLength)
    })
  })
}

function clampWedgeParts(paths: ProfilePart[], section: SlabPoint[], profileWidth: number): ProfilePart[] {
  return paths.flatMap((path, pathIndex) => {
    const center = profileWidth / 2
    const startCenter = profilePoint(path, { x: center, y: 0 }, false)
    const endCenter = profilePoint(path, { x: center, y: 0 }, true)
    const length = Math.hypot(endCenter.x - startCenter.x, endCenter.y - startCenter.y)
    const usableLength = length - 2 * CLAMP_WEDGE_END_OFFSET
    if (usableLength < 1) throw new Error(`Abschnitt ${pathIndex + 1} ist zu kurz für einen Klemmkeil.`)
    const parts: ProfilePart[] = []
    for (let distance = CLAMP_WEDGE_END_OFFSET; distance < length - CLAMP_WEDGE_END_OFFSET - 1e-7; distance += CLAMP_WEDGE_LENGTH + MAX_CLAMP_WEDGE_GAP) {
      const partLength = Math.min(CLAMP_WEDGE_LENGTH, length - CLAMP_WEDGE_END_OFFSET - distance)
      parts.push(placePart(path, section, profileWidth, distance, partLength))
    }
    return parts
  })
}

export function calculateGlassPanels(
  dimensions: SlabDimension[],
  offset: number,
  profileSection: SlabPoint[],
  height = GLASS_HEIGHT,
  thickness = GLASS_PANE_THICKNESS,
  maxPanelWidth = DEFAULT_MAX_GLASS_PANEL_WIDTH,
  panelGap = DEFAULT_GLASS_PANEL_GAP,
): GlassPanel[] {
  const paths = createProfilePathParts(dimensions, profileSection, offset)
  if (!Number.isFinite(maxPanelWidth) || maxPanelWidth <= 0 || !Number.isFinite(panelGap) || panelGap < 0) {
    throw new Error('Maximale Glasbreite und Scheibenspalt müssen gültige Maße sein.')
  }
  if (!Number.isFinite(thickness) || thickness <= 0) throw new Error('Die Scheibendicke muss größer als 0 sein.')

  const starts = paths.map(() => 0)
  const ends = paths.map(() => 0)
  const halfGlassWidth = thickness + GLASS_GAP / 2
  for (let index = 1; index < paths.length; index += 1) {
    const previous = paths[index - 1].direction
    const next = paths[index].direction
    const cosine = previous.x * next.x + previous.y * next.y
    const sine = Math.abs(previous.x * next.y - previous.y * next.x)
    if (sine < 1e-8 && cosine > 0) {
      starts[index] = panelGap
      continue
    }
    if (sine < 1e-8) throw new Error('Der Geländerknick ist für einen stumpfen Glasstoß zu spitz.')
    // Keep the entire two-layer pane clear of the previous pane at the specified gap.
    const nextStart = (halfGlassWidth * (1 + Math.abs(cosine)) + panelGap) / sine
    starts[index] = nextStart
    ends[index - 1] = nextStart * cosine + halfGlassWidth * sine
  }

  return paths.flatMap((path, pathIndex) => {
    const start = profilePoint(path, { x: GLASS_CENTER_X, y: 0 }, false)
    const end = profilePoint(path, { x: GLASS_CENTER_X, y: 0 }, true)
    const length = (end.x - start.x) * path.direction.x + (end.y - start.y) * path.direction.y
      + ends[pathIndex] - starts[pathIndex]
    if (length <= 0) throw new Error(`Abschnitt ${pathIndex + 1} ist für den stumpfen Glasstoß zu kurz.`)
    const count = Math.max(1, Math.ceil((length + panelGap) / (maxPanelWidth + panelGap)))
    const paneWidth = (length - (count - 1) * panelGap) / count
    if (paneWidth <= 0) throw new Error('Der Scheibenspalt ist zu groß für die konfigurierte Abschnittslänge.')
    return Array.from({ length: count }, (_, index) => {
      const startDistance = starts[pathIndex] + index * (paneWidth + panelGap)
      const endDistance = startDistance + paneWidth
      const normal = { x: path.direction.y, y: -path.direction.x }
      const panelPath: ProfilePart = {
        ...path,
        start: {
          x: start.x + path.direction.x * startDistance - normal.x * (path.offset + GLASS_CENTER_X),
          y: start.y + path.direction.y * startDistance - normal.y * (path.offset + GLASS_CENTER_X),
        },
        end: {
          x: start.x + path.direction.x * endDistance - normal.x * (path.offset + GLASS_CENTER_X),
          y: start.y + path.direction.y * endDistance - normal.y * (path.offset + GLASS_CENTER_X),
        },
        startMiter: normal,
        endMiter: normal,
        holes: [],
      }
      return [-1, 1].map((side): GlassPanel => ({
        path: panelPath,
        width: paneWidth,
        center: GLASS_CENTER_X + side * (thickness + GLASS_GAP) / 2,
        thickness,
        bottom: GLASS_BOTTOM_HEIGHT,
        top: height,
      }))
    }).flat()
  })
}

export function calculateRailingAccessories(dimensions: SlabDimension[], offset: number, profileSection: SlabPoint[]): RailingAccessoryLayout {
  const paths = createProfilePathParts(dimensions, profileSection, offset)
  const profileWidth = Math.max(...profileSection.map((point) => point.x))
  return {
    sealLips: GEL2001_SEAL_LIPS.flatMap((section) => createProfilePathParts(dimensions, section, offset)),
    clampWedges: GEL2001_CLAMP_WEDGES.flatMap((section) => clampWedgeParts(paths, section, profileWidth)),
    glassShoes: repeatParts(paths, GEL2001_GLASS_SHOE, GLASS_SHOE_LENGTH, MAX_GLASS_SHOE_GAP, profileWidth, 'Glasschuh'),
  }
}

export interface RailingAccessoryLayout {
  sealLips: ProfilePart[]
  clampWedges: ProfilePart[]
  glassShoes: ProfilePart[]
}
