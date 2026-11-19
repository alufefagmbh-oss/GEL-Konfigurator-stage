import ExcelJS from 'exceljs'
import { createProfileCutList } from '../domain/profileCutList'
import type { ProfileCutListInput } from '../domain/profileCutList'
import { getEndGap } from '../domain/endGap'
import { UK_RAIL_MAXIMUM_PIECE_LENGTH, UK_RAIL_PROFILE_CLEARANCE } from '../domain/ukRail'
import { getSupportRailPieceLength, getSupportRailShortestEdge, SUPPORT_RAIL_MAXIMUM_LENGTH } from '../domain/supportRail'
import { SQUARE_TIMBER_MAXIMUM_WIDTH } from '../domain/squareTimber'
import type { UkMountingExportData, UkRailPlacement, UkRailProfile } from '../domain/types'

function formatAngle(angle: number): number {
  return angle
}

function groupIdenticalCuts(input: ProfileCutListInput) {
  const groups = new Map<string, {
    position: string
    quantity: number
    profile: string
    length: number
    angle1: number
    angle2: number
    controlLength: number
    note: string
  }>()

  for (const row of createProfileCutList(input)) {
    const key = [
      row.profileName,
      row.longPointLength.toFixed(3),
      row.bottomAngle?.toFixed(3) ?? 'unsupported',
      row.topAngle?.toFixed(3) ?? 'unsupported',
      row.shortPointLength.toFixed(3),
      row.note,
    ].join('|')
    const existing = groups.get(key)
    if (existing) {
      existing.quantity += 1
    } else {
      groups.set(key, {
        position: String(groups.size + 1).padStart(3, '0'),
        quantity: 1,
        profile: row.profileName,
        length: row.longPointLength,
        angle1: row.bottomAngle,
        angle2: row.topAngle,
        controlLength: row.shortPointLength,
        note: row.note,
      })
    }
  }
  return [...groups.values()]
}

