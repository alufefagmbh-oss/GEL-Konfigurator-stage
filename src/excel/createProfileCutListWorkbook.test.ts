import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { createProfileCutListWorkbook } from './createProfileCutListWorkbook'
import type { ProfileCutListInput } from '../domain/profileCutList'
import { getHighHighSwitchProfile, getLowLowSwitchProfile } from '../domain/switchProfiles'
import { parseUkRailDxf } from '../dxf/parseUkRailDxf'
import { readFileSync } from 'node:fs'

const input: ProfileCutListInput = {
  configuration: {
    width: 100,
    height: 200,
    endGap: 0,
    profile: {
      name: 'Even',
      source: 'standard',
      width: 40,
      depth: 20,
      contours: [],
    },
  },
  layout: {
    isValid: true,
    positions: [0],
  },
  wallContour: null,
}

describe('profile cut list workbook', () => {
  it('uses the template columns and exports all four cut dimensions', async () => {
    const data = await createProfileCutListWorkbook({
      ...input,
      layout: { isValid: true, positions: [0, 10, 20] },
    }, 'Testprojekt')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(data)

    const sheet = workbook.getWorksheet('Profilliste')
    expect(sheet).toBeDefined()
    expect(sheet?.getCell('A1').value).toBe('Zuschnittliste Linarte')
    expect(sheet?.getCell('B3').value).toBe('Testprojekt')
    expect(sheet?.getCell('A4').value).toContain('Kontrollänge = Kurzpunktmaß')
    expect(sheet?.getCell('A4').value).toContain('Montagespalt oben/unten: 0 mm je Seite')
    expect(sheet?.getRow(5).values).toEqual([
      undefined,
      'Position',
      'Stückzahl',
      'Profiltype',
      'Länge (mm)',
      'Winkel 1 (°)',
      'Winkel 2 (°)',
      'Kontrollänge (mm)',
      'Hinweis',
    ])
    expect(sheet?.getCell('A6').value).toBe('001')
    expect(sheet?.getCell('B6').value).toBe(3)
    expect(sheet?.getCell('C6').value).toBe('Even')
    expect(sheet?.getCell('D6').value).toBe(200)
    expect(sheet?.getCell('E6').value).toBe(0)
    expect(sheet?.getCell('F6').value).toBe(0)
    expect(sheet?.getCell('G6').value).toBe(200)
    expect(sheet?.getCell('A7').value).toBeNull()
  })

  it('assigns a new position to each distinct cut', async () => {
    const data = await createProfileCutListWorkbook({
      ...input,
      layout: { isValid: true, positions: [-25, 25] },
      wallContour: {
        name: 'Steigende Decke',
        width: 100,
        height: 200,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 200 },
          { x: 0, y: 180 },
        ],
      },
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(data)
    const sheet = workbook.getWorksheet('Profilliste')
    expect(sheet?.getCell('A6').value).toBe('001')
    expect(sheet?.getCell('A7').value).toBe('002')
    expect(sheet?.getCell('B6').value).toBe(1)
    expect(sheet?.getCell('B7').value).toBe(1)
  })

  it('includes a switch profile as its own profile type', async () => {
    const switchProfile = getHighHighSwitchProfile('even')
    if (!switchProfile) throw new Error('Expected Even switch profile to exist')
    const data = await createProfileCutListWorkbook({
      ...input,
      placements: [
        {
          axisX: 0,
          profile: input.configuration.profile,
          layoutIndex: 0,
          isSwitchProfile: false,
        },
        {
          axisX: 0,
          profile: switchProfile,
          layoutIndex: -1,
          isSwitchProfile: true,
        },
      ],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(data)
    const sheet = workbook.getWorksheet('Profilliste')
    const types = [sheet?.getCell('C6').value, sheet?.getCell('C7').value]

    expect(types).toContain('Even')
    expect(types).toContain('Even Wechselprofil')
  })

  it('includes the rear switch profile used for low-low ends in the cut list', async () => {
    const data = await createProfileCutListWorkbook({
      ...input,
      placements: [
        {
          axisX: 0,
          profile: input.configuration.profile,
          layoutIndex: 0,
          isSwitchProfile: false,
        },
        {
          axisX: 0,
          profile: getLowLowSwitchProfile(),
          depthOffset: input.configuration.profile.depth - getLowLowSwitchProfile().depth,
          layoutIndex: -1,
          isSwitchProfile: true,
        },
      ],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(data)
    const sheet = workbook.getWorksheet('Profilliste')
    const types = [sheet?.getCell('C6').value, sheet?.getCell('C7').value]

    expect(types).toContain('Hinteres Wechselprofil')
  })

  it('adds cut lengths for the UK rail and groups equal pieces', async () => {
    const ukRailProfile = parseUkRailDxf(readFileSync(
      new URL('../../public/genUK-Schiene.dxf', import.meta.url),
      'utf8',
    ))
    const data = await createProfileCutListWorkbook(input, 'Testprojekt', {
      ukRailProfile,
      ukRailPlacements: [
        { startX: 10, endX: 3010, centerHeight: 200 },
        { startX: 10, endX: 3010, centerHeight: 1400 },
      ],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(data)
    const sheet = workbook.getWorksheet('Profilliste')

    expect(sheet?.getCell('A4').value).toContain('7,5 mm Abstand')
    expect(sheet?.getCell('C7').value).toBe('UK-Schiene')
    expect(sheet?.getCell('B7').value).toBe(2)
    expect(sheet?.getCell('D7').value).toBe(3000)
    expect(sheet?.getCell('H7').value).toContain('maximale Stücklänge 6000 mm')
  })
})
