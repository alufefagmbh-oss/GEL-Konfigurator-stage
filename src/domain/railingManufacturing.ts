import { GEL2001_SEAL_LIPS } from './railingAccessories'
import type { RailingAccessoryLayout } from './railingAccessories'
import { COUNTERSINK_RADIUS, HOLE_RADIUS, profilePoint, profileStockLength, sideFixingWallBounds } from './railingProfile'
import type { ProfilePart } from './railingProfile'
import { railingScrewPlacements } from './railingScrew'
import { RAILING_SCREW_DESCRIPTION } from './railingPricing'
import { SIDE_FIXING_AXIS_HEIGHT, SIDE_FIXING_DESCRIPTION, SIDE_FIXING_HOLE_DIAMETER, type RailingMounting } from './railingMounting'
import { formatMeasurement } from './measurementFormat'

export interface ManufacturingProfile {
  position: string
  quantity: number
  contourStart: { x: number; y: number }
  contourEnd: { x: number; y: number }
  stockLength: number
  width: number
  startAtZero: number
  startAtWidth: number
  endAtZero: number
  endAtWidth: number
  startAngle: number
  endAngle: number
  section: { x: number; y: number }[]
  holes: { longitudinal: number; lateral: number }[]
}

export interface ManufacturingItem {
  position: string
  quantity: number
  unit?: 'Stk.' | 'lfm'
  description: string
  length: number | null
  note: string
}

export interface ManufacturingData {
  items: ManufacturingItem[]
  profiles: ManufacturingProfile[]
  mounting?: RailingMounting
}

export function profileManufacturingData(part: ProfilePart, position: string, mounting: RailingMounting = '7B'): ManufacturingProfile {
  const width = Math.max(...part.section.map((p) => p.x))
  const minX = Math.min(...part.section.map((p) => p.x))
  if (Math.abs(minX) > 1e-7 || width <= 0) throw new Error('Das Profil benötigt eine gültige Bezugskante bei x = 0.')
  const normal = { x: part.direction.y, y: -part.direction.x }
  const sideWall = mounting === '7A' ? sideFixingWallBounds(part.section) : null
  const project = (point: { x: number; y: number }) =>
    (point.x - part.start.x) * part.direction.x + (point.y - part.start.y) * part.direction.y
  const edge = (x: number, end: boolean) => project(profilePoint(part, { x, y: 0 }, end))
  const startZero = edge(0, false)
  const startWidth = edge(width, false)
  const start = Math.min(startZero, startWidth)
  const holes = part.holes.map((hole) => ({
    longitudinal: project(hole) - start,
    lateral: (hole.x - part.start.x) * normal.x + (hole.y - part.start.y) * normal.y - part.offset
      + (sideWall ? sideWall.outer - width : 0),
  }))
  return {
    position, quantity: 1, contourStart: { ...part.start }, contourEnd: { ...part.end },
    stockLength: profileStockLength(part), width,
    startAtZero: startZero - start, startAtWidth: startWidth - start,
    endAtZero: edge(0, true) - start, endAtWidth: edge(width, true) - start,
    startAngle: Math.atan2(startWidth - startZero, width) * 180 / Math.PI,
    endAngle: Math.atan2(edge(width, true) - edge(0, true), width) * 180 / Math.PI,
    section: part.section.map((point) => ({ ...point })),
    holes,
  }
}

export function createRailingManufacturingData(profiles: ProfilePart[], accessories: RailingAccessoryLayout, mounting: RailingMounting = '7B'): ManufacturingData {
  const details = profiles.map((part, index) => profileManufacturingData(part, `P${String(index + 1).padStart(3, '0')}`, mounting))
  const profileGroups = new Map<string, { item: ManufacturingItem; positions: string[] }>()
  for (const profile of details) {
    const key = [profile.stockLength, profile.width, profile.startAtZero, profile.startAtWidth,
      profile.endAtZero, profile.endAtWidth, ...profile.holes.flatMap((hole) => [hole.longitudinal, hole.lateral])]
      .map((value) => value.toFixed(6)).join('|')
    const existing = profileGroups.get(key)
    if (existing) { existing.item.quantity += 1; existing.positions.push(profile.position) }
    else profileGroups.set(key, {
      item: { position: '', quantity: 1, description: 'GEL2001 Geländerschuh', length: profile.stockLength, note: '' },
      positions: [profile.position],
    })
  }
  const items: ManufacturingItem[] = []
  for (const { item, positions } of profileGroups.values()) {
    item.position = ''
    item.note = `Profile ${positions.join(', ')}`
    items.push(item)
  }
  const grouped = new Map<string, ManufacturingItem>()
  const addSealLips = (parts: ProfilePart[]) => {
    for (const part of parts) {
      const side = GEL2001_SEAL_LIPS.indexOf(part.section)
      if (side < 0) throw new Error('Die Kontur für Dichtlippen ist nicht zugeordnet.')
      const label = `Dichtlippe ${side + 1}`
      const length = profileStockLength(part) / 1000
      const existing = grouped.get(label)
      if (existing) existing.quantity += length
      else grouped.set(label, {
        position: '', quantity: length, unit: 'lfm', description: label, length: null,
        note: 'Aufmaß und Zuschnitt auf der Baustelle.',
      })
    }
  }
  if (accessories.glassShoes.length > 0) {
    items.push({ position: '', quantity: accessories.glassShoes.length, description: 'Glasschuhe', length: null, note: '' })
  }
  if (accessories.clampWedges.length > 0) {
    items.push({ position: '', quantity: accessories.clampWedges.length, description: 'Klemmleisten', length: null, note: '' })
  }
  addSealLips(accessories.sealLips)
  for (const item of grouped.values()) {
    items.push(item)
  }
  const screwCount = mounting === '7A'
    ? profiles.reduce((sum, part) => sum + part.holes.length, 0)
    : railingScrewPlacements(profiles, 0).length
  if (screwCount > 0) items.push({
    position: '',
    quantity: screwCount,
    description: mounting === '7A' ? SIDE_FIXING_DESCRIPTION : RAILING_SCREW_DESCRIPTION,
    length: null,
    note: mounting === '7A'
      ? `Einseitige Bohrung Ø ${formatMeasurement(SIDE_FIXING_HOLE_DIAMETER)} mm, Achse ${formatMeasurement(SIDE_FIXING_AXIS_HEIGHT)} mm über Profilunterkante.`
      : 'Hersteller, Gewinde und Befestigungszulassung nicht festgelegt.',
  })
  items.forEach((item, index) => { item.position = String(index + 1).padStart(3, '0') })
  return { items, profiles: details, mounting }
}

export function manufacturingHoleDescription(mounting: RailingMounting = '7B'): string {
  return mounting === '7A'
    ? `Einseitige Bohrung Ø ${formatMeasurement(SIDE_FIXING_HOLE_DIAMETER)} mm in der blechseitigen Profilwand; Achse ${formatMeasurement(SIDE_FIXING_AXIS_HEIGHT)} mm über Profilunterkante.`
    : `Durchgang Ø ${formatMeasurement(HOLE_RADIUS * 2)} mm; Senkung Ø ${formatMeasurement(COUNTERSINK_RADIUS * 2)} mm / 90° von oben`
}
