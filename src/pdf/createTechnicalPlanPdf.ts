import { jsPDF } from 'jspdf'
import { formatMillimeters } from '../domain/facadeLayout'
import { getFacadeProfileDepth } from '../domain/profileCoordinates'
import { createTechnicalPlanGeometry } from '../domain/technicalPlan'
import type { TechnicalPlanGeometry, TechnicalPlanInput } from '../domain/technicalPlan'
import { DEFAULT_UK_RAIL_VIEW } from '../domain/ukRailView'
import { UK_RAIL_PROFILE_CLEARANCE } from '../domain/ukRail'
import { getUkAngleProfileContours } from '../domain/ukMounting'
import { getSupportRailCorner } from '../domain/supportRail'
import {
  DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM,
  DIRECT_MOUNT_SCREW_SHAFT_LENGTH_MM,
} from '../domain/directMountScrew'
import { createProfileCutList } from '../domain/profileCutList'
import type { Point2D, UkMountingExportData, UkRailPlacement, UkRailProfile } from '../domain/types'

const PAGE_WIDTH = 420
const PAGE_HEIGHT = 297
const SVG_WIDTH = 1190.55
const SVG_HEIGHT = 841.89
const SVG_UNITS_PER_MM = SVG_WIDTH / PAGE_WIDTH
const DRAWING = {
  frameLeft: 20,
  frameRight: 400,
  frontTop: 62,
  infoTop: 252,
  viewGap: 16,
  dimensionRightSpace: 20,
  topViewLabelOffset: 6,
}
const MODEL_LINE_WIDTH = 0.2 * 25.4 / 72
const DIMENSION_LINE_WIDTH = 0.25 * 25.4 / 72

export interface TechnicalPlanPdfOptions extends TechnicalPlanInput {
  projectName: string
  date?: Date
  ukRailProfile?: UkRailProfile | null
  ukRailPlacements?: UkRailPlacement[]
  ukMountingData?: UkMountingExportData | null
}

export interface TechnicalPlanViewLayout {
  frontCenterX: number
  frontCenterY: number
  rightCenterX: number
  rightViewRightX: number
  topCenterY: number
  topViewFrontY: number
  topViewBackY: number
  scale: number
}

export interface TechnicalPlanPositionNumbers {
  profiles: number[]
  rails: number[]
  angles: number[]
  plasticBlocks: number | null
}

function nextPositionNumber(groups: Map<string, number>, key: string, next: { value: number }): number {
  const existing = groups.get(key)
  if (existing !== undefined) return existing
  const position = next.value
  next.value += 1
  groups.set(key, position)
  return position
}

export function getTechnicalPlanPositionNumbers(
  options: TechnicalPlanPdfOptions,
): TechnicalPlanPositionNumbers {
  const profileGroups = new Map<string, number>()
  const nextPosition = { value: 1 }
  const profileRows = createProfileCutList({
    configuration: options.configuration,
    layout: options.layout,
    wallContour: options.wallContour,
    placements: options.placements,
  })
  const profiles = profileRows.map((row) => nextPositionNumber(profileGroups, [
    row.profileName,
    row.longPointLength.toFixed(3),
    row.bottomAngle.toFixed(3),
    row.topAngle.toFixed(3),
    row.shortPointLength.toFixed(3),
    row.note,
  ].join('|'), nextPosition))
  const railGroups = new Map<string, number>()
  const rails = options.ukRailProfile && options.ukRailPlacements?.length
    ? options.ukRailPlacements.map((rail) => nextPositionNumber(
      railGroups,
      (rail.endX - rail.startX).toFixed(3),
      nextPosition,
    ))
    : []
  const angleGroups = new Map<string, number>()
  const angles = options.ukMountingData?.mountingMethod === 'aluminum-substructure'
    ? options.ukMountingData.anglePlacements.map((angle) => nextPositionNumber(
      angleGroups,
      (angle.endHeight - angle.startHeight).toFixed(3),
      nextPosition,
    ))
    : []
  const plasticBlocks = options.ukMountingData?.mountingMethod === 'direct-to-wall'
    && options.ukMountingData.fixings.length > 0
    ? nextPosition.value
    : null

  return { profiles, rails, angles, plasticBlocks }
}

