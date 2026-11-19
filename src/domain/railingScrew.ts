import { COUNTERSINK_RADIUS, PROFILE_FLOOR_HEIGHT } from './railingProfile'
import type { SlabPoint } from './concreteSlab'
import type { ProfilePart } from './railingProfile'

export const RAILING_SCREW_LENGTH = 105
export const RAILING_SCREW_RADIUS = 5
export const RAILING_SCREW_HEAD_HEIGHT = COUNTERSINK_RADIUS - RAILING_SCREW_RADIUS

export interface RailingScrewPlacement {
  x: number
  y: number
  headHeight: number
}

export function railingScrewPlacements(parts: ProfilePart[], thickness: number): RailingScrewPlacement[] {
  return parts.flatMap((part) => part.holes.map((hole: SlabPoint) => ({
    x: hole.x,
    y: hole.y,
    headHeight: thickness + PROFILE_FLOOR_HEIGHT,
  })))
}
