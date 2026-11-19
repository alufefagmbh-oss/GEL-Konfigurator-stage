import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Download, FolderOpen, Plus, RotateCcw, Save, SaveAll, Trash2 } from 'lucide-react'
import { calculateSlabContour, DEFAULT_SLAB_THICKNESS, MAX_SLAB_DIMENSION, MIN_SLAB_DIMENSION, parseSlabAngle, parseSlabDimension } from './domain/concreteSlab'
import type { SlabSegment } from './domain/concreteSlab'
import { DEFAULT_GLASS_CONFIGURATION, parseSlabProject, serializeSlabProject, slabFileName } from './domain/slabProject'
import type { SlabProject } from './domain/slabProject'
import { DEFAULT_STATIC_ASSUMPTIONS, staticLoads } from './domain/staticAssumptions'
import type { StaticAssumptions } from './domain/staticAssumptions'
import { calculateProfileParts, maximumFixingSpacing, maximumProfileOffset, profileCenterlineLength } from './domain/railingProfile'
import type { ProfilePart } from './domain/railingProfile'
import { formatMeasurement } from './domain/measurementFormat'
import { SIDE_FIXING_AXIS_HEIGHT, SIDE_FIXING_HOLE_DIAMETER, STEEL_PLATE_HEIGHT, STEEL_PLATE_MARGIN, STEEL_PLATE_THICKNESS, maximumSideFixingSpacing } from './domain/railingMounting'
import type { RailingMounting } from './domain/railingMounting'
import {
  calculateGlassPanels,
  calculateRailingAccessories,
  DEFAULT_GLASS_PANEL_GAP,
  DEFAULT_MAX_GLASS_PANEL_WIDTH,
  GLASS_BOTTOM_HEIGHT,
  GLASS_GAP,
} from './domain/railingAccessories'
import type { GlassPanel, RailingAccessoryLayout } from './domain/railingAccessories'
import { GEL2001_PROFILE } from './dxf/gel2001Profile'
import { ConcreteSlabViewer } from './viewer/ConcreteSlabViewer'
import { RailingCalculationPanel } from './components/RailingCalculationPanel'
import { RailingManufacturingPanel } from './components/RailingManufacturingPanel'
import { DEFAULT_PRICE_LIST } from './domain/railingPricing'
import type { PriceList } from './domain/railingPricing'
import type { ViewerImage } from './viewer/viewerImage'

interface ProjectHandle {
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>
}