export function calculateTechnicalPlanViewLayout(
  geometry: TechnicalPlanGeometry,
): TechnicalPlanViewLayout {
  const frontWidth = geometry.frontBounds.maximumX - geometry.frontBounds.minimumX
  const frontHeight = geometry.frontBounds.maximumY - geometry.frontBounds.minimumY
  const depthExtent = geometry.depthBounds.maximum - geometry.depthBounds.minimum
  const availableWidth = DRAWING.frameRight - DRAWING.frameLeft
    - DRAWING.viewGap - DRAWING.dimensionRightSpace
  const availableHeight = DRAWING.infoTop - DRAWING.frontTop
    - DRAWING.viewGap - DRAWING.topViewLabelOffset
  const requiredDenominator = Math.max(
    (frontWidth + depthExtent) / availableWidth,
    (frontHeight + depthExtent) / availableHeight,
  )
  const scale = Math.max(0.5, Math.ceil(requiredDenominator * 2) / 2)
  const frontCenterX = (
    DRAWING.frameLeft + DRAWING.frameRight
      - (geometry.frontBounds.minimumX + geometry.frontBounds.maximumX) / scale
      + depthExtent / scale + DRAWING.viewGap
      - DRAWING.dimensionRightSpace
  ) / 2
  const frontCenterY = DRAWING.frontTop + geometry.frontBounds.maximumY / scale
  const frontLeft = frontCenterX + geometry.frontBounds.minimumX / scale
  const frontBottom = frontCenterY - geometry.frontBounds.minimumY / scale
  const rightViewRightX = frontLeft - DRAWING.viewGap
  const rightCenterX = rightViewRightX - depthExtent / scale / 2
  const topViewBackY = frontBottom + DRAWING.viewGap
  const topViewFrontY = topViewBackY + depthExtent / scale
  const topCenterY = (topViewBackY + topViewFrontY) / 2

  return {
    frontCenterX,
    frontCenterY,
    rightCenterX,
    rightViewRightX,
    topCenterY,
    topViewFrontY,
    topViewBackY,
    scale,
  }
}

function createPlanGeometry(options: TechnicalPlanPdfOptions): TechnicalPlanGeometry {
  const geometry = createTechnicalPlanGeometry(options)
  if (!options.ukRailProfile
    || !(options.configuration.ukRailView ?? DEFAULT_UK_RAIL_VIEW).enabled
    || !options.ukRailPlacements?.length) {
    return geometry
  }
  const profileDepth = getFacadeProfileDepth(options.configuration.profile, options.placements ?? [])
  const mountingDepth = options.ukMountingData?.mountingMethod === 'aluminum-substructure'
    ? options.ukMountingData.angleProfile?.depth ?? 0
    : options.ukMountingData?.mountingMethod === 'direct-to-wall'
      ? options.ukMountingData.plasticBlockDepth
      : 0
  return {
    ...geometry,
    depthBounds: {
      ...geometry.depthBounds,
      maximum: Math.max(
        geometry.depthBounds.maximum,
        profileDepth + UK_RAIL_PROFILE_CLEARANCE + options.ukRailProfile.depth,
        profileDepth + UK_RAIL_PROFILE_CLEARANCE + options.ukRailProfile.depth + mountingDepth,
      ),
    },
  }
}

export function mapTopProjectionPoint(
  point: Point2D,
  geometry: TechnicalPlanGeometry,
): Point2D {
  const views = calculateTechnicalPlanViewLayout(geometry)
  const depthCenter = (geometry.depthBounds.minimum + geometry.depthBounds.maximum) / 2
  return {
    x: views.frontCenterX + point.x / views.scale,
    y: views.topCenterY - (point.y - depthCenter) / views.scale,
  }
}

export function mapRightProjectionPoint(
  point: Point2D,
  geometry: TechnicalPlanGeometry,
): Point2D {
  const views = calculateTechnicalPlanViewLayout(geometry)
  const depthCenter = (geometry.depthBounds.minimum + geometry.depthBounds.maximum) / 2
  return {
    x: views.rightCenterX + (point.x - depthCenter) / views.scale,
    y: views.frontCenterY - point.y / views.scale,
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value)
}

