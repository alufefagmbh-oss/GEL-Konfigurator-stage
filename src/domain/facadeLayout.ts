import type { FacadeConfiguration, FacadeLayout, ProfileDefinition } from './types'
import { getFacadeProfileArrangement, getProfileEndMarkerX } from './profileArrangement'
import { getProfileMixError, getProfileMixIds, getProfileSequence } from './profileMix'
import { getStandardProfile } from './standardProfiles'
import type { StandardProfileId } from './standardProfiles'
import { getHighHighSwitchProfile } from './switchProfiles'

const DEFAULT_NOMINAL_SPACING = 60
const SPACING_TOLERANCE = 2
const TOLERANCE = 1e-7

function invalidLayout(dimensionsValid: boolean, error: string, nominalSpacing: number): FacadeLayout {
  return {
    isValid: false,
    error,
    dimensionsValid,
    profileCount: 0,
    axisSpacing: 0,
    minimumSpacing: 0,
    maximumSpacing: 0,
    nominalSpacing,
    spacings: [],
    spacingDeviations: [],
    adjustedSpacingCount: 0,
    totalCorrection: 0,
    rightEdgeDeviation: 0,
    method: 'unavailable',
    positions: [],
  }
}

export function calculateFacadeLayout(
  configuration: Pick<FacadeConfiguration, 'width' | 'height' | 'profile' | 'facadeEnds' | 'profileMix'>,
): FacadeLayout {
  const { width, height, profile, facadeEnds } = configuration
  const requestedNominalSpacing = profile.nominalSpacing ?? DEFAULT_NOMINAL_SPACING
  const nominalSpacingIsValid = Number.isFinite(requestedNominalSpacing)
    && requestedNominalSpacing > SPACING_TOLERANCE
  const nominalSpacing = nominalSpacingIsValid ? requestedNominalSpacing : DEFAULT_NOMINAL_SPACING
  const dimensionsValid = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
  if (!dimensionsValid) {
    return invalidLayout(false, 'Fassadenbreite und -höhe müssen positive endliche Werte sein.', nominalSpacing)
  }
  if (!Number.isFinite(profile.width) || profile.width <= 0) {
    return invalidLayout(true, 'Die sichtbare Profilbreite muss ein positiver endlicher Wert sein.', nominalSpacing)
  }
  if (!nominalSpacingIsValid) {
    return invalidLayout(true, 'Das nominelle Achsmaß muss größer als die Rastertoleranz sein.', DEFAULT_NOMINAL_SPACING)
  }

  const isHighHigh = facadeEnds?.left === 'high' && facadeEnds.right === 'high'
  const isLowLow = facadeEnds?.left === 'low' && facadeEnds.right === 'low'
  const mixError = getProfileMixError(configuration)
  if (mixError) return invalidLayout(true, mixError, nominalSpacing)
  const mixIds = getProfileMixIds(configuration)
  const switchSourceIds = mixIds.filter((id) => id !== 'block16L')
  if (switchSourceIds.length === 0 && isLowLow) {
    return invalidLayout(true, 'Block 16L hat kein passendes Wechselprofil für „niedrig/niedrig“.', nominalSpacing)
  }
  if (switchSourceIds.length === 0 && isHighHigh) {
    return invalidLayout(true, 'Block 16L hat kein passendes Wechselprofil für „hoch/hoch“. Wählen Sie an mindestens einem Ende „niedrig“ oder mischen Sie ein weiteres Profil bei.', nominalSpacing)
  }
  const mixNominals = mixIds.map((id) =>
    (id === (profile.id ?? profile.name) ? profile : getStandardProfile(id as StandardProfileId)).nominalSpacing ?? DEFAULT_NOMINAL_SPACING)
  if (isHighHigh) {
    const unsupported = switchSourceIds.find((id) => !getHighHighSwitchProfile(id))
    if (unsupported) {
      return invalidLayout(true, `Für ${unsupported} ist kein passendes Wechselprofil für „hoch/hoch“ verfügbar.`, nominalSpacing)
    }
  }

  const fixedSpacings = isHighHigh ? [60, 60] : isLowLow ? [30, 30] : []
  const fixedSpacingSum = fixedSpacings.reduce((sum, spacing) => sum + spacing, 0)
  const averageNominal = mixNominals.reduce((sum, value) => sum + value, 0) / mixNominals.length

  interface Candidate {
    count: number
    sequence: ProfileDefinition[]
    leftMarkerX: number
    rightMarkerX: number
    requiredAxisSpan: number
    remainingSpan: number
    nominals: number[]
    difference: number
  }

  function evaluate(adjustableCount: number): Candidate {
    const sequence = getProfileSequence(configuration, fixedSpacings.length + adjustableCount + 1)
    const lastIndex = sequence.length - 1
    const first = getFacadeProfileArrangement(configuration, 0, sequence[0]).profile
    const last = getFacadeProfileArrangement(configuration, lastIndex, sequence[lastIndex]).profile
    const leftMarkerX = getProfileEndMarkerX(first, 'left')
    const rightMarkerX = getProfileEndMarkerX(last, 'right')
    const requiredAxisSpan = width + leftMarkerX - rightMarkerX
    const nominals = Array.from({ length: adjustableCount }, (_, offset) => {
      const index = fixedSpacings.length + offset
      const left = sequence[index].nominalSpacing ?? DEFAULT_NOMINAL_SPACING
      const right = sequence[index + 1].nominalSpacing ?? DEFAULT_NOMINAL_SPACING
      return (left + right) / 2
    })
    const remainingSpan = requiredAxisSpan - fixedSpacingSum
    const difference = remainingSpan - nominals.reduce((sum, value) => sum + value, 0)
    return { count: adjustableCount, sequence, leftMarkerX, rightMarkerX, requiredAxisSpan, remainingSpan, nominals, difference }
  }

  const probe = evaluate(1)
  if (!Number.isFinite(probe.requiredAxisSpan) || probe.requiredAxisSpan <= 0 || probe.remainingSpan <= 0) {
    return invalidLayout(true, 'Die Fassadenbreite ist für die gewählte Endausbildung zu klein.', nominalSpacing)
  }

  const estimate = Math.round(probe.remainingSpan / averageNominal)
  let best: Candidate | null = null
  for (let count = Math.max(1, estimate - 4); count <= estimate + 4; count += 1) {
    const candidate = evaluate(count)
    if (candidate.remainingSpan <= 0 || Math.abs(candidate.difference) > count * SPACING_TOLERANCE + TOLERANCE) continue
    if (!best || Math.abs(candidate.difference) <= Math.abs(best.difference) + TOLERANCE) best = candidate
  }
  if (!best) {
    return invalidLayout(
      true,
      `Für diese Fassadenbreite ist kein Raster mit Achsabständen zwischen ${nominalSpacing - SPACING_TOLERANCE} und ${nominalSpacing + SPACING_TOLERANCE} mm möglich.`,
      nominalSpacing,
    )
  }

  const { requiredAxisSpan, remainingSpan, leftMarkerX, rightMarkerX } = best
  const spacings = [...fixedSpacings, ...best.nominals]
  const nominalSpacings = [...fixedSpacings, ...best.nominals]
  let remainingCorrection = requiredAxisSpan - spacings.reduce((sum, spacing) => sum + spacing, 0)
  const correctionDirection = Math.sign(remainingCorrection)
  for (let index = spacings.length - 1; index >= fixedSpacings.length && Math.abs(remainingCorrection) > TOLERANCE; index -= 1) {
    const adjustment = Math.min(SPACING_TOLERANCE, Math.abs(remainingCorrection))
    spacings[index] += correctionDirection * adjustment
    remainingCorrection -= correctionDirection * adjustment
  }
  if (Math.abs(remainingCorrection) > TOLERANCE) {
    return invalidLayout(true, 'Die erforderliche Rasterkorrektur überschreitet den zulässigen Achsabstand.', nominalSpacing)
  }

  const positions = [-width / 2 - leftMarkerX]
  for (const spacing of spacings) positions.push(positions[positions.length - 1] + spacing)

  const totalCorrection = remainingSpan - best.nominals.reduce((sum, value) => sum + value, 0)
  const spacingDeviations = spacings.map((spacing, index) => spacing - nominalSpacings[index])
  const minimumSpacing = Math.min(...spacings)
  const maximumSpacing = Math.max(...spacings)
  const adjustedSpacingCount = spacingDeviations.filter((deviation) => Math.abs(deviation) > TOLERANCE).length
  const rightEdgeDeviation = positions[positions.length - 1] + rightMarkerX - width / 2

  return {
    isValid: true,
    error: '',
    dimensionsValid,
    profileCount: positions.length,
    axisSpacing: requiredAxisSpan / spacings.length,
    minimumSpacing,
    maximumSpacing,
    nominalSpacing,
    spacings,
    spacingDeviations,
    adjustedSpacingCount,
    totalCorrection,
    rightEdgeDeviation,
    method: totalCorrection < -TOLERANCE ? 'compress' : totalCorrection > TOLERANCE ? 'stretch' : 'nominal',
    positions: positions.map((value) => Math.abs(value) < TOLERANCE ? 0 : value),
  }
}

export function formatMillimeters(value: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(value)
}
