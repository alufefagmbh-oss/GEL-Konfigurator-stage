import { calculateSlabContour, parseSlabAngle, parseSlabDimension } from './concreteSlab'
import type { SlabSegment } from './concreteSlab'
import type { StaticAssumptions } from './staticAssumptions'
import type { RailingMounting } from './railingMounting'
import { timestampedFileName } from './exportFileName'
import {
  DEFAULT_GLASS_PANEL_GAP,
  DEFAULT_MAX_GLASS_PANEL_WIDTH,
  GLASS_BOTTOM_HEIGHT,
  GLASS_HEIGHT,
  GLASS_PANE_THICKNESS,
} from './railingAccessories'

export interface GlassConfiguration {
  height: number
  paneThickness: number
  maxPanelWidth: number
  panelGap: number
  fixing: 'system' | 'none'
}

export const DEFAULT_GLASS_CONFIGURATION: GlassConfiguration = {
  height: GLASS_HEIGHT,
  paneThickness: GLASS_PANE_THICKNESS,
  maxPanelWidth: DEFAULT_MAX_GLASS_PANEL_WIDTH,
  panelGap: DEFAULT_GLASS_PANEL_GAP,
  fixing: 'system',
}

export interface SlabProject {
  projectName: string
  depth: number
  thickness: number
  segments: SlabSegment[]
  railing?: { mounting: RailingMounting; offset: number }
  glass?: GlassConfiguration
  staticAssumptions?: StaticAssumptions
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseSlabProject(contents: string): SlabProject {
  let value: unknown
  try {
    value = JSON.parse(contents)
  } catch {
    throw new Error('Die Projektdatei enthält kein gültiges JSON.')
  }
  if (!isRecord(value) || value.format !== 'gelaender-project' || value.version !== 1
    || typeof value.projectName !== 'string' || !value.projectName.trim()
    || typeof value.depth !== 'number' || parseSlabDimension(String(value.depth)) === null
    || typeof value.thickness !== 'number' || parseSlabDimension(String(value.thickness)) === null
    || !Array.isArray(value.segments) || value.segments.length === 0) {
    throw new Error('Die Datei ist kein unterstütztes Geländerprojekt oder enthält ungültige Projektdaten.')
  }
  const segments: SlabSegment[] = value.segments.map((segment: unknown) => {
    if (!isRecord(segment) || typeof segment.length !== 'number'
      || parseSlabDimension(String(segment.length)) === null || typeof segment.angle !== 'number'
      || parseSlabAngle(String(segment.angle)) === null) {
      throw new Error('Die Projektdatei enthält ungültige Abschnittsmaße oder Winkel.')
    }
    return { length: segment.length, angle: segment.angle }
  })
  if (segments[0].angle !== 180) throw new Error('Der erste Abschnitt darf keinen Anschlusswinkel enthalten.')
  const contour = calculateSlabContour(segments, value.depth)
  if (contour.error) throw new Error(`Ungültige Betondecke in der Projektdatei: ${contour.error}`)
  let railing: SlabProject['railing']
  if (value.railing !== undefined) {
    if (!isRecord(value.railing) || (value.railing.mounting !== 'none' && value.railing.mounting !== '7A' && value.railing.mounting !== '7B')
      || typeof value.railing.offset !== 'number' || !Number.isFinite(value.railing.offset)
      || value.railing.offset < 0 || value.railing.offset > 100000) {
      throw new Error('Die Geländerkonfiguration ist ungültig.')
    }
    railing = { mounting: value.railing.mounting, offset: value.railing.offset }
  }
  let glass = DEFAULT_GLASS_CONFIGURATION
  if (value.glass !== undefined) {
    const maxPanelWidth = value.glass && isRecord(value.glass) && value.glass.maxPanelWidth === undefined
      ? DEFAULT_GLASS_CONFIGURATION.maxPanelWidth
      : isRecord(value.glass) ? value.glass.maxPanelWidth : undefined
    const panelGap = value.glass && isRecord(value.glass) && value.glass.panelGap === undefined
      ? DEFAULT_GLASS_CONFIGURATION.panelGap
      : isRecord(value.glass) ? value.glass.panelGap : undefined
    if (!isRecord(value.glass) || typeof value.glass.height !== 'number'
      || parseSlabDimension(String(value.glass.height)) === null
      || value.glass.height <= GLASS_BOTTOM_HEIGHT
      || typeof value.glass.paneThickness !== 'number'
      || parseSlabDimension(String(value.glass.paneThickness)) === null
      || typeof maxPanelWidth !== 'number' || parseSlabDimension(String(maxPanelWidth)) === null
      || typeof panelGap !== 'number' || !Number.isFinite(panelGap) || panelGap < 0 || panelGap > 100000
      || (value.glass.fixing !== 'system' && value.glass.fixing !== 'none')) {
      throw new Error('Die Glaskonfiguration ist ungültig.')
    }
    glass = {
      height: value.glass.height,
      paneThickness: value.glass.paneThickness,
      maxPanelWidth,
      panelGap,
      fixing: value.glass.fixing,
    }
  }
  let staticAssumptions: StaticAssumptions | undefined
  if (value.staticAssumptions !== undefined) {
    if (!isRecord(value.staticAssumptions)
      || (value.staticAssumptions.location !== 'inside' && value.staticAssumptions.location !== 'outside')
      || (value.staticAssumptions.usage !== 'public' && value.staticAssumptions.usage !== 'private')) {
      throw new Error('Die statischen Annahmen sind ungültig.')
    }
    staticAssumptions = { location: value.staticAssumptions.location, usage: value.staticAssumptions.usage }
  }
  return { projectName: value.projectName, depth: value.depth, thickness: value.thickness, segments, glass, ...(railing ? { railing } : {}), ...(staticAssumptions ? { staticAssumptions } : {}) }
}

export function serializeSlabProject(project: SlabProject): string {
  return JSON.stringify({ format: 'gelaender-project', version: 1, ...project }, null, 2)
}

export function slabFileName(name: string, extension: 'gelaender.json' | 'step', date = new Date()): string {
  return timestampedFileName(name, extension, 'Gelaenderprojekt', date)
}
