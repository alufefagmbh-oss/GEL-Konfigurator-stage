import { describe, expect, it } from 'vitest'
import { DEFAULT_GLASS_CONFIGURATION, parseSlabProject, serializeSlabProject, slabFileName } from './slabProject'

const project = {
  projectName: 'Projekt A', depth: 500, thickness: 200,
  segments: [{ length: 3000, angle: 180 }, { length: 2500, angle: 90 }],
  glass: DEFAULT_GLASS_CONFIGURATION,
}

describe('Geländerprojekt', () => {
  it('round-trips the name, dimensions and segments', () => {
    expect(parseSlabProject(serializeSlabProject(project))).toEqual(project)
    const withRailing = { ...project, railing: { mounting: '7B' as const, offset: 75 } }
    expect(parseSlabProject(serializeSlabProject(withRailing))).toEqual(withRailing)
    const inside = { ...withRailing, segments: [project.segments[0], { length: 2500, angle: 270 }] }
    expect(parseSlabProject(serializeSlabProject(inside))).toEqual(inside)
    const withAssumptions = { ...inside, staticAssumptions: { location: 'outside' as const, usage: 'public' as const } }
    expect(parseSlabProject(serializeSlabProject(withAssumptions))).toEqual(withAssumptions)
    const sideMounted = { ...project, railing: { mounting: '7A' as const, offset: 0 } }
    expect(parseSlabProject(serializeSlabProject(sideMounted))).toEqual(sideMounted)
    const old = JSON.stringify({ format: 'gelaender-project', version: 1, ...project, railing: { mounting: '7A', offset: 0 } })
    expect(parseSlabProject(old)).toEqual(sideMounted)
  })
  it('rejects invalid formats, values and geometry', () => {
    expect(() => parseSlabProject('{')).toThrow()
    expect(() => parseSlabProject(JSON.stringify({ format: 'linarte-facade-project', version: 1 }))).toThrow()
    expect(() => parseSlabProject(serializeSlabProject({ ...project, depth: -1 }))).toThrow()
    expect(() => parseSlabProject(serializeSlabProject({ ...project, railing: { mounting: '7B', offset: -1 } }))).toThrow()
    expect(() => parseSlabProject(JSON.stringify({ format: 'gelaender-project', version: 1, ...project, staticAssumptions: { location: 'invalid', usage: 'public' } }))).toThrow('statischen Annahmen')
    expect(() => parseSlabProject(JSON.stringify({ format: 'gelaender-project', version: 1, ...project, staticAssumptions: { location: 'inside', usage: 'invalid' } }))).toThrow('statischen Annahmen')
    expect(() => parseSlabProject(JSON.stringify({ format: 'gelaender-project', version: 1, ...project, glass: { height: 1100, paneThickness: 10, fixing: 'invalid' } }))).toThrow('Glaskonfiguration')
    expect(() => parseSlabProject(JSON.stringify({ format: 'gelaender-project', version: 1, ...project, glass: { height: 16, paneThickness: 10, fixing: 'system' } }))).toThrow('Glaskonfiguration')
    expect(() => parseSlabProject(serializeSlabProject({ ...project, segments: [{ length: 10, angle: 180 }, project.segments[1]] }))).toThrow()
  })
  it('fills default glass configuration when loading a legacy project', () => {
    const legacy = JSON.stringify({
      format: 'gelaender-project',
      version: 1,
      projectName: project.projectName,
      depth: project.depth,
      thickness: project.thickness,
      segments: project.segments,
    })
    expect(parseSlabProject(legacy).glass).toEqual(DEFAULT_GLASS_CONFIGURATION)
  })
  it('fills default maximum glass width and panel gap in saved projects that predate panel splitting', () => {
    const oldGlass = JSON.stringify({
      format: 'gelaender-project',
      version: 1,
      projectName: project.projectName,
      depth: project.depth,
      thickness: project.thickness,
      segments: project.segments,
      glass: { height: 1100, paneThickness: 10, fixing: 'system' },
    })
    expect(parseSlabProject(oldGlass).glass).toEqual(DEFAULT_GLASS_CONFIGURATION)
    expect(parseSlabProject(serializeSlabProject({
      ...project,
      glass: { ...DEFAULT_GLASS_CONFIGURATION, panelGap: 0 },
    })).glass?.panelGap).toBe(0)
  })
  it('generates safe file names', () => {
    const date = new Date(2026, 9, 19, 0, 7, 5)
    expect(slabFileName('Test/A', 'step', date)).toBe('Test-A_2026-10-19_00-07-05.step')
    expect(slabFileName(' Test. ', 'gelaender.json', date)).toBe('Test_2026-10-19_00-07-05.gelaender.json')
    expect(slabFileName('...', 'step', date)).toBe('Gelaenderprojekt_2026-10-19_00-07-05.step')
    expect(slabFileName('', 'gelaender.json', date)).toBe('Gelaenderprojekt_2026-10-19_00-07-05.gelaender.json')
  })
})