function spacingDescription(spacings: number[]): string {
  const groups: { spacing: number; count: number }[] = []
  for (const spacing of spacings) {
    const last = groups.at(-1)
    if (last && Math.abs(last.spacing - spacing) < 1e-7) last.count += 1
    else groups.push({ spacing, count: 1 })
  }
  return groups
    .map(({ spacing, count }) => `${formatNumber(spacing)} mm${count > 1 ? ` (${count}×)` : ''}`)
    .join(' · ')
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function svgText(
  text: string,
  x: number,
  y: number,
  options: { anchor?: 'start' | 'middle' | 'end'; rotate?: number } = {},
): string {
  const anchor = options.anchor ?? 'start'
  const rotation = options.rotate === undefined ? '' : ` transform="rotate(${options.rotate} ${x} ${y})"`
  return `<text x="${x}" y="${y}" text-anchor="${anchor}"${rotation} font-family="Arial, sans-serif" font-size="8">${escapeXml(text)}</text>`
}

function pageSvgPoint(x: number, y: number): Point2D {
  return { x: x * SVG_UNITS_PER_MM, y: y * SVG_UNITS_PER_MM }
}

function svgTextMm(
  text: string,
  x: number,
  y: number,
  options: Parameters<typeof svgText>[3] = {},
): string {
  const point = pageSvgPoint(x, y)
  return svgText(text, point.x, point.y, options)
}

function buildSheetLabels(
  options: TechnicalPlanPdfOptions,
  geometry: TechnicalPlanGeometry,
): string {
  const { configuration, layout, projectName, date = new Date() } = options
  const dateText = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date)
  const views = calculateTechnicalPlanViewLayout(geometry)
  const dimensionRight = views.frontCenterX + geometry.facadeWidth / views.scale / 2
  const dimensionBottom = views.frontCenterY + geometry.facadeHeight / views.scale / 2
  const horizontalDimensionY = dimensionBottom + 8
  const verticalDimensionX = dimensionRight + 5.5
  const actualSpacings = layout.spacings.length > 0
    ? spacingDescription(layout.spacings)
    : `${formatNumber(layout.nominalSpacing)} mm`
  const text = [
    svgTextMm(`Projekt: ${projectName}`, 22, 44),
    svgTextMm(`Datum: ${dateText}`, 408, 44, { anchor: 'end' }),
    svgTextMm(`Maßstab 1:${views.scale} · Europäische Erstwinkelprojektion · Maße in mm`, 22, 49),
    svgTextMm('Vorderansicht', views.frontCenterX, 57, { anchor: 'middle' }),
    svgTextMm('Rechtsansicht', views.rightCenterX, dimensionBottom + 7, { anchor: 'middle' }),
    svgTextMm(
      'Draufsicht',
      views.frontCenterX,
      views.topViewFrontY + DRAWING.topViewLabelOffset,
      { anchor: 'middle' },
    ),
    svgTextMm(
      `${formatMillimeters(geometry.facadeWidth)} mm`,
      views.frontCenterX,
      horizontalDimensionY + 4,
      { anchor: 'middle' },
    ),
    svgTextMm(
      `${formatMillimeters(geometry.facadeHeight)} mm`,
      verticalDimensionX + 2.5,
      views.frontCenterY,
      { anchor: 'middle', rotate: -90 },
    ),
    svgTextMm(
      `Profile: ${layout.profileCount} · Profiltyp: ${[...new Set((options.placements ?? []).filter((placement) => !placement.isSwitchProfile).map((placement) => placement.profile.name))].join(' / ') || configuration.profile.name} · Nennachsmaß: ${formatMillimeters(layout.nominalSpacing)} mm`,
      22,
      260,
    ),
    svgTextMm(
      `Achsabstände: ${actualSpacings}`,
      22,
      266,
    ),
    ...(options.ukRailProfile
      && (configuration.ukRailView ?? DEFAULT_UK_RAIL_VIEW).enabled
      ? [svgTextMm(`UK-Schiene: ${options.ukRailPlacements?.length ?? 0} Teilstücke · maximale Stücklänge 6.000 mm · Profilabstand 7,5 mm`, 22, 272)]
      : []),
    ...(options.ukMountingData?.mountingMethod === 'direct-to-wall'
      ? [svgTextMm(
          `Direktmontage: ${options.ukMountingData.fixings.length} Löcher Ø ${formatNumber(options.ukMountingData.holeDiameter)} mm · ${options.ukMountingData.squareTimbers.length > 0 ? `${options.ukMountingData.squareTimbers.length} Kanthölzer ${formatNumber(options.ukMountingData.squareTimbers[0].width)} × ${formatNumber(options.ukMountingData.plasticBlockDepth)} mm` : `Kunststoffklötze 60 × 60 × ${formatNumber(options.ukMountingData.plasticBlockDepth)} mm`} · Abstand Schienenhinterkante–Mauer ${formatNumber(options.ukMountingData.directMountClearance)} mm · Rest nach Klotz ${formatNumber(options.ukMountingData.remainingWallClearance)} mm`,
          22,
          278,
        )]
      : options.ukMountingData?.mountingMethod === 'aluminum-substructure'
        ? [svgTextMm(
            `Alu-UK: ${options.ukMountingData.anglePlacements.length} L-Winkel 50 × 40 × 2 mm · Achsabstand maximal 800 mm`,
            22,
            278,
          )]
        : []),
    svgTextMm('Positionsnummern entsprechen der Positionsspalte der Zuschnittliste.', 22, 284),
  ]
  return text.join('')
}

