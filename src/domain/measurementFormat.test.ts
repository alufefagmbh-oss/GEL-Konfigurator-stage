import { describe, expect, it } from 'vitest'
import { formatMeasurement } from './measurementFormat'

describe('measurement formatting', () => {
  it('shows every configured measurement with exactly one decimal place', () => {
    expect(formatMeasurement(3000)).toBe('3.000,0')
    expect(formatMeasurement(61.009450501442)).toBe('61,0')
    expect(formatMeasurement(-0.0000001)).toBe('0,0')
  })
})
