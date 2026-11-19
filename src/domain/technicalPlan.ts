import { getWallVerticalBounds } from './wallContour'
import { getEndGap } from './endGap'
import { getProfileDepthCoordinate } from './profileCoordinates'
import type { FacadeConfiguration, FacadeLayout, Point2D, ProfilePlacement, WallContour } from './types'

export const TECHNICAL_PLAN_DRAWING_AREA = {
  width: 280,
  height: 125,
} as const

const TECHNICAL_SCALES = [10, 20, 50, 100, 200, 500, 1000]

export interface TechnicalPlanInput {
  configuration: Pick<FacadeConfiguration, 'width' | 'height' | 'profile' | 'endGap' | 'masonryView' | 'ukRailView'>
  layout: FacadeLayout
  wallContour: WallContour | null
  placements?: ProfilePlacement[]
}

export interface TechnicalPlanProfileProjection {
  sections: Point2D[][]
  elevationContours: Array<{ lower: Point2D[]; upper: Point2D[] }>
  extrusionEdges: Array<{ x: number; bottom: number; top: number }>
}

export interface TechnicalPlanMasonryProjection {
  outline: Point2D[]
  depthStart: number
  depthEnd: number
}

export interface TechnicalPlanGeometry {
  facadeWidth: number
  facadeHeight: number
  scaleDenominator: number
  wallOutline: Point2D[]
  profileOutlines: Point2D[][]
  profileProjections: TechnicalPlanProfileProjection[]
  masonryProjections: TechnicalPlanMasonryProjection[]
  depthBounds: { minimum: number; maximum: number }
  frontBounds: { minimumX: number; maximumX: number; minimumY: number; maximumY: number }
}

export function selectTechnicalPlanScale(
  width: number,
  height: number,
  availableWidth = TECHNICAL_PLAN_DRAWING_AREA.width,
  availableHeight = TECHNICAL_PLAN_DRAWING_AREA.height,
  depthExtent = 0,
  availableSideWidth = 76,
  availableTopDepth = 35,
): number {
  if (![width, height, availableWidth, availableHeight, depthExtent, availableSideWidth, availableTopDepth].every(Number.isFinite)
    || width <= 0 || height <= 0 || availableWidth <= 0 || availableHeight <= 0
    || depthExtent < 0 || availableSideWidth <= 0 || availableTopDepth <= 0) {
    throw new Error('Die Plan- und Fassadenabmessungen müssen positive endliche Werte sein.')
  }

  const requiredDenominator = Math.max(
    width / availableWidth,
    height / availableHeight,
    depthExtent / availableSideWidth,
    depthExtent / availableTopDepth,
  )
  const standardScale = TECHNICAL_SCALES.find((denominator) => denominator >= requiredDenominator)
  if (standardScale) return standardScale

  return Math.ceil(requiredDenominator / 100) * 100
}

function createRectangle(width: number, height: number): Point2D[] {
  return [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ]
}

function rectangle(left: number, bottom: number, right: number, top: number): Point2D[] {
  return [
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: right, y: top },
    { x: left, y: top },
  ]
}

function getProfileContours(profile: TechnicalPlanInput['configuration']['profile']): Point2D[][] {
  if (profile.contours.length > 0) return profile.contours.map((contour) => contour.points)
  return [rectangle(-profile.width / 2, -profile.depth / 2, profile.width / 2, profile.depth / 2)]
}

function getVerticalBoundsAtX(outline: Point2D[], x: number): { bottom: number; top: number } {
  const values: number[] = []
  for (let index = 0; index < outline.length; index += 1) {
    const start = outline[index]
    const end = outline[(index + 1) % outline.length]
    const minimumX = Math.min(start.x, end.x)
    const maximumX = Math.max(start.x, end.x)
    if (x < minimumX - 1e-7 || x > maximumX + 1e-7) continue
    if (Math.abs(end.x - start.x) <= 1e-7) {
      values.push(start.y, end.y)
    } else {
      const ratio = (x - start.x) / (end.x - start.x)
      values.push(start.y + ratio * (end.y - start.y))
    }
  }
  if (values.length === 0) {
    throw new Error('Die Profilprojektion konnte nicht aus den Profilgrenzen abgeleitet werden.')
  }
  return { bottom: Math.min(...values), top: Math.max(...values) }
}

