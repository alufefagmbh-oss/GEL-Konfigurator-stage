export interface SpidiVariant {
  length: number
  minGap: number
  maxGap: number
}

// Einsatzbereich je Spidi-Länge: Abstand Schienenhinterkante bis Mauer, von einschließlich bis ausschließlich.
export const SPIDI_VARIANTS: readonly SpidiVariant[] = [
  { length: 65, minGap: 74, maxGap: 94 },
  { length: 85, minGap: 94, maxGap: 119 },
  { length: 110, minGap: 119, maxGap: 144 },
  { length: 135, minGap: 144, maxGap: 169 },
  { length: 160, minGap: 169, maxGap: 194 },
  { length: 185, minGap: 194, maxGap: 219 },
  { length: 210, minGap: 219, maxGap: 244 },
]

export const SPIDI_MIN_GAP = SPIDI_VARIANTS[0].minGap
export const SPIDI_MAX_GAP = SPIDI_VARIANTS[SPIDI_VARIANTS.length - 1].maxGap

export function selectSpidiVariant(gap: number): SpidiVariant | null {
  if (!Number.isFinite(gap)) return null
  return SPIDI_VARIANTS.find((variant) => gap >= variant.minGap && gap < variant.maxGap) ?? null
}

export function getSpidiVariantUnavailableMessage(gap: number): string {
  const rounded = Math.round(gap * 10) / 10
  return `Hinweis: Bei ${rounded} mm Abstand zwischen Schienenhinterkante und Mauer ist kein Spidi-Maueranschlussteil verfügbar `
    + `(Einsatzbereich ${SPIDI_MIN_GAP} mm bis unter ${SPIDI_MAX_GAP} mm). Bitte den Abstand zur Fassadenebene anpassen.`
}
