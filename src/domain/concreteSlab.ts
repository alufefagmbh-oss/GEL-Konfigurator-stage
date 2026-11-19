export const MIN_SLAB_DIMENSION = 1
export const MAX_SLAB_DIMENSION = 100000
export const DEFAULT_SLAB_THICKNESS = 200

export interface SlabPoint {
  x: number
  y: number
}

export interface SlabSegment {
  length: number
  angle: number
}

export interface SlabDimension {
  start: SlabPoint
  end: SlabPoint
  length: number
  angle: number | null
}

export type SlabContourResult =
  | { points: SlabPoint[]; dimensions: SlabDimension[]; error: null }
  | { points: null; dimensions: null; error: string }

export function parseSlabDimension(value: string): number | null {
  if (!value.trim()) return null
  const dimension = Number(value)
  return Number.isFinite(dimension) && dimension >= MIN_SLAB_DIMENSION && dimension <= MAX_SLAB_DIMENSION
    ? dimension
    : null
}

export function parseSlabAngle(value: string): number | null {
  if (!value.trim()) return null
  const angle = Number(value)
  return Number.isFinite(angle) && angle > 0 && angle < 360 ? angle : null
}

function cross(a: SlabPoint, b: SlabPoint, c: SlabPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function edgesIntersect(a: SlabPoint, b: SlabPoint, c: SlabPoint, d: SlabPoint): boolean {
  const epsilon = 1e-7
  const onSegment = (p: SlabPoint, q: SlabPoint, r: SlabPoint) =>
    q.x >= Math.min(p.x, r.x) - epsilon && q.x <= Math.max(p.x, r.x) + epsilon
    && q.y >= Math.min(p.y, r.y) - epsilon && q.y <= Math.max(p.y, r.y) + epsilon
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  if (Math.abs(abC) < epsilon && onSegment(a, c, b)) return true
  if (Math.abs(abD) < epsilon && onSegment(a, d, b)) return true
  if (Math.abs(cdA) < epsilon && onSegment(c, a, d)) return true
  if (Math.abs(cdB) < epsilon && onSegment(c, b, d)) return true
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0)
}

export function calculateSlabContour(segments: SlabSegment[], depth: number): SlabContourResult {
  if (segments.length === 0 || !Number.isFinite(depth) || depth < MIN_SLAB_DIMENSION || depth > MAX_SLAB_DIMENSION
    || segments.some((segment) => !Number.isFinite(segment.length) || segment.length < MIN_SLAB_DIMENSION
      || segment.length > MAX_SLAB_DIMENSION || !Number.isFinite(segment.angle)
      || segment.angle <= 0 || segment.angle >= 360)) {
    return { points: null, dimensions: null, error: 'Bitte gültige Maße und Winkel eingeben.' }
  }

  const halfDepth = depth / 2
  const extensions = segments.map((segment, index) =>
    index === 0 ? 0 : halfDepth * Math.tan((180 - segment.angle) * Math.PI / 360),
  )
  if (segments.slice(1).some((segment) => 1 - Math.cos(segment.angle * Math.PI / 180) < 1e-8)) {
    return { points: null, dimensions: null, error: 'Ein Winkel liegt zu nahe an 0° oder 360° für eine gültige Gehrung.' }
  }
  const directions: SlabPoint[] = []
  const centers: SlabPoint[] = [{ x: 0, y: 0 }]
  let heading = 0

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (i > 0) {
      heading -= (180 - segment.angle) * Math.PI / 180
    }
    const direction = { x: Math.cos(heading), y: Math.sin(heading) }
    directions.push(direction)
    const centerLength = segment.length - extensions[i] - (extensions[i + 1] ?? 0)
    if (centerLength <= 1e-7) {
      return { points: null, dimensions: null, error: `Abschnitt ${i + 1} ist für die Tiefe und die angrenzenden Winkel zu kurz.` }
    }
    const previous = centers[i]
    centers.push({ x: previous.x + direction.x * centerLength, y: previous.y + direction.y * centerLength })
  }

  const left: SlabPoint[] = []
  const right: SlabPoint[] = []
  for (let i = 0; i < centers.length; i++) {
    const before = directions[Math.max(0, i - 1)]
    const after = directions[Math.min(i, directions.length - 1)]
    const denominator = 1 + before.x * after.x + before.y * after.y
    const offset = {
      x: (-before.y - after.y) * halfDepth / denominator,
      y: (before.x + after.x) * halfDepth / denominator,
    }
    left.push({ x: centers[i].x + offset.x, y: centers[i].y + offset.y })
    right.push({ x: centers[i].x - offset.x, y: centers[i].y - offset.y })
  }

  for (let i = 0; i < segments.length; i++) {
    for (const side of [left, right]) {
      const projection = (side[i + 1].x - side[i].x) * directions[i].x
        + (side[i + 1].y - side[i].y) * directions[i].y
      if (projection <= 1e-7) {
        return { points: null, dimensions: null, error: `Abschnitt ${i + 1} ist für die Tiefe und die angrenzenden Winkel zu kurz.` }
      }
    }
  }

  const points = [...left, ...right.reverse()]
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue
      if (edgesIntersect(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) {
        return { points: null, dimensions: null, error: 'Die Betondecke überschneidet oder berührt sich. Bitte Maße oder Winkel ändern.' }
      }
    }
  }
  const dimensions = segments.map((segment, i) => ({
    start: left[i],
    end: left[i + 1],
    length: segment.length,
    angle: i === 0 ? null : segment.angle,
  }))
  return { points, dimensions, error: null }
}
