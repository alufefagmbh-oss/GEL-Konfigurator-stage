import { it } from 'vitest'
import { calculateFacadeLayout } from './facadeLayout'
import { getStandardProfile } from './standardProfiles'

it('repro', () => {
  for (const width of [8700, 8701, 8650, 8800, 3000]) {
    const layout = calculateFacadeLayout({
      width,
      height: 3790,
      profile: getStandardProfile('even'),
      facadeEnds: { left: 'high', right: 'low' },
      profileMix: { mode: 'module', module: ['block16', 'block16L', 'block16'], percentages: {}, seed: 1 },
    })
    console.log(width, layout.isValid, layout.error, layout.profileCount)
  }
})
