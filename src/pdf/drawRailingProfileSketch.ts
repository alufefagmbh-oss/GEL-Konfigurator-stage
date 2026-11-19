import type { jsPDF } from 'jspdf'
import type { ManufacturingProfile } from '../domain/railingManufacturing'
import { COUNTERSINK_RADIUS, HOLE_RADIUS } from '../domain/railingProfile'
import { formatMeasurement } from '../domain/measurementFormat'
import { SIDE_FIXING_HOLE_DIAMETER, type RailingMounting } from '../domain/railingMounting'

const format = formatMeasurement

// Only section vertices on the upper envelope produce visible longitudinal edges in top view.
export function visibleSectionEdges(section: ManufacturingProfile['section']): number[] {
  const upperAt = (x: number) => Math.max(...section.flatMap((a, index) => {
    const b = section[(index + 1) % section.length]
    if (x < Math.min(a.x, b.x) - 1e-8 || x > Math.max(a.x, b.x) + 1e-8) return []
    if (Math.abs(b.x - a.x) < 1e-8) return [Math.max(a.y, b.y)]
    return [a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x)]
  }))
  return section.filter((point) => point.y >= upperAt(point.x) - 1e-7)
    .map((point) => point.x)
    .sort((a, b) => a - b)
    .filter((value, index, values) => index === 0 || value - values[index - 1] > 0.001)
}

export function drawRailingProfileSketch(pdf: jsPDF, profile: ManufacturingProfile, mounting: RailingMounting = '7B'): void {
  if (!Number.isFinite(profile.stockLength) || profile.stockLength <= 0 || !Number.isFinite(profile.width) || profile.width <= 0 || profile.section.length < 3) {
    throw new Error('Das Profil für die Zeichnung hat ungültige Abmessungen oder keine gültige Kontur.')
  }
  const scale = Math.min(340 / profile.stockLength, 30 / profile.width)
  const left = 40 + (340 - profile.stockLength * scale) / 2
  const bottom = 164
  const x = (value: number) => left + value * scale
  const y = (value: number) => bottom - value * scale
  const cut = (atZero: number, atWidth: number, lateral: number) =>
    atZero + (atWidth - atZero) * lateral / profile.width
  const tick = (px: number, py: number) => pdf.line(px - 0.9, py + 0.9, px + 0.9, py - 0.9)
  const labelGap = 3.2
  const labels = profile.holes.map((hole, index) => ({ index, position: x(hole.longitudinal) }))
    .sort((a, b) => a.position - b.position)
  if ((labels.length - 1) * labelGap > 340) {
    throw new Error(`Für die Bohrungsmaße von ${profile.position} reicht der Platz auf der A3-Zeichnung nicht aus.`)
  }
  labels.forEach((label, index) => {
    label.position = Math.max(40, label.position, index ? labels[index - 1].position + labelGap : 40)
  })
  for (let index = labels.length - 1; index >= 0; index -= 1) {
    labels[index].position = Math.min(labels[index].position, index === labels.length - 1 ? 380 : labels[index + 1].position - labelGap)
  }

  pdf.setDrawColor(20, 20, 20)
  pdf.setLineWidth(0.13)
  pdf.line(x(profile.startAtZero), y(0), x(profile.endAtZero), y(0))
  pdf.line(x(profile.startAtWidth), y(profile.width), x(profile.endAtWidth), y(profile.width))
  pdf.line(x(profile.startAtZero), y(0), x(profile.startAtWidth), y(profile.width))
  pdf.line(x(profile.endAtZero), y(0), x(profile.endAtWidth), y(profile.width))
  pdf.setLineWidth(0.06)
  for (const lateral of visibleSectionEdges(profile.section)) {
    if (lateral < 0.001 || lateral > profile.width - 0.001) continue
    pdf.line(x(cut(profile.startAtZero, profile.startAtWidth, lateral)), y(lateral),
      x(cut(profile.endAtZero, profile.endAtWidth, lateral)), y(lateral))
  }
  for (const hole of profile.holes) {
    if (mounting === '7A') {
      pdf.circle(x(hole.longitudinal), y(hole.lateral), SIDE_FIXING_HOLE_DIAMETER / 2 * scale)
    } else {
      pdf.circle(x(hole.longitudinal), y(hole.lateral), COUNTERSINK_RADIUS * scale)
      pdf.circle(x(hole.longitudinal), y(hole.lateral), HOLE_RADIUS * scale)
    }
  }
  pdf.setLineWidth(0.1)
  pdf.setFontSize(7)
  labels.forEach(({ index, position }) => {
    const hole = profile.holes[index]
    const hx = x(hole.longitudinal)
    pdf.line(hx, y(hole.lateral), position, 146)
    pdf.text(`${String(index + 1).padStart(2, '0')}  X ${format(hole.longitudinal)}  Y ${format(hole.lateral)}`, position - 0.8, 144, { angle: 90 })
  })
  const dimensionY = 176
  pdf.line(x(0), dimensionY, x(profile.stockLength), dimensionY)
  pdf.line(x(0), bottom + 2, x(0), dimensionY + 2)
  pdf.line(x(profile.stockLength), bottom + 2, x(profile.stockLength), dimensionY + 2)
  tick(x(0), dimensionY)
  tick(x(profile.stockLength), dimensionY)
  pdf.text(`Rohteillänge ${format(profile.stockLength)} mm`, x(profile.stockLength / 2), dimensionY - 2, { align: 'center' })
  pdf.text(`Profilbreite ${format(profile.width)} mm`, 40, 185)
  pdf.text(`Anfang: X bei Y=0 ${format(profile.startAtZero)} / bei Y=${format(profile.width)} ${format(profile.startAtWidth)} mm; Winkel ${format(profile.startAngle)}°`, 40, 192)
  pdf.text(`Ende: X bei Y=0 ${format(profile.endAtZero)} / bei Y=${format(profile.width)} ${format(profile.endAtWidth)} mm; Winkel ${format(profile.endAngle)}°`, 40, 199)
  pdf.text(`Draufsicht proportional, Maßstab 1:${format(1 / scale)}. Alle Maße in mm.`, 40, 206)
  pdf.text('Bohrungsangaben: Nr. / X ab Rohteil-Anfang / Y ab Bezugskante Y=0.', 40, 213)
  pdf.text('Schnittwinkel positiv bei zunehmendem X in Richtung Y=Profilbreite.', 40, 220)
}