function createMasonryProjections(
  input: TechnicalPlanInput,
  wallOutline: Point2D[],
): TechnicalPlanMasonryProjection[] {
  const masonry = input.configuration.masonryView
  if (!masonry?.enabled) return []

  const { width, height } = input.configuration
  const contour = input.wallContour
  const contourWidth = contour?.width ?? width
  const wallXValues = contour
    ? [...new Set(contour.points.map((point) => point.x))].sort((first, second) => first - second)
    : [0, width]
  const topEnabled = masonry.topEnabled && masonry.topHeight > 0
  const sideEnabled = masonry.sideEnabled && masonry.sideWidth > 0
  const wallBoundsAt = (x: number) => contour
    ? getWallVerticalBounds(contour, x)
    : { bottom: 0, top: height }
  const toFacadePoint = (point: Point2D): Point2D => ({
    x: point.x - contourWidth / 2,
    y: point.y - height / 2,
  })
  const lowerEdge = wallXValues.map((x) => ({ x, y: wallBoundsAt(x).bottom }))
  const upperEdge = wallXValues.map((x) => ({ x, y: wallBoundsAt(x).top }))
  const extendEdge = (edge: Point2D[]): Point2D[] => sideEnabled
    ? [
        { x: -masonry.sideWidth, y: edge[0].y },
        ...edge,
        { x: contourWidth + masonry.sideWidth, y: edge[edge.length - 1].y },
      ]
    : edge
  const extendedLowerEdge = extendEdge(lowerEdge)
  const extendedUpperEdge = extendEdge(upperEdge)
  const depthEnd = masonry.facadeOffset + masonry.facadeDepth
  const projections: TechnicalPlanMasonryProjection[] = [{
    outline: wallOutline,
    depthStart: masonry.facadeOffset,
    depthEnd,
  }]

  if (topEnabled) {
    const topOuterY = Math.max(...extendedUpperEdge.map((point) => point.y)) + masonry.topHeight
    projections.push({
      outline: [
        ...extendedUpperEdge.map(toFacadePoint),
        ...[...extendedUpperEdge].reverse().map(({ x }) => toFacadePoint({ x, y: topOuterY })),
      ],
      depthStart: masonry.facadeOffset - masonry.topDepth,
      depthEnd,
    })
  }
  if (sideEnabled) {
    for (const edgeX of [0, contourWidth]) {
      const bounds = wallBoundsAt(edgeX)
      const outerX = edgeX === 0 ? -masonry.sideWidth : contourWidth + masonry.sideWidth
      const outline = edgeX === 0
        ? [
            { x: outerX, y: bounds.bottom },
            { x: edgeX, y: bounds.bottom },
            { x: edgeX, y: bounds.top },
            { x: outerX, y: bounds.top },
          ]
        : [
            { x: edgeX, y: bounds.bottom },
            { x: outerX, y: bounds.bottom },
            { x: outerX, y: bounds.top },
            { x: edgeX, y: bounds.top },
          ]
      projections.push({
        outline: outline.map(toFacadePoint),
        depthStart: masonry.facadeOffset - masonry.sideDepth,
        depthEnd,
      })
    }
  }
  if (masonry.bottomEnabled && masonry.bottomType === 'wall' && masonry.bottomWallHeight > 0) {
    const bottomOuterY = Math.min(...extendedLowerEdge.map((point) => point.y)) - masonry.bottomWallHeight
    projections.push({
      outline: [
        ...extendedLowerEdge.map(({ x }) => toFacadePoint({ x, y: bottomOuterY })),
        ...[...extendedLowerEdge].reverse().map(toFacadePoint),
      ],
      depthStart: masonry.facadeOffset - masonry.bottomWallDepth,
      depthEnd,
    })
  }
  if (masonry.bottomEnabled && masonry.bottomType === 'floor' && masonry.floorThickness > 0 && masonry.floorDepth > 0) {
    const floorOuterY = Math.min(...extendedLowerEdge.map((point) => point.y)) - masonry.floorThickness
    projections.push({
      outline: [
        ...extendedLowerEdge.map((point) => toFacadePoint({ x: point.x, y: floorOuterY })),
        ...[...extendedLowerEdge].reverse().map(toFacadePoint),
      ],
      depthStart: depthEnd - masonry.floorDepth,
      depthEnd,
    })
  }
  return projections
}

function getBounds(points: Point2D[]) {
  return {
    minimumX: Math.min(...points.map((point) => point.x)),
    maximumX: Math.max(...points.map((point) => point.x)),
    minimumY: Math.min(...points.map((point) => point.y)),
    maximumY: Math.max(...points.map((point) => point.y)),
  }
}

