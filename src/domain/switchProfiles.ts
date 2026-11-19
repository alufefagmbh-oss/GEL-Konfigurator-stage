import type { Point2D, ProfileDefinition } from './types'

const SWITCH_CONTOURS: Record<string, readonly (readonly [number, number])[]> = {
  even: [
    [-3.36, 6.95], [-3.36, 18.05], [-6.64, 18.05], [-6.64, 6.95], [-16.1, 6.95], [-16.1, -18.05],
    [-13.9, -18.05], [-13.9, 5.45], [13.9, 5.45], [13.9, -18.05], [16.1, -18.05], [16.1, 6.95],
    [6.64, 6.95], [6.64, 18.05], [3.36, 18.05], [3.36, 6.95],
  ],
  cone: [
    [-3.36107, 8.9], [-3.36107, 18.1], [-6.63753, 18.1], [-6.63753, 7], [-15.99947, 7],
    [-5.40093, -14.73023], [-5.15532, -15.18332], [-4.87172, -15.61366], [-4.55224, -16.01808],
    [-4.19924, -16.39359], [-3.81531, -16.73742], [-3.40329, -17.04704], [-2.96621, -17.32015],
    [-2.50732, -17.55475], [-2.02998, -17.74909], [-1.53773, -17.90176], [-1.03419, -18.01162],
    [-0.52308, -18.07786], [-0.00817, -18.1], [-0.00598, -18.1], [0.50869, -18.07789],
    [1.01957, -18.01171], [1.52288, -17.90195], [2.01492, -17.74942], [2.49207, -17.55525],
    [2.9508, -17.32087], [3.38774, -17.048], [3.79966, -16.73866], [4.18353, -16.39512],
    [4.53651, -16.01992], [4.85601, -15.61583], [5.13968, -15.18582], [5.3854, -14.73306],
    [15.99947, 7], [6.63897, 7], [6.63897, 18.1], [3.36251, 18.1], [3.36251, 8.9],
  ],
  block16: [
    [13.85, -13.3005], [-13.85, -13.3005], [-13.85, 2.2005], [-6.63823, 2.2005], [-6.63823, 13.3005],
    [-3.36177, 13.3005], [-3.36177, 4.1005], [3.36177, 4.1005], [3.36177, 13.3005],
    [6.63823, 13.3005], [6.63823, 2.2005], [13.85, 2.2005],
  ],
  block25: [
    [13.85, -17.8], [-13.85, -17.8], [-13.85, 6.7], [-6.63823, 6.7], [-6.63823, 17.8],
    [-3.36177, 17.8], [-3.36177, 8.6], [3.36177, 8.6], [3.36177, 17.8],
    [6.63823, 17.8], [6.63823, 6.7], [13.85, 6.7],
  ],
}

const HIGH_HIGH_PROFILE_REFERENCES: Record<string, {
  depth: number
  axisXFromBounds: number
  leftEndX: number
  rightEndX: number
}> = {
  even: { depth: 36.1, axisXFromBounds: 0, leftEndX: -16.1, rightEndX: 16.1 },
  cone: { depth: 36.2, axisXFromBounds: 0.00072, leftEndX: -16.0001917, rightEndX: 15.9987536 },
  block16: { depth: 26.601, axisXFromBounds: 0, leftEndX: -13.85, rightEndX: 13.85 },
  block25: { depth: 35.6, axisXFromBounds: 0, leftEndX: -13.85, rightEndX: 13.85 },
}

const REAR_SWITCH_CONTOUR: readonly (readonly [number, number])[] = [
  [19.699999, -9.2], [19.699999, -10.599999], [-19.699999, -10.599999],
  [-19.699999, -9.2], [-16.519488, -9.2], [-16.519488, 0], [-13.48051, 0],
  [-13.48051, -9.2], [-6.519488, -9.2], [-6.519488, 0], [-3.480511, 0],
  [-3.480511, -9.2], [3.480511, -9.2], [3.480511, 0], [6.519488, 0],
  [6.519488, -9.2], [13.48051, -9.2], [13.48051, 0], [16.519488, 0],
  [16.519488, -9.2],
]
function polygonArea(points: Point2D[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2
}

export function getHighHighSwitchProfile(profileId: string | undefined): ProfileDefinition | null {
  const points = SWITCH_CONTOURS[profileId ?? '']
  if (!points) return null
  const references = HIGH_HIGH_PROFILE_REFERENCES[profileId ?? '']
  if (!references) return null
  const contourPoints = points.map(([x, y]) => ({
    x: x - references.axisXFromBounds,
    y: y - references.depth / 2,
  }))
  const familyName = profileId === 'block16' ? 'Block 16' : profileId === 'block25'
    ? 'Block 25'
    : profileId === 'even' ? 'Even' : 'Cone'
  return {
    id: `${profileId}-high-high-switch`,
    name: `${familyName} Wechselprofil`,
    source: 'standard',
    leftEndX: references.leftEndX,
    rightEndX: references.rightEndX,
    width: Math.max(...contourPoints.map((point) => point.x)) - Math.min(...contourPoints.map((point) => point.x)),
    depth: Math.max(...contourPoints.map((point) => point.y)) - Math.min(...contourPoints.map((point) => point.y)),
    contours: [{ points: contourPoints, area: polygonArea(contourPoints) }],
  }
}

export function getLowLowSwitchProfile(): ProfileDefinition {
  const contourPoints = REAR_SWITCH_CONTOUR.map(([x, y]) => ({ x, y }))
  return {
    id: 'rear-switch',
    name: 'Hinteres Wechselprofil',
    source: 'standard',
    width: 39.399997,
    depth: 10.599999,
    leftEndX: -19.699999,
    rightEndX: 19.699999,
    contours: [{ points: contourPoints, area: polygonArea(contourPoints) }],
  }
}