export async function createProfileCutListWorkbook(
  input: ProfileCutListInput,
  projectName = 'Neue Fassade',
  ukRailData?: {
    ukRailProfile: UkRailProfile | null
    ukRailPlacements: UkRailPlacement[]
    ukMountingData?: UkMountingExportData | null
  },
): Promise<Uint8Array> {
  const rows = groupIdenticalCuts(input)
  if (ukRailData?.ukRailProfile && ukRailData.ukRailPlacements.length > 0) {
    const railLengths = new Map<string, { length: number; quantity: number }>()
    for (const placement of ukRailData.ukRailPlacements) {
      const length = placement.endX - placement.startX
      const key = length.toFixed(3)
      const existing = railLengths.get(key)
      if (existing) existing.quantity += 1
      else railLengths.set(key, { length, quantity: 1 })
    }
    for (const { length, quantity } of railLengths.values()) {
      rows.push({
        position: String(rows.length + 1).padStart(3, '0'),
        quantity,
        profile: ukRailData.ukRailProfile.name,
        length,
        angle1: 0,
        angle2: 0,
        controlLength: length,
        note: `UK-Schiene; horizontal; Stoß bei Bedarf, maximale Stücklänge ${UK_RAIL_MAXIMUM_PIECE_LENGTH} mm.`,
      })
    }
  }
  const mountingData = ukRailData?.ukMountingData
  if (mountingData?.mountingMethod === 'aluminum-substructure' && mountingData.angleProfile) {
    const angleLengths = new Map<string, { length: number; quantity: number }>()
    for (const placement of mountingData.anglePlacements) {
      const length = placement.endHeight - placement.startHeight
      const key = length.toFixed(3)
      const existing = angleLengths.get(key)
      if (existing) existing.quantity += 1
      else angleLengths.set(key, { length, quantity: 1 })
    }
    for (const { length, quantity } of angleLengths.values()) {
      rows.push({
        position: String(rows.length + 1).padStart(3, '0'),
        quantity,
        profile: mountingData.angleProfile.name,
        length,
        angle1: 0,
        angle2: 0,
        controlLength: length,
        note: 'Vertikaler L-Winkel 50 × 40 × 2 mm; gerade Schnitte.',
      })
    }
  }
  if (mountingData?.supportRailProfile) {
    const supportRailProfile = mountingData.supportRailProfile
    const groups = new Map<string, { length: number; control: number; angle1: number; angle2: number; quantity: number }>()
    for (const piece of mountingData.supportRailPieces) {
      const length = getSupportRailPieceLength(piece, supportRailProfile)
      const control = getSupportRailShortestEdge(piece, supportRailProfile)
      const angle1 = Math.abs(Math.atan(piece.startCut.slope) * 180 / Math.PI)
      const angle2 = Math.abs(Math.atan(piece.endCut.slope) * 180 / Math.PI)
      const key = [length, control, angle1, angle2].map((value) => value.toFixed(3)).join('|')
      const existing = groups.get(key)
      if (existing) existing.quantity += 1
      else groups.set(key, { length, control, angle1, angle2, quantity: 1 })
    }
    for (const group of groups.values()) {
      rows.push({
        position: String(rows.length + 1).padStart(3, '0'),
        quantity: group.quantity,
        profile: supportRailProfile.name,
        length: group.length,
        angle1: group.angle1,
        angle2: group.angle2,
        controlLength: group.control,
        note: `Auflager-Schiene; parallel zur unteren Fassadenkontur, Gehrung zur Rechtwinkligkeit, maximale Stücklänge ${SUPPORT_RAIL_MAXIMUM_LENGTH} mm.`,
      })
    }
  }
  if (mountingData?.mountingMethod === 'aluminum-substructure'
    && mountingData.connectorLength !== null
    && mountingData.connectorPlacements.length > 0) {
    rows.push({
      position: String(rows.length + 1).padStart(3, '0'),
      quantity: mountingData.connectorPlacements.length,
      profile: `Maueranschlussteil Spidi ${mountingData.connectorLength} mm`,
      length: mountingData.connectorLength,
      angle1: 0,
      angle2: 0,
      controlLength: mountingData.connectorLength,
      note: 'Maueranschlussteil je Position am L-Winkel; Länge nach Abstand Schienenhinterkante–Mauer.',
    })
  }
  if (mountingData?.mountingMethod === 'direct-to-wall' && mountingData.fixings.length > 0) {
    rows.push({
      position: String(rows.length + 1).padStart(3, '0'),
      quantity: mountingData.fixings.length,
      profile: 'Schraube Kopf Ø 18,5 × 8,5 mm, Schaft Ø 10 × 85 mm',
      length: 93.5,
      angle1: 0,
      angle2: 0,
      controlLength: 93.5,
      note: 'Eine Schraube je Befestigungsloch.',
    })
  }
  if (mountingData?.mountingMethod === 'direct-to-wall' && mountingData.squareTimbers.length > 0) {
    const timberGroups = new Map<string, { width: number; depth: number; length: number; quantity: number }>()
    for (const timber of mountingData.squareTimbers) {
      const length = Math.round((timber.top - timber.bottom) * 10) / 10
      const key = `${timber.width}|${timber.depth}|${length}`
      const group = timberGroups.get(key)
      if (group) group.quantity += 1
      else timberGroups.set(key, { width: timber.width, depth: timber.depth, length, quantity: 1 })
    }
    for (const { width, depth, length, quantity } of [...timberGroups.values()].sort((first, second) => second.length - first.length)) {
      rows.push({
        position: String(rows.length + 1).padStart(3, '0'),
        quantity,
        profile: `Kantholz ${width} × ${depth} mm`,
        length,
        angle1: 0,
        angle2: 0,
        controlLength: length,
        note: `Vertikal von der obersten UK-Schiene bis zur Unterkante der Auflager-Schiene; Bohrungen Ø ${mountingData.holeDiameter + 2} mm je Befestigung.`,
      })
    }
  } else if (mountingData?.mountingMethod === 'direct-to-wall' && mountingData.fixings.length > 0) {
    rows.push({
      position: String(rows.length + 1).padStart(3, '0'),
      quantity: mountingData.fixings.length,
      profile: `Kunststoffklotz 60 × 60 × ${mountingData.plasticBlockDepth} mm`,
      length: mountingData.plasticBlockDepth,
      angle1: 0,
      angle2: 0,
      controlLength: mountingData.plasticBlockDepth,
      note: `Ein Klotz je Befestigungsloch Ø ${mountingData.holeDiameter} mm.`,
    })
  }
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Linarte Fassadenkonfigurator'
  workbook.subject = 'Profillängen und Gehrungswinkel für den Zuschnitt'
  workbook.title = 'Profilliste'
  workbook.created = new Date()
  const clearanceText = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(UK_RAIL_PROFILE_CLEARANCE)

  const sheet = workbook.addWorksheet('Profilliste', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  sheet.columns = [
    { header: 'Position', key: 'position', width: 12 },
    { header: 'Stückzahl', key: 'quantity', width: 12 },
    { header: 'Profiltype', key: 'profile', width: 18 },
    { header: 'Länge (mm)', key: 'length', width: 16 },
    { header: 'Winkel 1 (°)', key: 'angle1', width: 17 },
    { header: 'Winkel 2 (°)', key: 'angle2', width: 17 },
    { header: 'Kontrollänge (mm)', key: 'controlLength', width: 21 },
    { header: 'Hinweis', key: 'note', width: 54 },
  ]

  sheet.mergeCells('A1:H1')
  sheet.getCell('A1').value = 'Zuschnittliste Linarte'
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF285598' } }
  sheet.getCell('A1').alignment = { vertical: 'middle' }
  sheet.getRow(1).height = 28
  sheet.getCell('A3').value = 'Projekt'
  sheet.getCell('B3').value = projectName
  sheet.getCell('A3').font = { bold: true, color: { argb: 'FF262626' } }
  sheet.getCell('B3').font = { color: { argb: 'FF262626' } }
  sheet.mergeCells('A4:H4')
  const ukRailNotes = ukRailData?.ukRailProfile
    ? ` UK-Schienen: ${clearanceText} mm Abstand zu den Fassadenprofilen, je Seite 5 mm kürzer; Stoß bei Bedarf (max. ${UK_RAIL_MAXIMUM_PIECE_LENGTH} mm je Stück).${mountingData?.mountingMethod === 'direct-to-wall' ? ` Direktmontage: ${mountingData.fixings.length} Löcher Ø ${mountingData.holeDiameter} mm und ${mountingData.squareTimbers.length > 0 ? `vertikale Kanthölzer (Breite max. ${SQUARE_TIMBER_MAXIMUM_WIDTH} mm, Tiefe ${mountingData.plasticBlockDepth} mm)` : `Kunststoffklötze 60 × 60 × ${mountingData.plasticBlockDepth} mm`}; Abstand Schienenhinterkante–Mauer ${mountingData.directMountClearance} mm, Rest nach Klotz ${mountingData.remainingWallClearance} mm.` : mountingData?.mountingMethod === 'aluminum-substructure' ? ` Alu-UK: ${mountingData.anglePlacements.length} L-Winkel, maximal 800 mm Achsabstand.` : ''}`
    : ''
  sheet.getCell('A4').value =
    `Montagespalt oben/unten: ${getEndGap(input.configuration)} mm je Seite.${ukRailNotes} Winkel 1 = untere Schnittkante, Winkel 2 = obere Schnittkante. Länge = Langpunktmaß; Kontrollänge = Kurzpunktmaß. Geometriewinkel: 0° = rechtwinkliger Schnitt; Maschinenwerte und Winkelrichtung vor dem Zuschnitt prüfen.`
  sheet.getCell('A4').alignment = { wrapText: true }
  sheet.getCell('A4').font = { italic: true, size: 10, color: { argb: 'FF555555' } }
  sheet.getRow(4).height = 50

  const header = sheet.getRow(5)
  header.values = [
    'Position',
    'Stückzahl',
    'Profiltype',
    'Länge (mm)',
    'Winkel 1 (°)',
    'Winkel 2 (°)',
    'Kontrollänge (mm)',
    'Hinweis',
  ]
  header.height = 34
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173259' } }
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  header.eachCell((cell) => {
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF285598' } } }
  })

  rows.forEach((row) => {
    const excelRow = sheet.addRow({
      position: row.position,
      quantity: row.quantity,
      profile: row.profile,
      length: row.length,
      angle1: formatAngle(row.angle1),
      angle2: formatAngle(row.angle2),
      controlLength: row.controlLength,
      note: row.note,
    })
    excelRow.height = row.note ? 30 : 22
    excelRow.alignment = { vertical: 'middle', wrapText: true }
    excelRow.eachCell((cell) => {
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD5D5D5' } } }
    })
    for (const key of ['length', 'angle1', 'angle2', 'controlLength']) {
      excelRow.getCell(key).numFmt = '#,##0.0;[Red]-#,##0.0'
      excelRow.getCell(key).alignment = { horizontal: 'right', vertical: 'middle' }
    }
    if (row.note) {
      excelRow.getCell('note').font = { color: { argb: 'FF97472F' } }
      excelRow.getCell('angle1').font = { color: { argb: 'FF97472F' } }
      excelRow.getCell('angle2').font = { color: { argb: 'FF97472F' } }
    }
  })

  sheet.autoFilter = { from: 'A5', to: `H${5 + rows.length}` }
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 6) return
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F8' } }
      })
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer)
}
