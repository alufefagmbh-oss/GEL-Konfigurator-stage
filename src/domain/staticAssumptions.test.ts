import { describe, expect, it } from 'vitest'
import { staticLoads } from './staticAssumptions'

describe('Statische Lastannahmen', () => {
  it.each([
    [{ location: 'inside', usage: 'private' }, { traffic: 0.5, wind: 0 }],
    [{ location: 'outside', usage: 'private' }, { traffic: 0.5, wind: 1 }],
    [{ location: 'inside', usage: 'public' }, { traffic: 1, wind: 0 }],
    [{ location: 'outside', usage: 'public' }, { traffic: 1, wind: 1 }],
  ] as const)('maps %s to %s kN', (assumptions, expected) => {
    expect(staticLoads(assumptions)).toEqual(expected)
  })
})
