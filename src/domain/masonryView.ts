import type { MasonryViewConfiguration } from './types'

export const DEFAULT_MASONRY_VIEW: MasonryViewConfiguration = {
  enabled: false,
  facadeOffset: 200,
  facadeDepth: 200,
  color: '#F1ECE1',
  transparency: 0,
  topEnabled: false,
  topHeight: 300,
  topDepth: 200,
  sideEnabled: false,
  sideWidth: 300,
  sideDepth: 200,
  bottomEnabled: false,
  bottomType: 'wall',
  bottomWallHeight: 300,
  bottomWallDepth: 200,
  floorDepth: 500,
  floorThickness: 100,
  floorMaterial: 'pattern:concrete',
}

export function getFloorWidth(width: number, options: Pick<MasonryViewConfiguration, 'sideEnabled' | 'sideWidth'>): number {
  return width + (options.sideEnabled ? options.sideWidth * 2 : 0)
}
