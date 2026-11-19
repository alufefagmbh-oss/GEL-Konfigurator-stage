import { RAL_CLASSIC_COLORS } from './ralColors'

export const FLOOR_PATTERN_MATERIALS = [
  { id: 'pattern:grass', name: 'Gras', color: '#557b38' },
  { id: 'pattern:gravel', name: 'Schotter', color: '#99958a' },
  { id: 'pattern:stone', name: 'Stein', color: '#9d968a' },
  { id: 'pattern:concrete', name: 'Beton', color: '#a6a49e' },
] as const

export type FloorPatternMaterial = typeof FLOOR_PATTERN_MATERIALS[number]['id']

export function isFloorMaterial(value: string): boolean {
  if (FLOOR_PATTERN_MATERIALS.some((material) => material.id === value)) return true
  if (!value.startsWith('ral:')) return false
  return RAL_CLASSIC_COLORS.some((color) => `ral:${color.code}` === value)
}

export function getFloorMaterialName(value: string): string {
  const pattern = FLOOR_PATTERN_MATERIALS.find((material) => material.id === value)
  if (pattern) return pattern.name
  const ral = RAL_CLASSIC_COLORS.find((color) => `ral:${color.code}` === value)
  return ral ? `${ral.code} · ${ral.name.trim()}` : 'Unbekanntes Material'
}

export function getFloorMaterialColor(value: string): string {
  const pattern = FLOOR_PATTERN_MATERIALS.find((material) => material.id === value)
  if (pattern) return pattern.color
  return RAL_CLASSIC_COLORS.find((color) => `ral:${color.code}` === value)?.hex ?? '#a6a49e'
}
