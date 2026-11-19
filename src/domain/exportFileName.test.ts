import { describe, expect, it } from 'vitest'
import { getProjectExportFileName } from './exportFileName'

describe('project export filenames', () => {
  it('uses the project name and date-time suffix for STEP and PDF', () => {
    const date = new Date(2026, 9, 19, 0, 57, 25)
    expect(getProjectExportFileName('Fassade Nord', 'step', date)).toBe('Fassade Nord_2026-10-19_00-57-25.step')
    expect(getProjectExportFileName('Fassade Nord', 'pdf', date)).toBe('Fassade Nord_2026-10-19_00-57-25.pdf')
  })

  it('removes invalid filename characters and uses a safe fallback', () => {
    const date = new Date(2026, 9, 19, 0, 57, 25)
    expect(getProjectExportFileName('  Nord/West  ', 'step', date)).toBe('Nord-West_2026-10-19_00-57-25.step')
    expect(getProjectExportFileName('...', 'pdf', date)).toBe('Linarte-Projekt_2026-10-19_00-57-25.pdf')
  })
})
