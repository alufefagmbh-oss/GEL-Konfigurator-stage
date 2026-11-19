import { STANDARD_PROFILES, getStandardProfile } from './standardProfiles'
import type { StandardProfileId } from './standardProfiles'
import type { FacadeConfiguration, ProfileDefinition, ProfileMixConfiguration } from './types'

export const MIXABLE_PROFILE_IDS: readonly StandardProfileId[] = STANDARD_PROFILES.map((profile) => profile.id)

export const DEFAULT_PROFILE_MIX: ProfileMixConfiguration = {
  mode: 'single',
  module: ['even', 'even', 'cone', 'block16'],
  percentages: { even: 50, cone: 25, block16: 25 },
  seed: 1,
}

type MixInput = Pick<FacadeConfiguration, 'profile' | 'profileMix'>

function isKnownId(id: string): id is StandardProfileId {
  return (MIXABLE_PROFILE_IDS as readonly string[]).includes(id)
}

function mulberry32(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function getPercentageTotal(mix: ProfileMixConfiguration): number {
  return MIXABLE_PROFILE_IDS.reduce((sum, id) => sum + Math.max(0, mix.percentages[id] ?? 0), 0)
}

export function getProfileMixError(configuration: MixInput): string | null {
  const mix = configuration.profileMix
  if (!mix || mix.mode === 'single') return null
  if (mix.mode === 'module') {
    if (mix.module.length === 0) return 'Das Profilmodul ist leer. Fügen Sie mindestens ein Profil hinzu.'
    if (mix.module.some((id) => !isKnownId(id))) return 'Das Profilmodul enthält ein unbekanntes Profil.'
    return null
  }
  if (Math.abs(getPercentageTotal(mix) - 100) > 1e-6) {
    return `Die Prozentwerte der Profilmischung müssen 100 % ergeben (aktuell ${Math.round(getPercentageTotal(mix) * 100) / 100} %).`
  }
  return null
}

export function isProfileMixActive(configuration: MixInput): boolean {
  return configuration.profileMix !== undefined && configuration.profileMix.mode !== 'single'
}

export function getProfileMixIds(configuration: MixInput): string[] {
  const mix = configuration.profileMix
  if (!mix || mix.mode === 'single') return [configuration.profile.id ?? configuration.profile.name]
  if (mix.mode === 'module') return [...new Set(mix.module)]
  return MIXABLE_PROFILE_IDS.filter((id) => (mix.percentages[id] ?? 0) > 0)
}

function distributeCounts(percentages: Record<string, number>, count: number): StandardProfileId[] {
  const entries = MIXABLE_PROFILE_IDS
    .map((id) => ({ id, share: Math.max(0, percentages[id] ?? 0) }))
    .filter((entry) => entry.share > 0)
  const total = entries.reduce((sum, entry) => sum + entry.share, 0)
  const quotas = entries.map((entry) => {
    const exact = entry.share / total * count
    return { id: entry.id, whole: Math.floor(exact), fraction: exact - Math.floor(exact) }
  })
  let missing = count - quotas.reduce((sum, quota) => sum + quota.whole, 0)
  const byFraction = [...quotas].sort((a, b) => b.fraction - a.fraction)
  for (const quota of byFraction) {
    if (missing <= 0) break
    quota.whole += 1
    missing -= 1
  }
  return quotas.flatMap((quota) => Array.from({ length: quota.whole }, () => quota.id))
}

export function getProfileSequenceIds(configuration: MixInput, count: number): string[] {
  const mix = configuration.profileMix
  const baseId = configuration.profile.id ?? configuration.profile.name
  if (!mix || mix.mode === 'single' || getProfileMixError(configuration)) {
    return Array.from({ length: count }, () => baseId)
  }
  if (mix.mode === 'module') {
    return Array.from({ length: count }, (_, index) => mix.module[index % mix.module.length])
  }

  const ids = distributeCounts(mix.percentages, count)
  const random = mulberry32(mix.seed)
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[ids[index], ids[other]] = [ids[other], ids[index]]
  }
  return ids
}

export function getProfileSequence(configuration: MixInput, count: number): ProfileDefinition[] {
  const baseId = configuration.profile.id
  return getProfileSequenceIds(configuration, count).map((id) =>
    id === baseId || !isKnownId(id) ? configuration.profile : getStandardProfile(id))
}
