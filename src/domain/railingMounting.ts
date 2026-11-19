import type { StaticAssumptions } from './staticAssumptions'
import { GEL2001_TORBANDSCHRAUBE_AXIS_HEIGHT } from '../dxf/gel2001Profile'

export type RailingMounting = 'none' | '7A' | '7B'

export const STEEL_PLATE_THICKNESS = 10
export const STEEL_PLATE_MARGIN = 30
export const STEEL_PLATE_HEIGHT = 135 + STEEL_PLATE_MARGIN * 2
export const SIDE_FIXING_AXIS_HEIGHT = GEL2001_TORBANDSCHRAUBE_AXIS_HEIGHT
export const SIDE_FIXING_HOLE_DIAMETER = 11
export const SIDE_FIXING_EDGE_DISTANCE = 50
export const SIDE_FIXING_BOLT_LENGTH = 30
export const SIDE_FIXING_NUT_CLEARANCE = 1
export const SIDE_FIXING_NUT_THICKNESS = 8
export const SIDE_FIXING_BOLT_HEAD_DIAMETER = 25
export const SIDE_FIXING_BOLT_HEAD_HEIGHT = 5
export const SIDE_FIXING_BOLT_HEAD_INSET = 12.7
export const SIDE_FIXING_DESCRIPTION = 'Torbandschraube DIN 603 M10×30,0, Kopf Ø 25,0 × 5,0 mm mit Mutter DIN 934 M10'

export function maximumSideFixingSpacing(assumptions: StaticAssumptions): number {
  if (assumptions.usage === 'private') return assumptions.location === 'inside' ? 740 : 400
  return assumptions.location === 'inside' ? 370 : 270
}
