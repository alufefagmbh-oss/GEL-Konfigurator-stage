import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import type { ManufacturingData, ManufacturingProfile } from '../domain/railingManufacturing'
import { manufacturingHoleDescription } from '../domain/railingManufacturing'
import { timestampedFileName } from '../domain/exportFileName'
import { formatMeasurement } from '../domain/measurementFormat'
import { drawRailingProfileSketch } from './drawRailingProfileSketch'

const number = formatMeasurement

async function loadLayout(): Promise<SVGSVGElement> {
  const response = await fetch(`${import.meta.env.BASE_URL}pdf-layout.svg`)
  if (!response.ok) throw new Error(`Das PDF-Layout konnte nicht geladen werden (HTTP ${response.status}).`)
  const document = new DOMParser().parseFromString(await response.text(), 'image/svg+xml')
  if (document.documentElement.localName !== 'svg' || document.querySelector('parsererror')) {
    throw new Error('Die SVG-Zeichnungsvorlage ist ungültig.')
  }
  return document.documentElement as unknown as SVGSVGElement
}

export async function createRailingManufacturingPdf(data: ManufacturingData, projectName: string): Promise<void> {
  const layout = await loadLayout()
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true })
  const bottom = 275
  let y = 35
  const background = () => svg2pdf(layout.cloneNode(true) as SVGSVGElement, pdf, { x: 0, y: 0, width: 420, height: 297 })
  await background()
  const page = async (heading: string) => {
    pdf.addPage()
    await background()
    y = 35
    title(heading)
  }
  const title = (text: string) => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(15)
    pdf.text(text, 25, y)
    y += 9
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
  }
  const line = async (text: string, indent = 25) => {
    const chunks: string[] = pdf.splitTextToSize(text, 395 - indent)
    for (const chunk of chunks) {
      if (y > bottom) await page('AV-Export - Fortsetzung')
      pdf.text(chunk, indent, y)
      y += 5
    }
  }
  const tableEdges = [25, 45, 70, 235, 395]
  const drawTableHeader = () => {
    const top = y
    const bottom = top + 9
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.line(tableEdges[0], top, tableEdges[tableEdges.length - 1], top)
    pdf.line(tableEdges[0], bottom, tableEdges[tableEdges.length - 1], bottom)
    for (const edge of tableEdges) pdf.line(edge, top, edge, bottom)
    pdf.text('Pos.', tableEdges[0] + 2, top + 6)
    pdf.text('Menge', tableEdges[1] + 2, top + 6)
    pdf.text('Bezeichnung / Länge', tableEdges[2] + 2, top + 6)
    pdf.text('Hinweis', tableEdges[3] + 2, top + 6)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    y = bottom
  }
  const drawTableRow = async (item: ManufacturingData['items'][number], index: number) => {
    const description = item.length === null ? item.description : `${item.description} / ${number(item.length)} mm`
    const values = [
      String(index + 1).padStart(3, '0'),
      `${item.unit === 'lfm' ? number(item.quantity) : item.quantity} ${item.unit ?? 'Stk.'}`,
      description,
      item.note,
    ]
    const cells = values.map((value, cell) => pdf.splitTextToSize(value, tableEdges[cell + 1] - tableEdges[cell] - 4))
    const height = Math.max(9, ...cells.map((chunks) => chunks.length * 4.5 + 3))
    if (y + height > bottom) {
      await page('AV-Export - Stückliste Fortsetzung')
      drawTableHeader()
    }
    const top = y
    const rowBottom = top + height
    pdf.line(tableEdges[0], top, tableEdges[tableEdges.length - 1], top)
    pdf.line(tableEdges[0], rowBottom, tableEdges[tableEdges.length - 1], rowBottom)
    for (const edge of tableEdges) pdf.line(edge, top, edge, rowBottom)
    cells.forEach((chunks, cell) => {
      if (chunks.length > 0) pdf.text(chunks, tableEdges[cell] + 2, top + 5.5)
    })
    y = rowBottom
  }

  title('AV-Export - Stückliste')
  await line(`Projekt: ${projectName.trim() || 'Unbenannt'}    Datum: ${new Intl.DateTimeFormat('de-DE').format(new Date())}`)
  await line('Alle Maße in mm. Modellbasierte Angaben vor Fertigung fachlich prüfen.')
  await line('Glas, Betondecke und Stahlblech nicht enthalten. Schrauben und Profilquerschnitt sind schematisch.')
  y += 3
  drawTableHeader()
  for (const [index, item] of data.items.entries()) await drawTableRow(item, index)
  if (data.items.length === 0) await line('Keine Geländerteile konfiguriert.')

  const profilePage = async (profile: ManufacturingProfile) => {
    await page(`Bearbeitung ${profile.position} - GEL2001`)
    await line(`Konturkante Anfang: X ${number(profile.contourStart.x)}, Y ${number(profile.contourStart.y)} mm`)
    await line(`Konturkante Ende: X ${number(profile.contourEnd.x)}, Y ${number(profile.contourEnd.y)} mm`)
    await line('Konturkoordinaten dienen der Zuordnung, nicht als Bohrmaß.')
    await line(`Rohteillänge (längste Ausdehnung): ${number(profile.stockLength)} mm`)
    await line(`Profilbreite: ${number(profile.width)} mm; Stück: 1`)
    await line('Bezug: X = 0 am äußersten Anfangspunkt; X entlang des Profils zum Ende.')
    await line('Y = 0 an Profilkante x = 0 im Querschnitt; in Richtung Anfang zu Ende liegt positives Y rechts.')
    await line('Schnitte: X-Werte an beiden Profilkanten, jeweils vom Rohteil-Anfang gemessen.')
    y += 3
    await line(`Anfang: Y = 0: X ${number(profile.startAtZero)}    Y = ${number(profile.width)}: X ${number(profile.startAtWidth)} mm`)
    await line(`Ende:     Y = 0: X ${number(profile.endAtZero)}    Y = ${number(profile.width)}: X ${number(profile.endAtWidth)} mm`)
    await line(`Schnittwinkel zur Rechtwinkligkeit: Anfang ${number(profile.startAngle)}°, Ende ${number(profile.endAngle)}°`)
    await line('Vorzeichen: positiv, wenn X zur Kante Y = Profilbreite zunimmt.')
    y += 3
    await line(manufacturingHoleDescription(data.mounting))
    await line(`Anzahl Bohrungen: ${profile.holes.length}`)
    pdf.setFont('helvetica', 'bold')
    await line('Nr.        X ab Rohteil-Anfang [mm]        Y ab Profilkante [mm]')
    pdf.setFont('helvetica', 'normal')
    for (const [index, hole] of profile.holes.entries()) {
      await line(`${String(index + 1).padStart(2, '0')}          ${number(hole.longitudinal)}                                  ${number(hole.lateral)}`)
    }

    await page(`Zeichnung ${profile.position} - GEL2001 Draufsicht`)
    await line(`Projekt: ${projectName.trim() || 'Unbenannt'}    Stück: 1    Modellangaben vor Fertigung fachlich prüfen.`)
    await line(manufacturingHoleDescription(data.mounting))
    drawRailingProfileSketch(pdf, profile, data.mounting)
  }
  for (const profile of data.profiles) await profilePage(profile)
  pdf.save(timestampedFileName(projectName, 'pdf', 'Gelaender_AV'))
}
