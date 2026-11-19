import type { Point2D, ProfileDefinition } from './types'

export type StandardProfileId = 'even' | 'cone' | 'block16' | 'block16L' | 'block25'

interface StandardProfile {
  id: StandardProfileId
  name: string
  nominalSpacing: number
  depth: number
  axisXFromBounds: number
  leftEndX: number
  rightEndX: number
  points: readonly (readonly [number, number])[]
}

const standardProfiles: readonly StandardProfile[] = [
  {
    id: 'even',
    name: 'Even',
    nominalSpacing: 60,
    depth: 36.1,
    axisXFromBounds: -17.2,
    leftEndX: -16.1,
    rightEndX: 50.5,
    points: [
      [-33.3, -18.05], [-31.1, -18.05], [-31.1, 5.45], [-3.3, 5.45], [-3.3, -18.05],
      [-1.1, -18.05], [-1.1, 7.45], [33.3, 7.45], [33.3, 8.95], [9.44, 8.95],
      [9.44, 18.05], [6.16, 18.05], [6.16, 8.95], [-3.3, 8.95], [-3.3, 6.95],
      [-20.56, 6.95], [-20.56, 18.05], [-23.84, 18.05], [-23.84, 6.95], [-33.3, 6.95],
    ],
  },
  {
    id: 'cone',
    name: 'Cone',
    nominalSpacing: 60,
    depth: 36.2,
    axisXFromBounds: -17.4557724,
    leftEndX: -15.9913042,
    rightEndX: 50.902849,
    points: [
      [9.59132, 8.9], [33.44708, 8.9], [33.44708, 7.4], [-1.25278, 7.4], [-12.0622, -14.73306],
      [-12.30793, -15.18582], [-12.59159, -15.61583], [-12.91109, -16.01992], [-13.26407, -16.39512],
      [-13.64794, -16.73866], [-14.05986, -17.048], [-14.4968, -17.32087], [-14.95553, -17.55525],
      [-15.43268, -17.74942], [-15.92472, -17.90195], [-16.42804, -18.01171], [-16.93891, -18.07789],
      [-17.45358, -18.1], [-17.45577, -18.1], [-17.97068, -18.07786], [-18.48179, -18.01162],
      [-18.98533, -17.90176], [-19.47759, -17.74909], [-19.95492, -17.55475], [-20.41382, -17.32015],
      [-20.85089, -17.04704], [-21.26291, -16.73742], [-21.64684, -16.39359], [-21.99985, -16.01808],
      [-22.31933, -15.61366], [-22.60292, -15.18332], [-22.84854, -14.73023], [-33.44708, 7],
      [-23.68514, 7], [-23.68514, 18.1], [-20.40868, 18.1], [-20.40868, 7], [-3.25834, 7],
      [-1.8875, 8.9], [6.31486, 8.9], [6.31486, 18.1], [9.59132, 18.1],
    ],
  },
  {
    id: 'block16',
    name: 'Block 16',
    nominalSpacing: 60,
    depth: 26.6,
    axisXFromBounds: -18.3219926,
    leftEndX: -13.85,
    rightEndX: 50.4939852,
    points: [
      [8.31624, 13.3], [8.31624, 4.1], [32.17199, 4.1], [32.17199, 2.6], [-4.47199, 2.6],
      [-4.47199, -13.3], [-32.17199, -13.3], [-32.17199, 2.2], [-24.96022, 2.2],
      [-24.96022, 13.3], [-21.68376, 13.3], [-21.68376, 0.7], [-30.67199, 0.7],
      [-30.67199, -11.8], [-5.97199, -11.8], [-5.97199, 4.1], [5.03978, 4.1],
      [5.03978, 13.3], [8.31624, 13.3],
    ],
  },
  {
    id: 'block16L',
    name: 'Block 16L',
    nominalSpacing: 120,
    depth: 26.6,
    axisXFromBounds: -18.321994,
    leftEndX: -43.849405,
    rightEndX: 80.493391,
    points: [
      [38.31564, 13.3], [38.31564, 4.1], [62.1714, 4.1], [62.1714, 2.6], [25.52741, 2.6],
      [25.52741, -13.3], [-62.1714, -13.3], [-62.1714, 2.2], [-54.95963, 2.2],
      [-54.95963, 13.3], [-51.68317, 13.3], [-51.68317, 0.7], [-60.6714, 0.7],
      [-60.6714, -11.8], [24.02741, -11.8], [24.02741, 4.1], [35.03918, 4.1],
      [35.03918, 13.3], [38.31564, 13.3],
    ],
  },
  {
    id: 'block25',
    name: 'Block 25',
    nominalSpacing: 60,
    depth: 35.6,
    axisXFromBounds: -18.3219926,
    leftEndX: -13.85,
    rightEndX: 50.4939852,
    points: [
      [8.31624, 17.8], [8.31624, 8.6], [32.17199, 8.6], [32.17199, 7.1], [-4.47199, 7.1],
      [-4.47199, -17.8], [-32.17199, -17.8], [-32.17199, 6.7], [-24.96022, 6.7],
      [-24.96022, 17.8], [-21.68376, 17.8], [-21.68376, 5.2], [-30.67199, 5.2],
      [-30.67199, -16.3], [-5.97199, -16.3], [-5.97199, 8.6], [5.03978, 8.6],
      [5.03978, 17.8], [8.31624, 17.8],
    ],
  },
]

function signedArea(points: Point2D[]): number {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2
}

export const STANDARD_PROFILES: readonly (ProfileDefinition & { id: StandardProfileId })[] = standardProfiles.map(
  ({ points: sourcePoints, axisXFromBounds, ...profile }) => {
    const points = sourcePoints.map(([x, y]) => ({ x: x - axisXFromBounds, y: y - profile.depth / 2 }))
    const xValues = points.map((point) => point.x)
    const yValues = points.map((point) => point.y)
    return {
      ...profile,
      source: 'standard',
      width: Math.max(...xValues) - Math.min(...xValues),
      depth: Math.max(...yValues) - Math.min(...yValues),
      contours: [{ points, area: signedArea(points) }],
    }
  },
)

export function getStandardProfile(id: StandardProfileId): ProfileDefinition {
  const profile = STANDARD_PROFILES.find((candidate) => candidate.id === id)
  if (!profile) {
    throw new Error(`Unbekanntes Standardprofil: ${id}`)
  }
  return profile
}
