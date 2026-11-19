import { describe, expect, it } from 'vitest'
import { DEFAULT_MASONRY_VIEW } from './masonryView'
import { parseProjectFile, serializeProjectFile } from './projectFile'
import { getStandardProfile } from './standardProfiles'
import type { FacadeProject } from './projectFile'

const project: FacadeProject = {
  projectName: 'Fassade Muster',
  configuration: {
    width: 3000,
    height: 2500,
    endGap: 10,
    profileColor: '#cbd0cc',
    profile: getStandardProfile('even'),
    facadeEnds: { left: 'high', right: 'low' },
    masonryView: { ...DEFAULT_MASONRY_VIEW, enabled: true },
    ukRailView: { enabled: false },
  },
  wallContour: {
    name: 'mauer.dxf',
    width: 3000,
    height: 2500,
    points: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2500 }, { x: 0, y: 2500 }],
  },
  profileDisplayMode: 'info',
}

describe('project files', () => {
  it('round-trips all project configuration and imported wall data', () => {
    expect(parseProjectFile(serializeProjectFile(project))).toEqual(project)
  })

  it('round-trips the second UK mounting level settings', () => {
    const projectWithMounting = {
      ...project,
      configuration: {
        ...project.configuration,
        ukRailView: {
          enabled: true,
          mountingMethod: 'aluminum-substructure' as const,
          holeDiameter: 12,
          plasticBlockDepth: 18,
          connectorMaxSpacing: 500,
        },
      },
    }
    expect(parseProjectFile(serializeProjectFile(projectWithMounting))).toEqual(projectWithMounting)
  })

  it('rejects invalid UK mounting options', () => {
    const invalidProject = JSON.parse(serializeProjectFile(project)) as Record<string, unknown>
    const configuration = invalidProject.configuration as Record<string, unknown>
    configuration.ukRailView = {
      enabled: true,
      mountingMethod: 'unknown',
      holeDiameter: -1,
      plasticBlockDepth: -1,
      connectorMaxSpacing: 0,
    }
    expect(() => parseProjectFile(JSON.stringify(invalidProject))).toThrow(/ungültige Konfigurationsdaten/)
  })

  it('keeps older project files valid when they do not contain UK rail settings', () => {
    const olderProject = JSON.parse(serializeProjectFile(project)) as Record<string, unknown>
    const configuration = olderProject.configuration as Record<string, unknown>
    delete configuration.ukRailView

    expect(() => parseProjectFile(JSON.stringify(olderProject))).not.toThrow()
  })

  it('rejects invalid JSON, unknown formats, and invalid configuration data', () => {
    expect(() => parseProjectFile('{')).toThrow('kein gültiges JSON')
    expect(() => parseProjectFile(JSON.stringify({ format: 'other', version: 1 }))).toThrow('kein unterstütztes')

    const invalid = JSON.parse(serializeProjectFile(project)) as Record<string, unknown>
    invalid.configuration = {}
    expect(() => parseProjectFile(JSON.stringify(invalid))).toThrow('ungültige Konfigurationsdaten')
  })
})