export function createTechnicalPlanSheetSvg(
  templateSvg: string,
  options: TechnicalPlanPdfOptions,
): string {
  if (!templateSvg.includes('<svg')) {
    throw new Error('Die A3-Layoutvorlage ist keine gültige SVG-Datei.')
  }
  const geometry = createPlanGeometry(options)
  const templateDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(templateSvg)}`
  const labels = buildSheetLabels(options, geometry)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}"><image href="${templateDataUri}" width="${SVG_WIDTH}" height="${SVG_HEIGHT}"/>${labels}</svg>`
}

export async function rasterizeTechnicalPlanSheet(sheetSvg: string): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Der PDF-Plan kann nur in einer Browserumgebung gerendert werden.')
  }

  const imageUrl = URL.createObjectURL(new Blob([sheetSvg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Die A3-Layoutvorlage konnte nicht gerendert werden.'))
      image.src = imageUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(PAGE_WIDTH / 25.4 * 300)
    canvas.height = Math.round(PAGE_HEIGHT / 25.4 * 300)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Für den PDF-Export ist keine Canvas-Zeichenfläche verfügbar.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function drawPolyline(
  pdf: jsPDF,
  points: Point2D[],
  map: (point: Point2D) => Point2D,
  closed = false,
): void {
  if (points.length < 2) return
  const mapped = points.map(map)
  for (let index = 0; index < mapped.length - 1; index += 1) {
    pdf.line(mapped[index].x, mapped[index].y, mapped[index + 1].x, mapped[index + 1].y)
  }
  if (closed) {
    pdf.line(mapped[mapped.length - 1].x, mapped[mapped.length - 1].y, mapped[0].x, mapped[0].y)
  }
}

function drawArrowHead(
  pdf: jsPDF,
  tip: Point2D,
  toward: Point2D,
): void {
  const dx = toward.x - tip.x
  const dy = toward.y - tip.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return
  const unitX = dx / length
  const unitY = dy / length
  const arrowLength = 1.5
  const arrowHalfWidth = 0.55
  const base = { x: tip.x + unitX * arrowLength, y: tip.y + unitY * arrowLength }
  const perpendicular = { x: -unitY * arrowHalfWidth, y: unitX * arrowHalfWidth }
  pdf.line(tip.x, tip.y, base.x + perpendicular.x, base.y + perpendicular.y)
  pdf.line(tip.x, tip.y, base.x - perpendicular.x, base.y - perpendicular.y)
}

function drawPositionTag(pdf: jsPDF, position: number, center: Point2D): void {
  const width = 4.2
  const height = 3.2
  pdf.setDrawColor(30, 30, 30)
  pdf.setFillColor(255, 255, 255)
  pdf.setLineWidth(0.12)
  pdf.rect(center.x - width / 2, center.y - height / 2, width, height, 'FD')
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(3.8)
  pdf.text(String(position).padStart(3, '0'), center.x, center.y + 1.1, { align: 'center' })
}

function drawDimensions(
  pdf: jsPDF,
  geometry: TechnicalPlanGeometry,
  scale: number,
): void {
  const views = calculateTechnicalPlanViewLayout(geometry)
  const left = views.frontCenterX - geometry.facadeWidth / scale / 2
  const right = views.frontCenterX + geometry.facadeWidth / scale / 2
  const top = views.frontCenterY - geometry.facadeHeight / scale / 2
  const bottom = views.frontCenterY + geometry.facadeHeight / scale / 2
  const horizontalY = bottom + 8
  const verticalX = right + 5.5

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(DIMENSION_LINE_WIDTH)
  pdf.line(left, bottom + 1.5, left, horizontalY)
  pdf.line(right, bottom + 1.5, right, horizontalY)
  pdf.line(left, horizontalY, right, horizontalY)
  drawArrowHead(pdf, { x: left, y: horizontalY }, { x: left + 1, y: horizontalY })
  drawArrowHead(pdf, { x: right, y: horizontalY }, { x: right - 1, y: horizontalY })

  pdf.line(right + 1.5, top, verticalX, top)
  pdf.line(right + 1.5, bottom, verticalX, bottom)
  pdf.line(verticalX, top, verticalX, bottom)
  drawArrowHead(pdf, { x: verticalX, y: top }, { x: verticalX, y: top + 1 })
  drawArrowHead(pdf, { x: verticalX, y: bottom }, { x: verticalX, y: bottom - 1 })
}

function drawSupportRailFront(
  pdf: jsPDF,
  options: TechnicalPlanPdfOptions,
  map: (point: Point2D) => Point2D,
): void {
  const data = options.ukMountingData
  if (!data?.supportRailProfile) return
  const profile = data.supportRailProfile
  const low = -profile.supportHeight
  const high = profile.height - profile.supportHeight
  const shift = (point: Point2D): Point2D => ({
    x: point.x - options.configuration.width / 2,
    y: point.y - options.configuration.height / 2,
  })
  for (const piece of data.supportRailPieces) {
    drawPolyline(pdf, [
      shift(getSupportRailCorner(piece, 'start', low)),
      shift(getSupportRailCorner(piece, 'end', low)),
      shift(getSupportRailCorner(piece, 'end', high)),
      shift(getSupportRailCorner(piece, 'start', high)),
    ], map, true)
  }
}

function getSupportRailRearDepth(options: TechnicalPlanPdfOptions): number {
  return getFacadeProfileDepth(options.configuration.profile, options.placements ?? [])
    + UK_RAIL_PROFILE_CLEARANCE + (options.ukRailProfile?.depth ?? 0)
}

function drawSupportRailTop(
  pdf: jsPDF,
  options: TechnicalPlanPdfOptions,
  map: (point: Point2D) => Point2D,
): void {
  const data = options.ukMountingData
  if (!data?.supportRailProfile || !options.ukRailProfile) return
  const profile = data.supportRailProfile
  const rear = getSupportRailRearDepth(options)
  for (const piece of data.supportRailPieces) {
    const xs = [-profile.supportHeight, profile.height - profile.supportHeight].flatMap((height) => [
      getSupportRailCorner(piece, 'start', height).x,
      getSupportRailCorner(piece, 'end', height).x,
    ])
    const left = Math.min(...xs) - options.configuration.width / 2
    const right = Math.max(...xs) - options.configuration.width / 2
    drawPolyline(pdf, [
      { x: left, y: rear - profile.depth },
      { x: right, y: rear - profile.depth },
      { x: right, y: rear },
      { x: left, y: rear },
    ], map, true)
  }
}

function drawSupportRailRight(
  pdf: jsPDF,
  options: TechnicalPlanPdfOptions,
  map: (point: Point2D) => Point2D,
): void {
  const data = options.ukMountingData
  if (!data?.supportRailProfile || !options.ukRailProfile) return
  const profile = data.supportRailProfile
  const [outer] = profile.contours
  if (!outer) return
  const rear = getSupportRailRearDepth(options)
  for (const piece of data.supportRailPieces) {
    for (const edge of ['start', 'end'] as const) {
      drawPolyline(pdf, outer.points.map((point) => ({
        x: rear - point.x,
        y: getSupportRailCorner(piece, edge, point.y - profile.supportHeight).y - options.configuration.height / 2,
      })), map, true)
    }
  }
}

function drawFrontProjection(
  pdf: jsPDF,
  geometry: TechnicalPlanGeometry,
  scale: number,
  options: TechnicalPlanPdfOptions,
): void {
  const views = calculateTechnicalPlanViewLayout(geometry)
  const map = (point: Point2D): Point2D => ({
    x: views.frontCenterX + point.x / scale,
    y: views.frontCenterY - point.y / scale,
  })
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(MODEL_LINE_WIDTH)
  drawPolyline(pdf, geometry.wallOutline, map, true)
  for (const part of geometry.masonryProjections.slice(1)) {
    drawPolyline(pdf, part.outline, map, true)
  }
  if (options.ukRailProfile
    && (options.configuration.ukRailView ?? DEFAULT_UK_RAIL_VIEW).enabled) {
    const crossSectionHeights = options.ukRailProfile.contours
      .flatMap((contour) => contour.points.map((point) => point.y))
    const lower = Math.min(...crossSectionHeights)
    const upper = Math.max(...crossSectionHeights)
    for (const rail of options.ukRailPlacements ?? []) {
      const centerY = rail.centerHeight - options.configuration.height / 2
      drawPolyline(pdf, [
        { x: rail.startX - options.configuration.width / 2, y: centerY + lower },
        { x: rail.endX - options.configuration.width / 2, y: centerY + lower },
        { x: rail.endX - options.configuration.width / 2, y: centerY + upper },
        { x: rail.startX - options.configuration.width / 2, y: centerY + upper },
      ], map, true)
    }
  }
  if (options.ukMountingData?.mountingMethod === 'direct-to-wall') {
    for (const timber of options.ukMountingData.squareTimbers) {
      drawPolyline(pdf, [
        { x: timber.x - timber.width / 2 - options.configuration.width / 2, y: timber.bottom - options.configuration.height / 2 },
        { x: timber.x + timber.width / 2 - options.configuration.width / 2, y: timber.bottom - options.configuration.height / 2 },
        { x: timber.x + timber.width / 2 - options.configuration.width / 2, y: timber.top - options.configuration.height / 2 },
        { x: timber.x - timber.width / 2 - options.configuration.width / 2, y: timber.top - options.configuration.height / 2 },
      ], map, true)
    }
    for (const fixing of options.ukMountingData.fixings) {
      const center = map({
        x: fixing.x - options.configuration.width / 2,
        y: fixing.centerHeight - options.configuration.height / 2,
      })
      pdf.circle(center.x, center.y, options.ukMountingData.holeDiameter / 2 / scale)
    }
  } else if (options.ukMountingData?.mountingMethod === 'aluminum-substructure') {
    for (const angle of options.ukMountingData.anglePlacements) {
      const halfWidth = (options.ukMountingData.angleProfile?.width ?? 40) / 2
      drawPolyline(pdf, [
        { x: angle.centerX - halfWidth - options.configuration.width / 2, y: angle.startHeight - options.configuration.height / 2 },
        { x: angle.centerX + halfWidth - options.configuration.width / 2, y: angle.startHeight - options.configuration.height / 2 },
        { x: angle.centerX + halfWidth - options.configuration.width / 2, y: angle.endHeight - options.configuration.height / 2 },
        { x: angle.centerX - halfWidth - options.configuration.width / 2, y: angle.endHeight - options.configuration.height / 2 },
      ], map, true)
    }
  }
  drawSupportRailFront(pdf, options, map)
  for (const profile of geometry.profileProjections) {
    for (const contour of profile.elevationContours) {
      drawPolyline(pdf, contour.lower, map, true)
      drawPolyline(pdf, contour.upper, map, true)
    }
    for (const edge of profile.extrusionEdges) {
      drawPolyline(pdf, [
        { x: edge.x, y: edge.bottom },
        { x: edge.x, y: edge.top },
      ], map)
    }
  }

  const positionNumbers = getTechnicalPlanPositionNumbers(options)
  for (const [index, placement] of (options.placements ?? []).entries()) {
    const position = positionNumbers.profiles[index]
    if (position === undefined) continue
    drawPositionTag(pdf, position, map({
      x: placement.axisX + (placement.profileOffsetX ?? 0),
      y: index % 2 === 0 ? 0 : 8,
    }))
  }
  for (const [index, rail] of (options.ukRailPlacements ?? []).entries()) {
    const position = positionNumbers.rails[index]
    if (position === undefined) continue
    drawPositionTag(pdf, position, map({
      x: (rail.startX + rail.endX) / 2 - options.configuration.width / 2,
      y: rail.centerHeight - options.configuration.height / 2,
    }))
  }
  if (options.ukMountingData?.mountingMethod === 'aluminum-substructure') {
    for (const [index, angle] of options.ukMountingData.anglePlacements.entries()) {
      const position = positionNumbers.angles[index]
      if (position === undefined) continue
      drawPositionTag(pdf, position, map({
        x: angle.centerX - options.configuration.width / 2,
        y: (angle.startHeight + angle.endHeight) / 2 - options.configuration.height / 2,
      }))
    }
  } else if (options.ukMountingData?.mountingMethod === 'direct-to-wall'
    && positionNumbers.plasticBlocks !== null) {
    for (const fixing of options.ukMountingData.fixings) {
      drawPositionTag(pdf, positionNumbers.plasticBlocks, map({
        x: fixing.x - options.configuration.width / 2,
        y: fixing.centerHeight - options.configuration.height / 2,
      }))
    }
  }
}

function drawTopProjection(
  pdf: jsPDF,
  geometry: TechnicalPlanGeometry,
  options: TechnicalPlanPdfOptions,
): void {
  const map = (point: Point2D): Point2D => mapTopProjectionPoint(point, geometry)
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(MODEL_LINE_WIDTH)
  for (const part of geometry.masonryProjections) {
    const xBounds = part.outline.map((point) => point.x)
    const left = Math.min(...xBounds)
    const right = Math.max(...xBounds)
    for (const depth of [part.depthStart, part.depthEnd]) {
      drawPolyline(pdf, [
        { x: left, y: depth },
        { x: right, y: depth },
      ], map)
    }
    if (options.ukRailProfile
      && (options.configuration.ukRailView ?? DEFAULT_UK_RAIL_VIEW).enabled) {
      const profileDepth = getFacadeProfileDepth(options.configuration.profile, options.placements ?? [])
        + UK_RAIL_PROFILE_CLEARANCE
      for (const rail of options.ukRailPlacements ?? []) {
        drawPolyline(pdf, [
          { x: rail.startX - options.configuration.width / 2, y: profileDepth },
          { x: rail.endX - options.configuration.width / 2, y: profileDepth },
          { x: rail.endX - options.configuration.width / 2, y: profileDepth + options.ukRailProfile.depth },
          { x: rail.startX - options.configuration.width / 2, y: profileDepth + options.ukRailProfile.depth },
        ], map, true)
      }
    }
    for (const x of [left, right]) {
      drawPolyline(pdf, [
        { x, y: part.depthStart },
        { x, y: part.depthEnd },
      ], map)
    }
  }
  for (const profile of geometry.profileProjections) {
    for (const section of profile.sections) drawPolyline(pdf, section, map, true)
  }
  if (options.ukMountingData && options.ukRailProfile) {
    const profileDepth = getFacadeProfileDepth(options.configuration.profile, options.placements ?? [])
      + UK_RAIL_PROFILE_CLEARANCE
    const railBackDepth = profileDepth + options.ukRailProfile.depth
    drawSupportRailTop(pdf, options, map)
    if (options.ukMountingData.mountingMethod === 'direct-to-wall') {
      for (const timber of options.ukMountingData.squareTimbers) {
        const x = timber.x - options.configuration.width / 2
        drawPolyline(pdf, [
          { x: x - timber.width / 2, y: railBackDepth },
          { x: x + timber.width / 2, y: railBackDepth },
          { x: x + timber.width / 2, y: railBackDepth + timber.depth },
          { x: x - timber.width / 2, y: railBackDepth + timber.depth },
        ], map, true)
      }
      const hasTimbers = options.ukMountingData.squareTimbers.length > 0
      for (const fixing of options.ukMountingData.fixings) {
        const x = fixing.x - options.configuration.width / 2
        const blockBackDepth = railBackDepth + options.ukMountingData.plasticBlockDepth
        if (!hasTimbers) {
          drawPolyline(pdf, [
            { x: x - 30, y: railBackDepth },
            { x: x + 30, y: railBackDepth },
            { x: x + 30, y: blockBackDepth },
            { x: x - 30, y: blockBackDepth },
          ], map, true)
        }
        const screwStartDepth = profileDepth
          + options.ukRailProfile.screwHeadPlaneDepth
          - DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM
        const screwEndDepth = Math.min(
          screwStartDepth + DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM + DIRECT_MOUNT_SCREW_SHAFT_LENGTH_MM,
          blockBackDepth,
        )
        drawPolyline(pdf, [
          { x, y: screwStartDepth },
          { x, y: screwEndDepth },
        ], map)
      }
    } else if (options.ukMountingData.angleProfile) {
      for (const angle of options.ukMountingData.anglePlacements) {
        for (const contour of getUkAngleProfileContours(
          options.ukMountingData.angleProfile,
          angle.mirrored ?? false,
        )) {
          drawPolyline(pdf, contour.points.map((point) => ({
            x: angle.centerX - options.configuration.width / 2 + point.x,
            y: railBackDepth + point.y,
          })), map, true)
        }
      }
    }
  }
}

function drawRightProjection(
  pdf: jsPDF,
  geometry: TechnicalPlanGeometry,
  options: TechnicalPlanPdfOptions,
): void {
  const map = (point: Point2D): Point2D => mapRightProjectionPoint(point, geometry)
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(MODEL_LINE_WIDTH)
  for (const part of geometry.masonryProjections) {
    const bottom = Math.min(...part.outline.map((point) => point.y))
    const top = Math.max(...part.outline.map((point) => point.y))
    drawPolyline(pdf, [
      { x: part.depthStart, y: bottom },
      { x: part.depthEnd, y: bottom },
      { x: part.depthEnd, y: top },
      { x: part.depthStart, y: top },
    ], map, true)
  }
  if (options.ukRailProfile
    && (options.configuration.ukRailView ?? DEFAULT_UK_RAIL_VIEW).enabled) {
    const profileDepth = getFacadeProfileDepth(options.configuration.profile, options.placements ?? [])
      + UK_RAIL_PROFILE_CLEARANCE
    const positionNumbers = getTechnicalPlanPositionNumbers(options)
    for (const [index, rail] of (options.ukRailPlacements ?? []).entries()) {
      for (const contour of options.ukRailProfile.contours) {
        drawPolyline(pdf, contour.points.map((point) => ({
          x: profileDepth + point.x,
          y: rail.centerHeight - options.configuration.height / 2 + point.y,
        })), map, true)
      }
      const position = positionNumbers.rails[index]
      if (position !== undefined) {
        drawPositionTag(pdf, position, map({
          x: profileDepth + options.ukRailProfile.depth / 2,
          y: rail.centerHeight - options.configuration.height / 2,
        }))
      }
    }
  }
  drawSupportRailRight(pdf, options, map)
  if (options.ukMountingData?.mountingMethod === 'direct-to-wall' && options.ukRailProfile) {
    const profileDepth = getFacadeProfileDepth(options.configuration.profile, options.placements ?? [])
      + UK_RAIL_PROFILE_CLEARANCE
    const railBackDepth = profileDepth + options.ukRailProfile.depth
    for (const timber of options.ukMountingData.squareTimbers) {
      drawPolyline(pdf, [
        { x: railBackDepth, y: timber.bottom - options.configuration.height / 2 },
        { x: railBackDepth + timber.depth, y: timber.bottom - options.configuration.height / 2 },
        { x: railBackDepth + timber.depth, y: timber.top - options.configuration.height / 2 },
        { x: railBackDepth, y: timber.top - options.configuration.height / 2 },
      ], map, true)
    }
    const hasTimbers = options.ukMountingData.squareTimbers.length > 0
    for (const fixing of options.ukMountingData.fixings) {
      const centerHeight = fixing.centerHeight - options.configuration.height / 2
      const blockBackDepth = railBackDepth + options.ukMountingData.plasticBlockDepth
      if (!hasTimbers) {
        drawPolyline(pdf, [
          { x: railBackDepth, y: centerHeight - 30 },
          { x: blockBackDepth, y: centerHeight - 30 },
          { x: blockBackDepth, y: centerHeight + 30 },
          { x: railBackDepth, y: centerHeight + 30 },
        ], map, true)
      }
      const screwStartDepth = profileDepth
        + options.ukRailProfile.screwHeadPlaneDepth
        - DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM
      const screwEndDepth = Math.min(
        screwStartDepth + DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM + DIRECT_MOUNT_SCREW_SHAFT_LENGTH_MM,
        blockBackDepth,
      )
      drawPolyline(pdf, [
        { x: screwStartDepth, y: centerHeight },
        { x: screwEndDepth, y: centerHeight },
      ], map)
    }
  }
  const drawnEdges = new Set<string>()
  for (const profile of geometry.profileProjections) {
    for (const edge of profile.extrusionEdges) {
      const depth = profile.sections
        .flat()
        .filter((point) => Math.abs(point.x - edge.x) < 1e-7)
        .map((point) => point.y)
      for (const coordinate of depth) {
        const key = `${coordinate.toFixed(3)}:${edge.bottom.toFixed(3)}:${edge.top.toFixed(3)}`
        if (drawnEdges.has(key)) continue
        drawnEdges.add(key)
        drawPolyline(pdf, [
          { x: coordinate, y: edge.bottom },
          { x: coordinate, y: edge.top },
        ], map)
      }
    }
    profile.sections.forEach((section, sectionIndex) => {
      const elevation = profile.elevationContours[sectionIndex]
      drawPolyline(pdf, section.map((point, pointIndex) => ({
        x: point.y,
        y: elevation.lower[pointIndex].y,
      })), map, true)
      drawPolyline(pdf, section.map((point, pointIndex) => ({
        x: point.y,
        y: elevation.upper[pointIndex].y,
      })), map, true)
    })
  }
}

export function createTechnicalPlanPdf(
  options: TechnicalPlanPdfOptions,
  backgroundImage: string,
): Uint8Array {
  if (!backgroundImage.startsWith('data:image/png;base64,')) {
    throw new Error('Für den A3-Plan fehlt der gerenderte Vorlagenhintergrund.')
  }
  const geometry = createPlanGeometry(options)
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3',
    compress: true,
    putOnlyUsedFonts: true,
  })
  pdf.setProperties({
    title: `ALUFEFA Fassadenstudio – PDF: Ansicht gesamter Fassade – ${options.projectName}`,
    subject: 'Orthogonale Linienansichten der Fassade nach europäischer Projektionsanordnung',
    author: 'ALUFEFA Fassadenstudio',
    creator: 'ALUFEFA Fassadenstudio',
  })
  pdf.addImage(backgroundImage, 'PNG', 0, 0, PAGE_WIDTH, PAGE_HEIGHT)

  const views = calculateTechnicalPlanViewLayout(geometry)
  drawFrontProjection(pdf, geometry, views.scale, options)
  drawTopProjection(pdf, geometry, options)
  drawRightProjection(pdf, geometry, options)
  drawDimensions(pdf, geometry, views.scale)

  return new Uint8Array(pdf.output('arraybuffer'))
}