interface PickerWindow extends Window {
  showOpenFilePicker?: (options: { types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<ProjectHandle[]>
  showSaveFilePicker?: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<ProjectHandle>
}

const projectFileTypes = [{ description: 'Geländerprojekt', accept: { 'application/json': ['.gelaender.json'] } }]

function isCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.'
}

interface SegmentInput {
  id: number
  length: string
  angle: string
}

function NumberField({ label, value, onChange, angle = false, minimum, allowZero = false }: {
  label: string
  value: string
  onChange: (value: string) => void
  angle?: boolean
  minimum?: number
  allowZero?: boolean
}) {
  const errorId = useId()
  const parsedValue = angle
    ? parseSlabAngle(value)
    : allowZero && value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= MAX_SLAB_DIMENSION
      ? Number(value)
      : parseSlabDimension(value)
  const invalid = parsedValue === null || (!angle && minimum !== undefined && parsedValue < minimum)

  return (
    <div>
      <label className="field-label">
        <span>{label}</span>
        <span className="input-with-unit">
          <input
            type="number"
            min={angle ? undefined : minimum ?? MIN_SLAB_DIMENSION}
            max={angle ? undefined : MAX_SLAB_DIMENSION}
            step="any"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
          />
          <span>{angle ? '°' : 'mm'}</span>
        </span>
      </label>
      {invalid && <p className="dimension-error" id={errorId}>
        {angle ? 'Bitte einen Winkel größer als 0° und kleiner als 360° eingeben.' : minimum !== undefined && parsedValue !== null && parsedValue < minimum
          ? `Bitte mindestens ${formatMeasurement(minimum)} mm eingeben.`
          : `Bitte ein Maß zwischen ${formatMeasurement(MIN_SLAB_DIMENSION)} und ${formatMeasurement(MAX_SLAB_DIMENSION)} mm eingeben.`}
      </p>}
    </div>
  )
}

export default function App() {
  const nextId = useRef(1)
  const [segments, setSegments] = useState<SegmentInput[]>([{ id: 0, length: '3000', angle: '180' }])
  const [depthInput, setDepthInput] = useState('500')
  const [thicknessInput, setThicknessInput] = useState(String(DEFAULT_SLAB_THICKNESS))
  const [mounting, setMounting] = useState<RailingMounting>('7B')
  const concreteDimensions = useRef({ depth: '500', thickness: String(DEFAULT_SLAB_THICKNESS) })
  const [offsetInput, setOffsetInput] = useState('0')
  const [staticAssumptions, setStaticAssumptions] = useState<StaticAssumptions>(DEFAULT_STATIC_ASSUMPTIONS)
  const [glassHeightInput, setGlassHeightInput] = useState(String(DEFAULT_GLASS_CONFIGURATION.height))
  const [glassThicknessInput, setGlassThicknessInput] = useState(String(DEFAULT_GLASS_CONFIGURATION.paneThickness))
  const [maxGlassWidthInput, setMaxGlassWidthInput] = useState(String(DEFAULT_MAX_GLASS_PANEL_WIDTH))
  const [glassPanelGapInput, setGlassPanelGapInput] = useState(String(DEFAULT_GLASS_PANEL_GAP))
  const [glassFixing, setGlassFixing] = useState<'system' | 'none'>(DEFAULT_GLASS_CONFIGURATION.fixing)
  const [projectName, setProjectName] = useState('')
  const [prices, setPrices] = useState<PriceList>({ ...DEFAULT_PRICE_LIST })
  const [priceListName, setPriceListName] = useState('')
  const [fileHandle, setFileHandle] = useState<ProjectHandle | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [projectMessage, setProjectMessage] = useState('')
  const [projectError, setProjectError] = useState('')
  const [projectDownload, setProjectDownload] = useState<{ url: string; name: string; snapshot: string } | null>(null)
  const [stepDownload, setStepDownload] = useState<{ url: string; name: string; snapshot: string } | null>(null)
  const [stepStatus, setStepStatus] = useState('')
  const [stepProgress, setStepProgress] = useState(0)
  const [stepError, setStepError] = useState('')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [viewerKey, setViewerKey] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const captureViewerRef = useRef<(() => ViewerImage) | null>(null)
  useEffect(() => () => { if (projectDownload) URL.revokeObjectURL(projectDownload.url) }, [projectDownload])
  useEffect(() => () => { if (stepDownload) URL.revokeObjectURL(stepDownload.url) }, [stepDownload])
  const depth = parseSlabDimension(depthInput)
  const thickness = parseSlabDimension(thicknessInput)
  const glassHeight = parseSlabDimension(glassHeightInput)
  const glassThickness = parseSlabDimension(glassThicknessInput)
  const maxGlassWidth = parseSlabDimension(maxGlassWidthInput)
  const glassPanelGap = glassPanelGapInput.trim() !== '' && Number.isFinite(Number(glassPanelGapInput))
    && Number(glassPanelGapInput) >= 0 && Number(glassPanelGapInput) <= MAX_SLAB_DIMENSION
    ? Number(glassPanelGapInput) : null
  const contour = useMemo(() => {
    const parsed: SlabSegment[] = []
    for (const segment of segments) {
      const length = parseSlabDimension(segment.length)
      const angle = parseSlabAngle(segment.angle)
      if (length === null || angle === null) return { points: null, dimensions: null, error: 'Bitte gültige Maße und Winkel eingeben.' }
      parsed.push({ length, angle })
    }
    return depth === null ? { points: null, dimensions: null, error: 'Bitte gültige Maße und Winkel eingeben.' } : calculateSlabContour(parsed, depth)
  }, [segments, depth])
  const maxOffset = depth === null ? null : maximumProfileOffset(depth, GEL2001_PROFILE)
  const profileWidth = Math.max(...GEL2001_PROFILE.map((point) => point.x))
  const offset = mounting === '7A'
    ? -profileWidth
    : offsetInput.trim() && Number.isFinite(Number(offsetInput)) && Number(offsetInput) >= 0 && maxOffset !== null && Number(offsetInput) <= maxOffset
      ? Number(offsetInput) : null
  const profileLayout = useMemo((): { parts: ProfilePart[]; accessories: RailingAccessoryLayout; error: string } => {
    const emptyAccessories: RailingAccessoryLayout = { sealLips: [], clampWedges: [], glassShoes: [] }
    if (mounting === 'none') return { parts: [], accessories: emptyAccessories, error: '' }
    if (mounting === '7B' && maxOffset !== null && maxOffset < 0) return { parts: [], accessories: emptyAccessories, error: 'Die Betondecke ist schmaler als das Profil.' }
    if (offset === null) return { parts: [], accessories: emptyAccessories, error: maxOffset === null ? 'Bitte zuerst eine gültige Kontur eingeben.' : `Bitte einen Randabstand von 0 bis ${formatMeasurement(maxOffset)} mm eingeben, damit das Profil auf der Betondecke bleibt.` }
    if (!contour.dimensions) return { parts: [], accessories: emptyAccessories, error: 'Bitte zuerst eine gültige Kontur konfigurieren.' }
    try {
      return {
        parts: calculateProfileParts(contour.dimensions, GEL2001_PROFILE, offset, staticAssumptions, mounting),
        accessories: glassFixing === 'system'
          ? calculateRailingAccessories(contour.dimensions, offset, GEL2001_PROFILE)
          : emptyAccessories,
        error: '',
      }
    } catch (error) { return { parts: [], accessories: emptyAccessories, error: errorMessage(error) } }
  }, [mounting, offset, maxOffset, contour.dimensions, staticAssumptions, glassFixing])
  const glassPanelLayout = useMemo((): { panels: GlassPanel[]; error: string } => {
    if (mounting === 'none' || offset === null || !contour.dimensions || glassHeight === null
      || glassHeight <= GLASS_BOTTOM_HEIGHT || glassThickness === null || maxGlassWidth === null || glassPanelGap === null) {
      return { panels: [], error: '' }
    }
    try {
      return {
        panels: calculateGlassPanels(contour.dimensions, offset, GEL2001_PROFILE, glassHeight, glassThickness, maxGlassWidth, glassPanelGap),
        error: '',
      }
    } catch (error) {
      return { panels: [], error: errorMessage(error) }
    }
  }, [mounting, offset, contour.dimensions, glassHeight, glassThickness, maxGlassWidth, glassPanelGap])
  const glassPanels = glassPanelLayout.panels
  const updateSegment = (id: number, update: Partial<SegmentInput>) => {
    setSegments((current) => current.map((segment) => segment.id === id ? { ...segment, ...update } : segment))
  }
  const formatDimension = (value: number | null) => value === null
    ? '–'
    : `${formatMeasurement(value)} mm`
  const project: SlabProject | null = projectName.trim() && depth !== null && thickness !== null && glassHeight !== null && glassHeight > GLASS_BOTTOM_HEIGHT && glassThickness !== null && maxGlassWidth !== null && glassPanelGap !== null && contour.points && (mounting === 'none' || offset !== null) && !profileLayout.error && !glassPanelLayout.error
    ? {
      projectName: projectName.trim(), depth, thickness,
      segments: segments.map((segment) => ({ length: Number(segment.length), angle: Number(segment.angle) })),
      railing: { mounting, offset: mounting === '7A' ? 0 : offset ?? 0 },
      glass: { height: glassHeight, paneThickness: glassThickness, maxPanelWidth: maxGlassWidth, panelGap: glassPanelGap, fixing: glassFixing },
      staticAssumptions,
    }
    : null
  const snapshot = project ? serializeSlabProject(project) : ''
  const stepSnapshot = JSON.stringify([contour.points, thickness, projectName, profileLayout.parts, profileLayout.accessories, glassPanels, mounting, glassFixing])
  const isSaved = !!snapshot && snapshot === savedSnapshot
  const loads = staticLoads(staticAssumptions)

  function resetProject() {
    if (!isSaved && !window.confirm('Nicht gespeicherte Änderungen gehen beim Zurücksetzen verloren. Fortfahren?')) return
    nextId.current = 1
    setSegments([{ id: 0, length: '3000', angle: '180' }])
    setDepthInput('500')
    setThicknessInput(String(DEFAULT_SLAB_THICKNESS))
    concreteDimensions.current = { depth: '500', thickness: String(DEFAULT_SLAB_THICKNESS) }
    setMounting('7B')
    setOffsetInput('0')
    setStaticAssumptions(DEFAULT_STATIC_ASSUMPTIONS)
    setGlassHeightInput(String(DEFAULT_GLASS_CONFIGURATION.height))
    setGlassThicknessInput(String(DEFAULT_GLASS_CONFIGURATION.paneThickness))
    setMaxGlassWidthInput(String(DEFAULT_MAX_GLASS_PANEL_WIDTH))
    setGlassPanelGapInput(String(DEFAULT_GLASS_PANEL_GAP))
    setGlassFixing(DEFAULT_GLASS_CONFIGURATION.fixing)
    setProjectName('')
    setFileHandle(null)
    setSavedSnapshot('')
    setProjectMessage('')
    setProjectError('')
    setProjectDownload(null)
    setStepDownload(null)
    setStepStatus('')
    setStepProgress(0)
    setStepError('')
    setViewerKey((current) => current + 1)
  }

  function prepareProjectDownload(contents: string, name: string, message: string) {
    setProjectDownload({ url: URL.createObjectURL(new Blob([contents], { type: 'application/json' })), name, snapshot: contents })
    setProjectMessage(message)
  }

  async function saveProject(saveAs: boolean) {
    setProjectError('')
    setProjectMessage('')
    setProjectDownload(null)
    if (!project || !snapshot) {
      setProjectError('Bitte einen Projektnamen sowie gültige Maße und Winkel eingeben.')
      return
    }
    const suggestedName = slabFileName(project.projectName, 'gelaender.json')
    setBusy(true)
    try {
      const picker = window as PickerWindow
      let handle = saveAs ? null : fileHandle
      if (!handle && picker.showSaveFilePicker) {
        handle = await picker.showSaveFilePicker({ suggestedName, types: projectFileTypes })
      }
      if (!handle) {
        prepareProjectDownload(snapshot, suggestedName, 'Direktes Speichern wird nicht unterstützt. Projektdatei über den folgenden Link herunterladen.')
        return
      }
      const writable = await handle.createWritable()
      try {
        await writable.write(snapshot)
        await writable.close()
      } catch (error) {
        try { await writable.abort() } catch (abortError) { console.error('Projektdatei konnte nicht abgebrochen werden:', abortError) }
        throw error
      }
      setFileHandle(handle)
      setSavedSnapshot(snapshot)
      setProjectMessage('Projekt gespeichert.')
    } catch (error) {
      if (isCancelled(error)) {
        prepareProjectDownload(snapshot, suggestedName, 'Speichern wurde abgebrochen oder der Dateidialog ist nicht verfügbar. Alternativ die Projektdatei über den folgenden Link herunterladen.')
      } else {
        setProjectError(`Projekt konnte nicht gespeichert werden: ${errorMessage(error)}`)
        prepareProjectDownload(snapshot, suggestedName, 'Die bestehende Datei wurde nicht aktualisiert. Alternativ die aktuelle Version herunterladen.')
      }
    } finally { setBusy(false) }
  }

  async function loadProject(file: File, handle: ProjectHandle | null) {
    setProjectError('')
    setProjectMessage('')
    try {
      const loaded = parseSlabProject(await file.text())
      setProjectName(loaded.projectName)
      if (loaded.railing?.mounting !== '7A') {
        concreteDimensions.current = { depth: String(loaded.depth), thickness: String(loaded.thickness) }
      }
      setDepthInput(String(loaded.railing?.mounting === '7A' ? STEEL_PLATE_THICKNESS : loaded.depth))
      setThicknessInput(String(loaded.railing?.mounting === '7A' ? STEEL_PLATE_HEIGHT : loaded.thickness))
      setMounting(loaded.railing?.mounting ?? 'none')
      setOffsetInput(String(loaded.railing?.offset ?? 0))
      setGlassHeightInput(String(loaded.glass?.height ?? DEFAULT_GLASS_CONFIGURATION.height))
      setGlassThicknessInput(String(loaded.glass?.paneThickness ?? DEFAULT_GLASS_CONFIGURATION.paneThickness))
      setMaxGlassWidthInput(String(loaded.glass?.maxPanelWidth ?? DEFAULT_MAX_GLASS_PANEL_WIDTH))
      setGlassPanelGapInput(String(loaded.glass?.panelGap ?? DEFAULT_GLASS_PANEL_GAP))
      setGlassFixing(loaded.glass?.fixing ?? DEFAULT_GLASS_CONFIGURATION.fixing)
      setStaticAssumptions(loaded.staticAssumptions ?? DEFAULT_STATIC_ASSUMPTIONS)
      setSegments(loaded.segments.map((segment, id) => ({ id, length: String(segment.length), angle: String(segment.angle) })))
      nextId.current = loaded.segments.length
      setFileHandle(handle)
      setSavedSnapshot(serializeSlabProject({
        ...loaded,
        glass: loaded.glass ?? DEFAULT_GLASS_CONFIGURATION,
        railing: loaded.railing ?? { mounting: 'none', offset: 0 },
        staticAssumptions: loaded.staticAssumptions ?? DEFAULT_STATIC_ASSUMPTIONS,
      }))
      setProjectDownload(null)
      setStepDownload(null)
      setStepStatus('')
      setStepError('')
      setProjectMessage('Projekt geöffnet.')
    } catch (error) {
      setProjectError(`Projekt konnte nicht geöffnet werden: ${errorMessage(error)}`)
    }
  }

  async function openProject() {
    if (!isSaved && !window.confirm('Nicht gespeicherte Änderungen gehen beim Öffnen verloren. Fortfahren?')) return
    setProjectError('')
    const picker = window as PickerWindow
    if (!picker.showOpenFilePicker) {
      fileInput.current?.click()
      return
    }
    setBusy(true)
    try {
      const handles = await picker.showOpenFilePicker({ types: projectFileTypes })
      if (handles[0]) await loadProject(await handles[0].getFile(), handles[0])
    } catch (error) {
      if (!isCancelled(error)) setProjectError(`Projekt konnte nicht geöffnet werden: ${errorMessage(error)}`)
    } finally { setBusy(false) }
  }

  async function exportStep() {
    setStepError('')
    setStepStatus('')
    setStepProgress(0)
    setStepDownload(null)
    if (!contour.points || thickness === null || glassHeight === null || glassHeight <= GLASS_BOTTOM_HEIGHT || glassThickness === null || maxGlassWidth === null || glassPanelGap === null || profileLayout.error || glassPanelLayout.error) {
      setStepError('Bitte zuerst eine gültige Kontur konfigurieren.')
      return
    }
    const exportName = slabFileName(projectName, 'step')
    setExporting(true)
    setStepProgress(1)
    setStepStatus('STEP-Generierung wird gestartet …')
    try {
      const { exportSlabStep } = await import('./cad/slabStepExport')
      const blob = await exportSlabStep(
        { points: contour.points, thickness, profiles: profileLayout.parts, accessories: profileLayout.accessories, glassPanels, mounting },
        (message, progress) => {
          setStepStatus(message)
          setStepProgress(progress)
        },
      )
      setStepDownload({ url: URL.createObjectURL(blob), name: exportName, snapshot: stepSnapshot })
      setStepProgress(100)
      setStepStatus('STEP-Datei ist bereit. Sie enthält das Modell zum Zeitpunkt des Starts.')
    } catch (error) {
      setStepStatus('')
      setStepError(`STEP-Generierung fehlgeschlagen: ${errorMessage(error)}`)
    } finally { setExporting(false) }
  }

  function changeMounting(next: RailingMounting) {
    if (next === mounting) return
    if (next === '7A') {
      concreteDimensions.current = { depth: depthInput, thickness: thicknessInput }
      setDepthInput(String(STEEL_PLATE_THICKNESS))
      setThicknessInput(String(STEEL_PLATE_HEIGHT))
    } else if (mounting === '7A') {
      setDepthInput(concreteDimensions.current.depth)
      setThicknessInput(concreteDimensions.current.thickness)
    }
    setMounting(next)
  }

  return (
    <main className="app-shell">
      <aside key={viewerKey} className="config-panel" aria-label="Konfiguration">
        <div className="panel-brand">
          <img src={`${import.meta.env.BASE_URL}gel-konfigurator-logo.jpg`} alt="ALUFEFA Geländerkonfigurator" />
        </div>
        <details className="config-section">
          <summary className="section-heading">
            <span className="section-index">01</span>
            <h2>Geländerkonfiguration</h2>
          </summary>
          <div className="field-stack">
            <label className="field-label"><span>Montagefall</span>
              <select className="railing-select" value={mounting} onChange={(event) => changeMounting(event.target.value === '7A' || event.target.value === '7B' ? event.target.value : 'none')}>
                <option value="none">Kein Geländer</option>
                <option value="7A">Montagefall 7A</option>
                <option value="7B">Montagefall 7B</option>
              </select>
            </label>
            {mounting === '7A' && <>
              <p className="slab-note">GEL2001 seitlich am Stahlblech montiert. Die Kontur beschreibt die Draufsicht des {formatMeasurement(STEEL_PLATE_THICKNESS)} mm starken Stahlblechs. Blechhöhe: {formatMeasurement(STEEL_PLATE_HEIGHT)} mm; sie reicht jeweils {formatMeasurement(STEEL_PLATE_MARGIN)} mm über bzw. unter das {formatMeasurement(135)} mm hohe Profil hinaus.</p>
              <p className="slab-note">Torbandschraube: M10×{formatMeasurement(30)} mm, Kopf Ø {formatMeasurement(25)} × {formatMeasurement(5)} mm, 12,7 mm innerhalb der GEL2001-Kontur, Durchgang Ø {formatMeasurement(SIDE_FIXING_HOLE_DIAMETER)} mm. Achshöhe {formatMeasurement(SIDE_FIXING_AXIS_HEIGHT)} mm laut DXF-Layer „Achse_Torbandschraube“. Schraubenabstand maximal {formatMeasurement(maximumSideFixingSpacing(staticAssumptions))} mm; {formatMeasurement(50)} mm Randabstand am Profilende.</p>
              {profileLayout.parts.length > 0 && <p className="slab-note">Aktuell: {profileLayout.parts.length} Profilteile, {profileLayout.parts.reduce((sum, part) => sum + part.holes.length, 0)} Torbandschrauben.</p>}
              {profileLayout.error && <p className="dimension-error" role="status">{profileLayout.error}</p>}
            </>}
            {mounting === '7B' && <>
              <label className="field-label"><span>Randabstand</span><span className="input-with-unit">
                <input type="number" min="0" max={maxOffset !== null ? Math.max(0, maxOffset) : undefined} step="any" value={offsetInput} aria-invalid={offset === null} onChange={(event) => setOffsetInput(event.target.value)} />
                <span>mm</span>
              </span></label>
              <p className="slab-note">GEL2001 auf der Deckenoberseite. Rohprofillänge maximal {formatMeasurement(4000)} mm einschließlich Gehrung; längere Abschnitte werden gestückelt.{profileLayout.parts.length > 0 && ` Aktuell: ${profileLayout.parts.length} Profilteile.`}</p>
              {maxOffset !== null && maxOffset >= 0 && <p className="slab-note">Maximaler Randabstand: {formatMeasurement(maxOffset)} mm, damit das Profil auf der Betondecke bleibt.</p>}
              <p className="slab-note">Dübelabstand maximal {formatMeasurement(maximumFixingSpacing(staticAssumptions))} mm · {formatMeasurement(50)} mm zu den Profilenden · Bohrung Ø {formatMeasurement(14)} mm, Senkung Ø {formatMeasurement(21)} mm / 90°.</p>
              {profileLayout.error && <p className="dimension-error" role="status">{profileLayout.error}</p>}
            </>}
          </div>
        </details>
        <details className="config-section">
          <summary className="section-heading">
            <span className="section-index">02</span>
            <h2>Maße</h2>
          </summary>
          <div className="field-stack slab-base-fields">
            <NumberField label="Länge 1" value={segments[0].length} onChange={(length) => updateSegment(segments[0].id, { length })} />
            {mounting === '7A'
              ? <p className="slab-note">Blechstärke: {formatMeasurement(STEEL_PLATE_THICKNESS)} mm · Blechhöhe: {formatMeasurement(STEEL_PLATE_HEIGHT)} mm</p>
              : <>
                <NumberField label="Tiefe" value={depthInput} onChange={(value) => { setDepthInput(value); concreteDimensions.current.depth = value }} />
                <NumberField label="Stärke" value={thicknessInput} onChange={(value) => { setThicknessInput(value); concreteDimensions.current.thickness = value }} />
              </>}
          </div>
          {segments.slice(1).map((segment, index) => (
            <div className="slab-segment" key={segment.id}>
              <div className="slab-segment-heading">
                <h3>Abschnitt {index + 2}</h3>
                <button type="button" className="tool-button" title={`Abschnitt ${index + 2} entfernen`} aria-label={`Abschnitt ${index + 2} entfernen`} onClick={() => setSegments((current) => current.filter((item) => item.id !== segment.id))}><Trash2 size={15} /></button>
              </div>
              <div className="field-stack">
                <NumberField label={`Länge ${index + 2}`} value={segment.length} onChange={(length) => updateSegment(segment.id, { length })} />
                <NumberField label={`Innenwinkel ${index + 2}`} value={segment.angle} angle onChange={(angle) => updateSegment(segment.id, { angle })} />
              </div>
            </div>
          ))}
          <button type="button" className="upload-button slab-add" onClick={() => {
            const id = nextId.current++
            setSegments((current) => [...current, {
              id,
              length: '3000',
              angle: current.length === 1 ? '90' : '180',
            }])
          }}><Plus size={15} /> Länge hinzufügen</button>
          <p className="slab-note">{mounting === '7A' ? 'Die Maße beschreiben die Draufsichtkontur des Stahlblechs; Blechstärke und -höhe sind gemäß Montagefall festgelegt.' : 'Längen werden an der eingegebenen Kante gemessen. Winkel unter 180° bilden Außenecken, über 180° Innenecken; 180° verläuft gerade. Tiefe und Stärke sind durchgehend gleich.'}</p>
        </details>
        <details className="config-section">
          <summary className="section-heading"><span className="section-index">03</span><h2>Statische Annahmen</h2></summary>
          <div className="field-stack">
            <fieldset className="static-choice">
              <legend>Bereich</legend>
              <div className="static-choice-options">
                <label><input type="radio" name="location" value="inside" checked={staticAssumptions.location === 'inside'} onChange={() => setStaticAssumptions((current) => ({ ...current, location: 'inside' }))} /><span>Innenbereich</span></label>
                <label><input type="radio" name="location" value="outside" checked={staticAssumptions.location === 'outside'} onChange={() => setStaticAssumptions((current) => ({ ...current, location: 'outside' }))} /><span>Außenbereich</span></label>
              </div>
            </fieldset>
            <fieldset className="static-choice">
              <legend>Nutzung</legend>
              <div className="static-choice-options">
                <label><input type="radio" name="usage" value="public" checked={staticAssumptions.usage === 'public'} onChange={() => setStaticAssumptions((current) => ({ ...current, usage: 'public' }))} /><span>Öffentlich</span></label>
                <label><input type="radio" name="usage" value="private" checked={staticAssumptions.usage === 'private'} onChange={() => setStaticAssumptions((current) => ({ ...current, usage: 'private' }))} /><span>Privat</span></label>
              </div>
            </fieldset>
            <div className="static-loads" aria-live="polite">
              <strong>Angenommene Lasten</strong>
              <span>Verkehr: {loads.traffic === 0.5 ? '0,5' : '1,0'} kN</span>
              <span>Wind: {loads.wind === 0 ? 'ohne Wind' : '1,0 kN'}</span>
            </div>
            <p className="slab-note">Die angezeigten Werte sind Annahmen und ersetzen keine statische Bemessung.</p>
          </div>
        </details>
        <details className="config-section">
          <summary className="section-heading"><span className="section-index">04</span><h2>Glas - Visualisierung</h2></summary>
          <div className="field-stack">
            <NumberField label="Glashöhe" value={glassHeightInput} onChange={setGlassHeightInput} minimum={GLASS_BOTTOM_HEIGHT + 0.01} />
            <NumberField label="Scheibendicke je Scheibe" value={glassThicknessInput} onChange={setGlassThicknessInput} />
            <NumberField label="Maximale Glasscheibenbreite" value={maxGlassWidthInput} onChange={setMaxGlassWidthInput} />
            <NumberField label="Scheibenspalt" value={glassPanelGapInput} onChange={setGlassPanelGapInput} minimum={0} allowZero />
            <p className="slab-note">Die Geländerkontur wird je Abschnitt gleichmäßig in Glasscheiben geteilt, die nicht breiter als das eingegebene Maximum sind. An Knicken stoßen die Scheiben gerade mit dem eingestellten Scheibenspalt aneinander; der vorherige Abschnitt läuft durch. Jede Scheibe besteht aus zwei Lagen mit jeweils {formatMeasurement(glassThickness ?? DEFAULT_GLASS_CONFIGURATION.paneThickness)} mm Stärke und {formatMeasurement(GLASS_GAP)} mm Abstand. Die Scheibenhöhe wird ab Unterkante des GEL2001-Profils gemessen.</p>
            {glassPanelLayout.error && <p className="dimension-error" role="status">{glassPanelLayout.error}</p>}
          </div>
        </details>
        <details className="config-section">
          <summary className="section-heading"><span className="section-index">05</span><h2>Glasbefestigung</h2></summary>
          <div className="field-stack">
            <label className="field-label"><span>Systemteile</span>
              <select className="railing-select" value={glassFixing} onChange={(event) => setGlassFixing(event.target.value === 'none' ? 'none' : 'system')}>
                <option value="system">ALUFEFA Systemteile</option>
                <option value="none">Keine Glasbefestigung</option>
              </select>
            </label>
            {mounting !== 'none' && glassFixing === 'system' && <>
              <p className="slab-note">{mounting === '7A' ? 'GEL2001 seitlich am Stahlblech' : 'GEL2001 auf der Deckenoberseite'}. Glasschuhe: {formatMeasurement(100)} mm lang, jeweils {formatMeasurement(30)} mm Einstand an den Enden und maximal {formatMeasurement(300)} mm lichte Lücke. Klemmleisten: {formatMeasurement(180)} mm lang, {formatMeasurement(10)} mm Einstand und exakt {formatMeasurement(20)} mm lichte Lücke; das letzte Teil wird passend gekürzt.</p>
            </>}
          </div>
        </details>
        <details className="config-section">
          <summary className="section-heading">
            <span className="section-index">06</span>
            <h2>Export CAD</h2>
          </summary>
          <button type="button" className="upload-button" disabled={exporting || !contour.points || thickness === null || glassHeight === null || glassHeight <= GLASS_BOTTOM_HEIGHT || glassThickness === null || maxGlassWidth === null || glassPanelGap === null || !!profileLayout.error || !!glassPanelLayout.error} onClick={() => void exportStep()}>
            <Download size={15} /> {exporting ? 'STEP wird generiert …' : 'STEP generieren'}
          </button>
          <p className="slab-note">{mounting === '7A'
            ? 'Exportiert Stahlblech, seitlich gebohrte Grundprofile sowie Torbandschrauben und Muttern als separate Volumenkörper auf benannten STEP-Layern, ohne Bemaßung.'
            : 'Exportiert Betondecke, Grundprofile, Glas, Schrauben und – bei Auswahl der ALUFEFA Systemteile – die Glasbefestigung als separate Volumenkörper auf benannten STEP-Layern, ohne Bemaßung.'}</p>
          {exporting && <div className="export-progress" role="group" aria-label="STEP-Exportfortschritt">
            <progress max={100} value={stepProgress} aria-label="STEP-Exportfortschritt" />
            <span>{Math.round(stepProgress)}%</span>
          </div>}
          {stepStatus && <p className="slab-status" role="status">{stepStatus}</p>}
          {stepError && <p className="dimension-error" role="alert">{stepError}</p>}
          {stepDownload && stepDownload.snapshot === stepSnapshot && <a className="slab-download" href={stepDownload.url} download={stepDownload.name}>STEP-Datei herunterladen</a>}
          {stepDownload && stepDownload.snapshot !== stepSnapshot && <p className="slab-note">Die gespeicherte STEP-Datei gehört zu einer älteren Modellversion.</p>}
        </details>
        <RailingManufacturingPanel
          profiles={profileLayout.parts}
          accessories={profileLayout.accessories}
          mounting={mounting}
          valid={!!contour.points && thickness !== null && !profileLayout.error}
          projectName={projectName}
        />
        <RailingCalculationPanel
          profiles={profileLayout.parts}
          accessories={profileLayout.accessories}
          valid={!!contour.points && thickness !== null && !profileLayout.error}
          projectName={projectName}
          prices={prices}
          setPrices={setPrices}
          priceListName={priceListName}
          setPriceListName={setPriceListName}
          visualSnapshot={stepSnapshot}
          captureViewerRef={captureViewerRef}
          mounting={mounting}
        />
        <div className="panel-footer"><span>GELÄNDERKONFIGURATOR</span><span>V 0.1</span></div>
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <input className={`project-name-input${isSaved ? '' : ' unsaved'}`} aria-label="Projektname" placeholder="Projekt benennen" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          <nav className="project-actions" aria-label="Projektaktionen">
            <input ref={fileInput} hidden type="file" accept=".gelaender.json,.json,application/json" onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void loadProject(file, null)
            }} />
            <button type="button" className="project-action-button" aria-label="Reset" title="Neue Konfiguration" disabled={busy || exporting} onClick={resetProject}><RotateCcw size={15} /><span>Reset</span></button>
            <button type="button" className="project-action-button" aria-label="Projekt öffnen" disabled={busy} onClick={() => void openProject()}><FolderOpen size={15} /><span>Projekt öffnen</span></button>
            <button type="button" className="project-action-button" aria-label="Speichern unter" disabled={busy} onClick={() => void saveProject(true)}><SaveAll size={15} /><span>Speichern unter</span></button>
            <button type="button" className="project-action-button primary" aria-label="Speichern" disabled={busy} onClick={() => void saveProject(false)}><Save size={15} /><span>Speichern</span></button>
            <span className={`header-status${isSaved ? '' : ' unsaved'}`} role="status">{isSaved ? 'GESPEICHERT' : 'UNGESPEICHERT'}</span>
          </nav>
        </header>
        <div className="workspace-content">
          {projectError && <div className="error-banner" role="alert">{projectError}</div>}
          {projectMessage && <div className="project-status-message" role="status"><span>{projectDownload && projectDownload.snapshot !== snapshot ? 'Das Projekt wurde geändert. Bitte erneut speichern.' : projectMessage}</span>
            {projectDownload && projectDownload.snapshot === snapshot && <a href={projectDownload.url} download={projectDownload.name} onClick={() => setProjectMessage('Projektdatei zum Download bereitgestellt. Eine bestehende Datei wurde nicht überschrieben.')}>Projektdatei herunterladen</a>}
          </div>}
          <div className="view-title-row">
            <div><p className="eyebrow">KONFIGURATION / 02</p>            <h2>Maße</h2></div>
            <div className="view-size">{segments.length} {segments.length === 1 ? 'Abschnitt' : 'Abschnitte'} <span>·</span> {formatDimension(depth)} {mounting === '7A' ? 'Blechstärke' : 'Tiefe'}</div>
          </div>
          <ConcreteSlabViewer
            key={viewerKey}
            points={contour.points}
            dimensions={contour.dimensions}
            depth={depth}
            thickness={thickness}
            mounting={mounting}
            error={contour.error}
            profiles={profileLayout.parts}
            accessories={profileLayout.accessories}
            glassPanels={glassPanels}
            captureRef={captureViewerRef}
          />
          <div className="technical-summary">
            <details open>
              <summary className="summary-heading">PROJEKTDATEN</summary>
              <div className="summary-grid slab-summary-grid">
                <div className="summary-stat"><div><span>Abschnitte</span><strong>{segments.length}</strong></div></div>
                <div className="summary-stat"><div><span>Gesamtlänge Geländer</span><strong>{profileLayout.parts.length > 0 && thickness !== null
                  ? `${formatMeasurement(profileCenterlineLength(profileLayout.parts))} mm`
                  : '–'}</strong></div></div>
              </div>
            </details>
          </div>
          <p className="profile-disclaimer">Einige Profilquerschnitte werden für eine bessere Webperformance vereinfacht dargestellt. Die genauen Querschnitte als DWG-, DXF- und STEP-Dateien finden Sie im ALUFEFA Downloadbereich auf <a href="https://www.alufefa.at" target="_blank" rel="noopener noreferrer">www.alufefa.at</a>.</p>
          <div className="workspace-footnote"><span>GELÄNDER / KONFIGURATOR</span><span>PARAMETRISCHES MODELL · V 0.1</span></div>
        </div>
      </section>
    </main>
  )
}
