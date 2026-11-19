import { describe, expect, it } from 'vitest'
import { FLOOR_PATTERN_MATERIALS, getFloorMaterialColor, getFloorMaterialName, isFloorMaterial } from './floorMaterials'

describe('floor materials', () => {
  it('provides the requested built-in ground patterns', () => {
    expect(FLOOR_PATTERN_MATERIALS.map(({ name }) => name)).toEqual(['Gras', 'Schotter', 'Stein', 'Beton'])
    expect(FLOOR_PATTERN_MATERIALS.every(({ id }) => isFloorMaterial(id))).toBe(true)
  })

  it('recognizes RAL options and rejects unknown material identifiers', () => {
    expect(isFloorMaterial('ral:RAL 7035')).toBe(true)
    expect(getFloorMaterialName('ral:RAL 7035')).toContain('lichtgrau')
    expect(getFloorMaterialColor('ral:RAL 7035')).toBe('#CBD0CC')
    expect(isFloorMaterial('ral:RAL 0000')).toBe(false)
    expect(isFloorMaterial('pattern:unknown')).toBe(false)
  })
})
