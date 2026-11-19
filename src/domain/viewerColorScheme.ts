export const PROFILE_INFO_COLORS = {
  compressed: '#285598',
  stretched: '#173259',
  unchanged: '#e6e6e6',
  switch: '#d62828',
} as const

export const UK_INFO_COLORS = {
  rail: '#45C7C5',
  block: '#B8E6C3',
  angle: '#9BCFF5',
  connector: '#FF00FF',
  timber: '#C9A66B',
} as const

export const UK_CONNECTOR_FACADE_COLOR = '#C0C0C0'

export function getProfileInfoColor(
  spacingDeviation: number,
  isSwitchProfile: boolean,
): string {
  if (isSwitchProfile) return PROFILE_INFO_COLORS.switch
  if (spacingDeviation < -1e-7) return PROFILE_INFO_COLORS.compressed
  if (spacingDeviation > 1e-7) return PROFILE_INFO_COLORS.stretched
  return PROFILE_INFO_COLORS.unchanged
}