function createProfileOutline(
  placement: ProfilePlacement,
  configuration: TechnicalPlanInput['configuration'],
  wallContour: WallContour | null,
): Point2D[] {
  const { height } = configuration
  const endGap = getEndGap(configuration)
  const profile = placement.profile
  const profilePoints = profile.contours[0]?.points ?? []
  const profileMinX = profilePoints.length > 0
    ? Math.min(...profilePoints.map((point) => point.x))
    : -profile.width / 2
  const profileMaxX = profilePoints.length > 0
    ? Math.max(...profilePoints.map((point) => point.x))
    : profile.width / 2
  const localLeft = placement.leftTrimX ?? profileMinX
  const localRight = placement.rightTrimX ?? profileMaxX
  const left = placement.axisX + (placement.profileOffsetX ?? 0) + localLeft
  const right = placement.axisX + (placement.profileOffsetX ?? 0) + localRight
  if (!wallContour) {
    return [
      { x: left, y: -height / 2 + endGap },
      { x: right, y: -height / 2 + endGap },
      { x: right, y: height / 2 - endGap },
      { x: left, y: height / 2 - endGap },
    ]
  }

  const leftX = left + wallContour.width / 2
  const rightX = right + wallContour.width / 2
  const breakpoints = [...new Set([
    leftX,
    ...wallContour.points
      .map((point) => point.x)
      .filter((x) => x > leftX && x < rightX),
    rightX,
  ])].sort((first, second) => first - second)
  const lowerEdge: Point2D[] = []
  const upperEdge: Point2D[] = []

  for (const x of breakpoints) {
    const bounds = getWallVerticalBounds(wallContour, x)
    lowerEdge.push({ x: x - wallContour.width / 2, y: bounds.bottom + endGap - wallContour.height / 2 })
    upperEdge.push({ x: x - wallContour.width / 2, y: bounds.top - endGap - wallContour.height / 2 })
  }

  return [...lowerEdge, ...upperEdge.reverse()]
}

export function createTechnicalPlanGeometry(input: TechnicalPlanInput): TechnicalPlanGeometry {
  const { configuration, layout, wallContour } = input
  const endGap = getEndGap(configuration)
  if (configuration.height <= 2 * endGap) {
    throw new Error('Die Fassadenhöhe ist für den gewählten oberen und unteren Montagespalt zu gering.')
  }
  if (!layout.isValid || layout.positions.length !== layout.profileCount || layout.profileCount === 0) {
    throw new Error('Für den technischen Plan wird eine gültige Profilanordnung benötigt.')
  }

  const facadeWidth = configuration.width
  const facadeHeight = configuration.height
  const wallOutline = wallContour
    ? wallContour.points.map((point) => ({
      x: point.x - wallContour.width / 2,
      y: point.y - wallContour.height / 2,
    }))
    : createRectangle(facadeWidth, facadeHeight)
  const placements: ProfilePlacement[] = input.placements ?? layout.positions.map((axisX, layoutIndex) => ({
    axisX,
    profile: configuration.profile,
    layoutIndex,
    isSwitchProfile: false,
  }))
  const profileOutlines = placements.map((placement) =>
    createProfileOutline(placement, configuration, wallContour),
  )
  const profileProjections = placements.map((placement, index): TechnicalPlanProfileProjection => {
    const xOffset = placement.axisX + (placement.profileOffsetX ?? 0)
    const contours = getProfileContours(placement.profile)
    const elevationOutline = profileOutlines[index]
    const elevationContours = contours.map((contour) => {
    const bounds = contour.map((point) => getVerticalBoundsAtX(
      elevationOutline,
      xOffset + point.x,
    ))
    return {
      lower: contour.map((point, pointIndex) => ({
        x: xOffset + point.x,
        y: bounds[pointIndex].bottom,
      })),
      upper: contour.map((point, pointIndex) => ({
        x: xOffset + point.x,
        y: bounds[pointIndex].top,
      })),
    }
    })
    return {
    sections: contours.map((contour) => contour.map((point) => ({
      x: xOffset + point.x,
      y: getProfileDepthCoordinate(placement.profile, point.y)
        + (placement.depthOffset ?? 0),
    }))),
    elevationContours,
    extrusionEdges: contours.flatMap((contour) => contour.map((point) => {
      const bounds = getVerticalBoundsAtX(elevationOutline, xOffset + point.x)
      return { x: xOffset + point.x, bottom: bounds.bottom, top: bounds.top }
    })),
    }
  })
  const masonryProjections = createMasonryProjections(input, wallOutline)
  const allFrontPoints = [
    ...wallOutline,
    ...profileOutlines.flat(),
    ...masonryProjections.flatMap((part) => part.outline),
  ]
  const frontBounds = getBounds(allFrontPoints)
  const profileDepths = profileProjections.flatMap((profile) =>
    profile.sections.flatMap((section) => section.map((point) => point.y)),
  )
  const masonryDepths = masonryProjections.flatMap((part) => [part.depthStart, part.depthEnd])
  const depthBounds = {
    minimum: Math.min(0, ...profileDepths, ...masonryDepths),
    maximum: Math.max(0, ...profileDepths, ...masonryDepths),
  }
  const frontWidth = frontBounds.maximumX - frontBounds.minimumX
  const frontHeight = frontBounds.maximumY - frontBounds.minimumY

  return {
    facadeWidth,
    facadeHeight,
    scaleDenominator: selectTechnicalPlanScale(
    frontWidth,
    frontHeight,
    TECHNICAL_PLAN_DRAWING_AREA.width,
    TECHNICAL_PLAN_DRAWING_AREA.height,
    depthBounds.maximum - depthBounds.minimum,
    ),
    wallOutline,
    profileOutlines,
    profileProjections,
    masonryProjections,
    depthBounds,
    frontBounds,
  }
}
