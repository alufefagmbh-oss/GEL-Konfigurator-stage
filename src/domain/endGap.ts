import type { FacadeConfiguration } from './types'

export const DEFAULT_END_GAP = 10
export const MAX_END_GAP = 25

export function getEndGap(configuration: Pick<FacadeConfiguration, 'endGap'>): number {
  const endGap = configuration.endGap ?? DEFAULT_END_GAP
  if (!Number.isFinite(endGap) || endGap < 0 || endGap > MAX_END_GAP) {
    throw new Error(`Der Montagespalt muss zwischen 0 und ${MAX_END_GAP} mm liegen.`)
  }
  return endGap
}
