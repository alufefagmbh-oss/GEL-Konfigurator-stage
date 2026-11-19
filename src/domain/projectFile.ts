import type { FacadeConfiguration, ProfileDisplayMode, WallContour } from './types'

const PROJECT_FORMAT = 'linarte-facade-project'
const PROJECT_VERSION = 1

export interface FacadeProject {
  projectName: string
  configuration: FacadeConfiguration
  wallContour: WallContour | null
  profileDisplayMode: ProfileDisplayMode
}

interface ProjectDocument extends FacadeProject {
  format: typeof PROJECT_FORMAT
  version: typeof PROJECT_VERSION
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPoint(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

function isContour(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNumber(value.area)
    && Array.isArray(value.points)
    && value.points.length >= 3
    && value.points.every(isPoint)
}

function isProfile(value: unknown): boolean {
  return isRecord(value)
    && typeof value.name === 'string'
    && ['example', 'dxf', 'standard'].includes(String(value.source))
    && isFiniteNumber(value.width)
    && isFiniteNumber(value.depth)
    && Array.isArray(value.contours)
    && value.contours.length > 0
    && value.contours.every(isContour)
    && (value.id === undefined || typeof value.id === 'string')
    && (value.leftEndX === undefined || isFiniteNumber(value.leftEndX))
    && (value.rightEndX === undefined || isFiniteNumber(value.rightEndX))
    && (value.nominalSpacing === undefined || isFiniteNumber(value.nominalSpacing))
}

function isMasonryView(value: unknown): boolean {
  if (value === undefined) return true
  return isRecord(value)
    && typeof value.enabled === 'boolean'
    && isFiniteNumber(value.facadeOffset)
    && isFiniteNumber(value.facadeDepth)
    && typeof value.color === 'string'
    && isFiniteNumber(value.transparency)
    && typeof value.topEnabled === 'boolean'
    && isFiniteNumber(value.topHeight)
    && isFiniteNumber(value.topDepth)
    && typeof value.sideEnabled === 'boolean'
    && isFiniteNumber(value.sideWidth)
    && isFiniteNumber(value.sideDepth)
    && typeof value.bottomEnabled === 'boolean'
    && (value.bottomType === 'wall' || value.bottomType === 'floor')
    && isFiniteNumber(value.bottomWallHeight)
    && isFiniteNumber(value.bottomWallDepth)
    && isFiniteNumber(value.floorDepth)
    && isFiniteNumber(value.floorThickness)
    && typeof value.floorMaterial === 'string'
}

function isUkRailView(value: unknown): boolean {
  return value === undefined || isRecord(value)
    && typeof value.enabled === 'boolean'
    && (value.mountingMethod === undefined
      || value.mountingMethod === 'direct-to-wall'
      || value.mountingMethod === 'aluminum-substructure')
    && (value.holeDiameter === undefined
      || isFiniteNumber(value.holeDiameter) && value.holeDiameter > 0 && value.holeDiameter < 58)
    && (value.plasticBlockDepth === undefined
      || isFiniteNumber(value.plasticBlockDepth) && value.plasticBlockDepth > 0)
    && (value.connectorMaxSpacing === undefined
      || isFiniteNumber(value.connectorMaxSpacing) && value.connectorMaxSpacing > 0 && value.connectorMaxSpacing <= 2000)
}

export function validateProfileMixShape(value: unknown): boolean {
  return value === undefined || isRecord(value)
    && ['single', 'module', 'percent'].includes(String(value.mode))
    && Array.isArray(value.module) && value.module.every((entry) => typeof entry === 'string')
    && isRecord(value.percentages) && Object.values(value.percentages).every(isFiniteNumber)
    && isFiniteNumber(value.seed)
}

function isConfiguration(value: unknown): value is FacadeConfiguration {
  return isRecord(value)
    && validateProfileMixShape(value.profileMix)
    && isFiniteNumber(value.width)
    && isFiniteNumber(value.height)
    && (value.endGap === undefined || isFiniteNumber(value.endGap))
    && typeof value.profileColor === 'string'
    && isProfile(value.profile)
    && (value.facadeEnds === undefined
      || (isRecord(value.facadeEnds)
        && ['high', 'low'].includes(String(value.facadeEnds.left))
        && ['high', 'low'].includes(String(value.facadeEnds.right))))
    && isMasonryView(value.masonryView)
    && isUkRailView(value.ukRailView)
}

function isWallContour(value: unknown): value is WallContour | null {
  if (value === null) return true
  return isRecord(value)
    && typeof value.name === 'string'
    && isFiniteNumber(value.width)
    && isFiniteNumber(value.height)
    && Array.isArray(value.points)
    && value.points.length >= 3
    && value.points.every(isPoint)
}

export function serializeProjectFile(project: FacadeProject): string {
  const document: ProjectDocument = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    ...project,
  }
  return JSON.stringify(document, null, 2)
}

export function parseProjectFile(contents: string): FacadeProject {
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw new Error('Die Projektdatei enthält kein gültiges JSON.')
  }

  if (!isRecord(parsed) || parsed.format !== PROJECT_FORMAT || parsed.version !== PROJECT_VERSION) {
    throw new Error('Die Datei ist kein unterstütztes Linarte-Projekt.')
  }
  if (typeof parsed.projectName !== 'string' || !parsed.projectName.trim()
    || !isConfiguration(parsed.configuration)
    || !isWallContour(parsed.wallContour)
    || (parsed.profileDisplayMode !== 'facadeColor' && parsed.profileDisplayMode !== 'info')) {
    throw new Error('Die Projektdatei ist unvollständig oder enthält ungültige Konfigurationsdaten.')
  }

  return {
    projectName: parsed.projectName,
    configuration: parsed.configuration,
    wallContour: parsed.wallContour,
    profileDisplayMode: parsed.profileDisplayMode,
  }
}
