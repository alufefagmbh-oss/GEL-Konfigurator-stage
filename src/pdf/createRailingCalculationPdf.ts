import { jsPDF } from 'jspdf'
import type { RailingCalculation } from '../domain/railingPricing'
import { timestampedFileName } from '../domain/exportFileName'
import type { ViewerImage } from '../viewer/viewerImage'
import { loadPdfLogo } from './loadPdfLogo'

const money = (value: number) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const unitMoney = (value: number) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value)
const quantity = (value: number, unit: string) => new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: unit === 'lfm' ? 1 : 0,
  maximumFractionDigits: unit === 'lfm' ? 1 : 6,
}).format(value)

export async function createRailingCalculationPdf(calculation: RailingCalculation, projectName: string, priceListName: string, image: ViewerImage, shipping: number): Promise<void> {
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0
    || !image.dataUrl.startsWith('data:image/jpeg;base64,')) {
    throw new Error('Das Bild der 3D-Ansicht ist ungültig.')
  }
  if (!Number.isFinite(shipping) || shipping < 0 || Math.abs(shipping * 100 - Math.round(shipping * 100)) > 1e-7) {
    throw new Error('Der Preis für Verpackung und Versand ist ungültig.')
  }
  const logo = await loadPdfLogo()
  const pdf = new jsPDF()
  const logoWidth = 68
  pdf.addImage(logo.dataUrl, 'JPEG', 15, 8, logoWidth, logoWidth * logo.height / logo.width)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text('Geländerkalkulation', 15, 29)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text(`Projekt: ${projectName.trim() || 'Unbenannt'}`, 15, 39)
  pdf.text(`Datum: ${new Intl.DateTimeFormat('de-DE').format(new Date())}`, 15, 45)
  pdf.text(`Preisliste: ${priceListName.trim() || 'Nicht benannt'}`, 105, 45)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Position', 15, 57)
  pdf.text('Menge', 112, 57, { align: 'right' })
  pdf.text('Preis EUR', 151, 57, { align: 'right' })
  pdf.text('Gesamt EUR', 195, 57, { align: 'right' })
  pdf.setDrawColor(180)
  pdf.line(15, 59, 195, 59)
  pdf.setFont('helvetica', 'normal')
  let y = 66
  for (const line of calculation.lines) {
    const labelLines: string[] = pdf.splitTextToSize(line.label, 76)
    pdf.text(labelLines, 15, y)
    pdf.text(`${quantity(line.quantity, line.unit)} ${line.unit}`, 112, y, { align: 'right' })
    pdf.text(unitMoney(line.unitPrice), 151, y, { align: 'right' })
    pdf.text(money(line.total), 195, y, { align: 'right' })
    y += Math.max(7, labelLines.length * 5)
  }
  pdf.text('Verpackung und Versand', 15, y)
  pdf.text('1 Stk.', 112, y, { align: 'right' })
  pdf.text(money(shipping), 151, y, { align: 'right' })
  pdf.text(money(shipping), 195, y, { align: 'right' })
  y += 7
  pdf.line(15, y, 195, y)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Gesamt netto', 15, y + 8)
  pdf.text(`${money(Math.round((calculation.total + shipping) * 100) / 100)} EUR`, 195, y + 8, { align: 'right' })
  pdf.setFont('helvetica', 'normal')
  pdf.text('Ohne MwSt. Glas und Betondecke sind nicht enthalten.', 15, y + 18)
  pdf.text('Schrauben: schematische Geometrie, kein festgelegtes Herstellermodell.', 15, y + 24)
  let imageY = y + 35
  const pageHeight = pdf.internal.pageSize.getHeight()
  if (pageHeight - 15 - imageY < 60) {
    pdf.addPage()
    imageY = 25
  }
  pdf.setFont('helvetica', 'bold')
  pdf.text('3D-Ansicht', 15, imageY)
  imageY += 5
  const maxWidth = 180
  const maxHeight = Math.min(110, pageHeight - 15 - imageY)
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height)
  pdf.addImage(image.dataUrl, 'JPEG', 15, imageY, image.width * scale, image.height * scale)
  pdf.save(timestampedFileName(projectName, 'pdf', 'Gelaenderkalkulation'))
}
