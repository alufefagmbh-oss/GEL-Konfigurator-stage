export interface StaticAssumptions {
  location: 'inside' | 'outside'
  usage: 'public' | 'private'
}

export const DEFAULT_STATIC_ASSUMPTIONS: StaticAssumptions = { location: 'inside', usage: 'private' }

export function staticLoads(assumptions: StaticAssumptions): { traffic: number; wind: number } {
  return {
    traffic: assumptions.usage === 'private' ? 0.5 : 1,
    wind: assumptions.location === 'inside' ? 0 : 1,
  }
}
