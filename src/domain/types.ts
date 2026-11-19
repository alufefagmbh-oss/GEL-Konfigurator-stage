export interface Point2D {
  x: number
  y: number
}

export interface ProfileContour {
  points: Point2D[]
  area: number
}

export interface ProfileDefinition {
  name: string
  source: 'example' | 'dxf' | 'standard'
  id?: string
  width: number
  depth: number
  leftEndX?: number
  rightEndX?: number
  nominalSpacing?: number
  contours: ProfileContour[]
}

export interface WallContour {
  name: string
  points: Point2D[]
  width: number
  height: number
}

export interface FacadeConfiguration {
  width: number
  height: number
  endGap?: number
  profileColor: string
  profile: ProfileDefinition
  facadeEnds?: FacadeEndSelections
  profileMix?: ProfileMixConfiguration
  masonryView?: MasonryViewConfiguration
  ukRailView?: UkRailViewConfiguration
}

export type ProfileMixMode = 'single' | 'module' | 'percent'

export interface ProfileMixConfiguration {
  mode: ProfileMixMode
  module: string[]
  percentages: Record<string, number>
  seed: number
}

export interface UkRailViewConfiguration {
  enabled: boolean
  mountingMethod?: UkRailMountingMethod
  holeDiameter?: number
  plasticBlockDepth?: number
  connectorMaxSpacing?: number
}

export type UkRailMountingMethod = 'direct-to-wall' | 'aluminum-substructure'

export interface UkRailPlacement {
  startX: number
  endX: number
  centerHeight: number
}

export interface UkRailFixingPlacement {
  x: number
  centerHeight: number
}

export interface UkRailProfile {
  name: string
  contours: ProfileContour[]
  depth: number
  height: number
  screwHeadPlaneDepth: number
  profileSideDepth: number
  centerAxisHeight: number
}

export interface UkAngleProfile {
  name: string
  contours: ProfileContour[]
  width: number
  depth: number
  centerAxisX: number
}

export interface SupportRailProfile {
  name: string
  contours: ProfileContour[]
  depth: number
  height: number
  supportHeight: number
}

export interface SupportRailCut {
  offset: number
  slope: number
}

export interface SupportRailPiece {
  origin: Point2D
  direction: Point2D
  normal: Point2D
  startCut: SupportRailCut
  endCut: SupportRailCut
  maximumLength: number
}

export interface UkAnglePlacement {
  centerX: number
  startHeight: number
  endHeight: number
  mirrored?: boolean
}

export interface UkAngleConnectorPlacement {
  centerX: number
  centerHeight: number
  frontContactDepth: number
}

export interface SpidiConnectorBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export interface SquareTimberPlacement {
  x: number
  width: number
  depth: number
  bottom: number
  top: number
  holeHeights: number[]
}

export interface UkMountingExportData {
  mountingMethod: UkRailMountingMethod
  holeDiameter: number
  plasticBlockDepth: number
  squareTimbers: SquareTimberPlacement[]
  fixings: UkRailFixingPlacement[]
  angleProfile: UkAngleProfile | null
  anglePlacements: UkAnglePlacement[]
  connectorPlacements: UkAngleConnectorPlacement[]
  connectorBounds: SpidiConnectorBounds | null
  connectorLength: number | null
  supportRailProfile: SupportRailProfile | null
  supportRailPieces: SupportRailPiece[]
  directMountClearance: number
  remainingWallClearance: number
}

export interface MasonryViewConfiguration {
  enabled: boolean
  facadeOffset: number
  facadeDepth: number
  color: string
  transparency: number
  topEnabled: boolean
  topHeight: number
  topDepth: number
  sideEnabled: boolean
  sideWidth: number
  sideDepth: number
  bottomEnabled: boolean
  bottomType: 'wall' | 'floor'
  bottomWallHeight: number
  bottomWallDepth: number
  floorDepth: number
  floorThickness: number
  floorMaterial: string
}

export type FacadeEndFinish = 'high' | 'low'

export interface FacadeEndSelections {
  left: FacadeEndFinish
  right: FacadeEndFinish
}

export interface ProfilePlacement {
  axisX: number
  profile: ProfileDefinition
  leftTrimX?: number
  rightTrimX?: number
  profileOffsetX?: number
  depthOffset?: number
  layoutIndex: number
  isSwitchProfile: boolean
}

export type ProfileDisplayMode = 'facadeColor' | 'info'

export interface FacadeLayout {
  isValid: boolean
  error: string
  dimensionsValid: boolean
  profileCount: number
  axisSpacing: number
  minimumSpacing: number
  maximumSpacing: number
  nominalSpacing: number
  spacings: number[]
  spacingDeviations: number[]
  adjustedSpacingCount: number
  totalCorrection: number
  rightEdgeDeviation: number
  method: 'nominal' | 'compress' | 'stretch' | 'unavailable'
  positions: number[]
}

export type CameraProjection = 'perspective' | 'orthographic'
