import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileUp, Ruler } from 'lucide-react'
import type { ChangeEvent, DragEvent } from 'react'
import type { FacadeConfiguration, FacadeLayout, UkAnglePlacement, UkAngleProfile, UkRailFixingPlacement, UkRailPlacement, UkRailProfile, WallContour } from '../domain/types'
import { formatMillimeters } from '../domain/facadeLayout'
import { MAX_END_GAP } from '../domain/endGap'
import { DEFAULT_MASONRY_VIEW } from '../domain/masonryView'
import { DEFAULT_UK_RAIL_VIEW } from '../domain/ukRailView'
import { calculateDirectMountClearance, getUkAngleConnectorMaximumSpacing, getUkPlasticBlockDepth, getUkRailHoleDiameter, getUkRailMountingMethod } from '../domain/ukMounting'
import { RAL_CLASSIC_COLORS, RAL_MASONRY_COLORS } from '../domain/ralColors'
import { FLOOR_PATTERN_MATERIALS, getFloorMaterialColor, getFloorMaterialName, isFloorMaterial } from '../domain/floorMaterials'
import { STANDARD_PROFILES } from '../domain/standardProfiles'
import { DEFAULT_PROFILE_MIX, getPercentageTotal } from '../domain/profileMix'
import type { ProfileMixMode } from '../domain/types'
import type { MasonryViewConfiguration, UkRailViewConfiguration } from '../domain/types'

interface ConfigurationPanelProps {
  configuration: FacadeConfiguration
  layout: FacadeLayout
  wallContour: WallContour | null
  ukRailProfile: UkRailProfile | null
  facadeProfileDepth: number
  ukRailPlacements: UkRailPlacement[]
  ukAngleProfile: UkAngleProfile | null
  ukAnglePlacements: UkAnglePlacement[]
  ukConnectorCount: number
  ukRailFixings: UkRailFixingPlacement[]
  ukAngleError: string
  ukRailError: string
  isExporting: boolean
  exportStatus: string
  exportProgress: number
  exportError: string
  isPdfExporting: boolean
  pdfExportStatus: string
  pdfExportError: string
  isExcelExporting: boolean
  excelExportStatus: string
  excelExportError: string
  onChange: (updates: Partial<FacadeConfiguration>) => void
  onWallLoaded: (contour: WallContour) => void
  onWallError: (message: string) => void
  onWallRemoved: () => void
  onExportStep: () => void
  onExportPdf: () => void
  onExportExcel: () => void
}

function NumberField({
  label,
  value,
  unit,
  min = 0,
  max,
  step = 1,
  sliderMax,
  disabled = false,
  onChange,
}: {
  label: string
  value: number
  unit: string
  min?: number
  max?: number
  step?: number
  sliderMax?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="field-label">
      <span>{label}</span>
      <span className={sliderMax === undefined ? undefined : 'number-field-controls'}>
        <span className="input-with-unit">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={(event) => {
              const nextValue = Number(event.target.value)
              if (Number.isFinite(nextValue)) onChange(Math.max(min, max === undefined ? nextValue : Math.min(max, nextValue)))
            }}
          />
          <span>{unit}</span>
        </span>
        {sliderMax !== undefined && (
          <input
            className="number-field-slider"
            type="range"
            min={0}
            max={sliderMax}
            step={step}
            value={Math.max(0, Math.min(sliderMax, value))}
            disabled={disabled}
            aria-label={`${label} als Schieberegler`}
            onChange={(event) => onChange(Math.max(min, Number(event.target.value)))}
          />
        )}
      </span>
    </label>
  )
}

function ToggleField({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="masonry-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

export function ConfigurationPanel({
  configuration,
  layout,
  wallContour,
  ukRailProfile,
  facadeProfileDepth,
  ukRailPlacements,
  ukAngleProfile,
  ukAnglePlacements,
  ukConnectorCount,
  ukRailFixings,
  ukAngleError,
  ukRailError,
  isExporting,
  exportStatus,
  exportProgress,
  exportError,
  isPdfExporting,
  pdfExportStatus,
  pdfExportError,
  isExcelExporting,
  excelExportStatus,
  excelExportError,
  onChange,
  onWallLoaded,
  onWallError,
  onWallRemoved,
  onExportStep,
  onExportPdf,
  onExportExcel,
}: ConfigurationPanelProps) {
  const wallFileInput = useRef<HTMLInputElement>(null)
  const profile = configuration.profile
  const [hexDraft, setHexDraft] = useState(configuration.profileColor.toUpperCase())
  const [floorMaterialError, setFloorMaterialError] = useState('')
  const [openSections, setOpenSections] = useState({ dimensions: false, masonry: false, ukRail: false, profile: false, export: false })
  const selectedRal = RAL_CLASSIC_COLORS.find((color) => color.hex.toLowerCase() === configuration.profileColor.toLowerCase())
  const facadeEnds = configuration.facadeEnds ?? { left: 'high', right: 'high' }
  const profileMix = configuration.profileMix ?? DEFAULT_PROFILE_MIX
  const masonryView = configuration.masonryView ?? DEFAULT_MASONRY_VIEW
  const ukRailView = configuration.ukRailView ?? DEFAULT_UK_RAIL_VIEW
  const selectedMasonryRal = RAL_MASONRY_COLORS.find((color) => color.hex.toLowerCase() === masonryView.color.toLowerCase())

  useEffect(() => {
    setHexDraft(configuration.profileColor.toUpperCase())
  }, [configuration.profileColor])

  async function handleWallFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const { parseWallDxf } = await import('../dxf/parseWallDxf')
      onWallLoaded(parseWallDxf(await file.text(), file.name))
    } catch (error) {
      onWallError(error instanceof Error ? error.message : 'Die DXF-Mauerkontur konnte nicht verarbeitet werden.')
    }
    event.target.value = ''
  }

  function updateMasonryView(updates: Partial<MasonryViewConfiguration>) {
    onChange({ masonryView: { ...masonryView, ...updates } })
  }

  function updateUkRailView(updates: Partial<UkRailViewConfiguration>) {
    onChange({ ukRailView: { ...DEFAULT_UK_RAIL_VIEW, ...ukRailView, ...updates } })
  }

  function applyFloorMaterial(material: string) {
    if (!masonryView.enabled || !masonryView.bottomEnabled) return
    if (!isFloorMaterial(material)) {
      setFloorMaterialError('Dieses Bodenmaterial wird nicht unterstützt.')
      return
    }
    setFloorMaterialError('')
    updateMasonryView({ floorMaterial: material })
  }

  function handleFloorMaterialDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const material = event.dataTransfer.getData('application/x-floor-material')
    if (material) applyFloorMaterial(material)
  }

  function handleFloorMaterialDragStart(event: DragEvent<HTMLButtonElement>, material: string) {
    event.dataTransfer.setData('application/x-floor-material', material)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <aside className="config-panel">
      <div className="panel-brand">
        <img src={`${import.meta.env.BASE_URL}gel-konfigurator-logo.jpg`} alt="ALUFEFA Geländerkonfigurator" />
      </div>

      <details
        className="config-section"
        open={openSections.dimensions}
        onToggle={(event) => {
          const isOpen = event.currentTarget.open
          setOpenSections((sections) => ({ ...sections, dimensions: isOpen }))
        }}
      >
        <summary className="section-heading">
          <span className="section-index">01</span>
          <h2>Fassadenaufbau</h2>
        </summary>
        <input ref={wallFileInput} className="visually-hidden" type="file" accept=".dxf,application/dxf" onChange={handleWallFileChange} />
        <button className="upload-button" type="button" onClick={() => wallFileInput.current?.click()}>
          <FileUp size={17} strokeWidth={1.8} />
          <span>DXF-Mauerkontur laden</span>
        </button>
        <div className="wall-contour-info">
          <div className="profile-state">
            <span className="state-dot" />
            <span>{wallContour ? 'DXF-Mauerkontur aktiv' : 'Manuelle Abmessungen'}</span>
          </div>
          {wallContour && (
            <>
              <p className="profile-name" title={wallContour.name}>{wallContour.name}</p>
              <div className="wall-contour-meta">
                <span>{formatMillimeters(wallContour.width)} × {formatMillimeters(wallContour.height)} mm</span>
                <button className="quiet-button" type="button" onClick={onWallRemoved}>Kontur entfernen</button>
              </div>
            </>
          )}
        </div>
        <div className="field-stack">
          <NumberField label="Breite" value={configuration.width} unit="mm" min={1} step={10} disabled={wallContour !== null} onChange={(width) => onChange({ width })} />
          <NumberField label="Höhe" value={configuration.height} unit="mm" min={1} step={10} disabled={wallContour !== null} onChange={(height) => onChange({ height })} />
          <NumberField label="Abstand zur Fassadenebene" value={masonryView.facadeOffset} unit="mm" step={10} sliderMax={1000} onChange={(facadeOffset) => updateMasonryView({ facadeOffset })} />
          <label className="field-label">
            <span>Montagespalt oben/unten</span>
            <span className="input-with-unit">
              <input
                type="number"
                min={0}
                max={MAX_END_GAP}
                step={1}
                value={configuration.endGap ?? 10}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isFinite(value)) onChange({ endGap: Math.min(MAX_END_GAP, Math.max(0, value)) })
                }}
                aria-label="Montagespalt oben und unten"
              />
              <span>mm</span>
            </span>
          </label>
          <p className="color-hint end-gap-hint">Wird oben und unten jeweils von der Fassadenhöhe abgezogen (0–{MAX_END_GAP} mm).</p>
        </div>
      </details>

      <details
        className="config-section masonry-section"
        open={openSections.masonry}
        onToggle={(event) => {
          const isOpen = event.currentTarget.open
          setOpenSections((sections) => ({ ...sections, masonry: isOpen }))
        }}
      >
        <summary className="section-heading">
          <span className="section-index">02</span>
          <h2>Maueransicht</h2>
          <label className="masonry-toggle masonry-summary-toggle" onClick={(event) => event.stopPropagation()}>
            <span className="visually-hidden">Maueransicht einschalten</span>
            <input
              type="checkbox"
              checked={masonryView.enabled}
              onChange={(event) => updateMasonryView({ enabled: event.target.checked })}
              aria-label="Maueransicht einschalten"
            />
          </label>
        </summary>
        <p className="masonry-note">Ergänzt die 3D-Vorschau. Die Grundmauer entspricht dem Fassadenaußenmaß ohne Montagespalt. Der Abstand wird von der Fassadenvorderkante gemessen. Seitliche Mauern reichen über die gesamte Tiefe der Grundmauer und springen zusätzlich nach vorn vor.</p>
        <div className="field-stack">
          <NumberField label="Tiefe der Grundmauer" value={masonryView.facadeDepth} unit="mm" min={1} step={10} sliderMax={1000} disabled={!masonryView.enabled} onChange={(facadeDepth) => updateMasonryView({ facadeDepth })} />
        </div>
        <div className="masonry-appearance">
          <label className="field-label masonry-color-field">
            <span>RAL-Farbton</span>
            <span className="color-control">
              <span className="color-preview" style={{ backgroundColor: masonryView.color }} aria-hidden="true" />
              <select
                value={selectedMasonryRal?.code ?? 'RAL 9010'}
                disabled={!masonryView.enabled}
                onChange={(event) => {
                  if (event.target.value === 'custom') return
                  const color = RAL_MASONRY_COLORS.find((candidate) => candidate.code === event.target.value)
                  if (!color) throw new Error(`Unbekannter RAL-Farbton: ${event.target.value}`)
                  updateMasonryView({ color: color.hex })
                }}
                aria-label="RAL-Farbton der Mauer auswählen"
              >
                {RAL_MASONRY_COLORS.map((color) => <option key={color.code} value={color.code}>{color.code} · {color.name.trim()}</option>)}
              </select>
            </span>
          </label>
          <label className="masonry-opacity-field">
            <span className="field-label"><span>Transparenz</span><strong>{masonryView.transparency}%</strong></span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={masonryView.transparency}
              disabled={!masonryView.enabled}
              onChange={(event) => updateMasonryView({ transparency: Number(event.target.value) })}
              aria-label="Mauertransparenz"
            />
          </label>
        </div>
        <div className="masonry-subsection">
          <h3>Über der Fassade</h3>
          <ToggleField
            label="Obere Mauer einschalten"
            checked={masonryView.topEnabled}
            disabled={!masonryView.enabled}
            onChange={(topEnabled) => updateMasonryView({ topEnabled })}
          />
          {masonryView.enabled && masonryView.topEnabled && (
            <>
              <div className="field-stack">
                <NumberField label="Zusatzhöhe" value={masonryView.topHeight} unit="mm" step={10} sliderMax={1000} disabled={!masonryView.enabled} onChange={(topHeight) => updateMasonryView({ topHeight })} />
                <NumberField label="Mauervorsprung vor Vorderkante" value={masonryView.topDepth} unit="mm" step={10} sliderMax={1000} disabled={!masonryView.enabled} onChange={(topDepth) => updateMasonryView({ topDepth })} />
              </div>
              <p className="color-hint masonry-depth-hint">Der obere Anbau läuft über die gesamte Tiefe der Grundmauer und ragt um diesen Wert über deren Vorderkante hinaus.</p>
            </>
          )}
        </div>
        <div className="masonry-subsection">
          <h3>Neben der Fassade · beide Seiten</h3>
          <ToggleField
            label="Seitliche Mauern einschalten"
            checked={masonryView.sideEnabled}
            disabled={!masonryView.enabled}
            onChange={(sideEnabled) => updateMasonryView({ sideEnabled })}
          />
          {masonryView.enabled && masonryView.sideEnabled && (
            <>
              <div className="field-stack">
                <NumberField label="Zusatzbreite je Seite" value={masonryView.sideWidth} unit="mm" step={10} sliderMax={1000} disabled={!masonryView.enabled} onChange={(sideWidth) => updateMasonryView({ sideWidth })} />
                <NumberField label="Mauervorsprung vor Vorderkante" value={masonryView.sideDepth} unit="mm" step={10} sliderMax={1000} disabled={!masonryView.enabled} onChange={(sideDepth) => updateMasonryView({ sideDepth })} />
              </div>
              <p className="color-hint masonry-depth-hint">Die seitlichen Anbauten laufen über die gesamte Tiefe der Grundmauer und ragen um diesen Wert über deren Vorderkante hinaus.</p>
            </>
          )}
        </div>
        <div className="masonry-subsection">
          <h3>Unter der Fassade</h3>
          <ToggleField
            label="Untere Mauer / Boden einschalten"
            checked={masonryView.bottomEnabled}
            disabled={!masonryView.enabled}
            onChange={(bottomEnabled) => updateMasonryView({ bottomEnabled })}
          />
          {masonryView.enabled && masonryView.bottomEnabled && <label className="field-label masonry-type-field">
            <span>Darstellung</span>
            <select
              value={masonryView.bottomType}
              disabled={!masonryView.enabled}
              onChange={(event) => {
                if (event.target.value !== 'wall' && event.target.value !== 'floor') {
                  throw new Error(`Unbekannte Darstellung unter der Fassade: ${event.target.value}`)
                }
                updateMasonryView({ bottomType: event.target.value })
              }}
              aria-label="Darstellung unter der Fassade"
            >
              <option value="wall">Mauer</option>
              <option value="floor">Boden</option>
            </select>
          </label>}
          {masonryView.enabled && masonryView.bottomEnabled && (masonryView.bottomType === 'wall'
            ? (
              <>
                <div className="field-stack">
                  <NumberField label="Sockelhöhe" value={masonryView.bottomWallHeight} unit="mm" step={10} sliderMax={1000} disabled={!masonryView.enabled || !masonryView.bottomEnabled} onChange={(bottomWallHeight) => updateMasonryView({ bottomWallHeight })} />
                  <NumberField label="Mauervorsprung vor Vorderkante" value={masonryView.bottomWallDepth} unit="mm" step={10} sliderMax={1000} disabled={!masonryView.enabled || !masonryView.bottomEnabled} onChange={(bottomWallDepth) => updateMasonryView({ bottomWallDepth })} />
                </div>
                <p className="color-hint masonry-depth-hint">Die untere Mauer umfasst die Breite der mittleren und beider eingeschalteten Seitenmauern. Der Vorsprung wird von der Vorderkante der Grundmauer gemessen.</p>
              </>
            )
            : (
              <>
                <div className="field-stack">
                  <NumberField label="Bodentiefe" value={masonryView.floorDepth} unit="mm" min={1} step={10} sliderMax={1000} disabled={!masonryView.enabled || !masonryView.bottomEnabled} onChange={(floorDepth) => updateMasonryView({ floorDepth })} />
                  <NumberField label="Bodenstärke" value={masonryView.floorThickness} unit="mm" min={1} step={10} sliderMax={1000} disabled={!masonryView.enabled || !masonryView.bottomEnabled} onChange={(floorThickness) => updateMasonryView({ floorThickness })} />
                </div>
                <div className="floor-material-picker">
                  <div
                    className={!masonryView.enabled ? 'floor-material-drop disabled' : 'floor-material-drop'}
                    role="group"
                    aria-disabled={!masonryView.enabled}
                    aria-label="Bodenmaterial hier ablegen"
                    onDragOver={(event) => {
                      if (!masonryView.enabled) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'copy'
                    }}
                    onDrop={handleFloorMaterialDrop}
                  >
                    <span className={`floor-material-preview ${masonryView.floorMaterial.startsWith('pattern:') ? masonryView.floorMaterial.replace(':', '-') : ''}`}
                      style={{ backgroundColor: getFloorMaterialColor(masonryView.floorMaterial) }}
                      aria-hidden="true"
                    />
                    <span><strong>{getFloorMaterialName(masonryView.floorMaterial)}</strong><small>Auswahl hierher ziehen oder anklicken</small></span>
                  </div>
                  {floorMaterialError && <p className="color-hint" role="alert">{floorMaterialError}</p>}
                  <h4>RAL-Farbtöne</h4>
                  <div className="floor-material-grid" aria-label="RAL-Farbtöne für den Boden">
                    {RAL_CLASSIC_COLORS.map((color) => {
                      const material = `ral:${color.code}`
                      return (
                        <button
                          className={masonryView.floorMaterial === material ? 'floor-material-swatch selected' : 'floor-material-swatch'}
                          key={color.code}
                          type="button"
                          style={{ backgroundColor: color.hex }}
                          title={`${color.code} · ${color.name.trim()}`}
                          aria-label={`${color.code} ${color.name.trim()}`}
                          aria-pressed={masonryView.floorMaterial === material}
                          draggable={masonryView.enabled}
                          disabled={!masonryView.enabled}
                          onClick={() => applyFloorMaterial(material)}
                          onDragStart={(event) => handleFloorMaterialDragStart(event, material)}
                        />
                      )
                    })}
                  </div>
                  <h4>Muster</h4>
                  <div className="floor-pattern-list">
                    {FLOOR_PATTERN_MATERIALS.map((pattern) => (
                      <button
                        className={masonryView.floorMaterial === pattern.id ? `floor-pattern-option selected ${pattern.id.replace(':', '-')}` : `floor-pattern-option ${pattern.id.replace(':', '-')}`}
                        key={pattern.id}
                        type="button"
                        aria-pressed={masonryView.floorMaterial === pattern.id}
                        draggable={masonryView.enabled}
                        disabled={!masonryView.enabled}
                        onClick={() => applyFloorMaterial(pattern.id)}
                        onDragStart={(event) => handleFloorMaterialDragStart(event, pattern.id)}
                      >
                        {pattern.name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ))}
        </div>
      </details>

      <details
        className="config-section"
        open={openSections.ukRail}
        onToggle={(event) => {
          const isOpen = event.currentTarget.open
          setOpenSections((sections) => ({ ...sections, ukRail: isOpen }))
        }}
      >
        <summary className="section-heading">
          <span className="section-index">03</span>
          <h2>Unterkonstruktion</h2>
          <label className="masonry-toggle masonry-summary-toggle" onClick={(event) => event.stopPropagation()}>
            <span className="visually-hidden">UK-Schiene einschalten</span>
            <input
              type="checkbox"
              checked={ukRailView.enabled}
              onChange={(event) => updateUkRailView({ enabled: event.target.checked })}
              aria-label="UK-Schiene einschalten"
            />
          </label>
        </summary>
        <div className="field-stack">
          <label className="field-label">
            <span>Montageart</span>
            <select
              value={getUkRailMountingMethod(configuration)}
              disabled={!ukRailView.enabled}
              onChange={(event) => {
                const method = event.target.value
                if (method !== 'direct-to-wall' && method !== 'aluminum-substructure') {
                  throw new Error(`Unbekannte UK-Montageart: ${method}`)
                }
                updateUkRailView({ mountingMethod: method })
              }}
              aria-label="Montageart der Unterkonstruktion"
            >
              <option value="direct-to-wall">Montage direkt an Mauer</option>
              <option value="aluminum-substructure">Montage mit Alu-UK</option>
            </select>
          </label>
          {getUkRailMountingMethod(configuration) === 'direct-to-wall'
            ? (
              <>
                <NumberField
                  label="Lochdurchmesser"
                  value={getUkRailHoleDiameter(configuration)}
                  unit="mm"
                  min={1}
                  max={57}
                  step={1}
                  disabled={!ukRailView.enabled}
                  onChange={(holeDiameter) => updateUkRailView({ holeDiameter })}
                />
                <NumberField
                  label="Kunststoffklotz-Tiefe"
                  value={Number(getUkPlasticBlockDepth(configuration, ukRailProfile, facadeProfileDepth).toFixed(3))}
                  unit="mm"
                  min={1}
                  step={1}
                  disabled={!ukRailView.enabled}
                  onChange={(plasticBlockDepth) => updateUkRailView({ plasticBlockDepth })}
                />
                {ukRailProfile && (
                  <>
                    <p className="color-hint">
                    {getUkPlasticBlockDepth(configuration, ukRailProfile, facadeProfileDepth) > 30
                      ? `Ab 30 mm Distanz: je Befestigungsachse ein vertikales Kantholz ${formatMillimeters(Math.min(80, getUkPlasticBlockDepth(configuration, ukRailProfile, facadeProfileDepth)))} × ${formatMillimeters(getUkPlasticBlockDepth(configuration, ukRailProfile, facadeProfileDepth))} mm (Breite max. 80 mm, erstes/letztes 100 mm innerhalb der UK-Schienenenden) über die gesamte Höhe bis zur Auflager-Schiene. `
                      : 'Je Loch ein Kunststoffklotz 60 × 60 mm (bis 30 mm Distanz). '}Löcher Ø {formatMillimeters(getUkRailHoleDiameter(configuration))} mm (Öffnung Ø {formatMillimeters(getUkRailHoleDiameter(configuration) + 2)} mm), 50 mm Randabstand und höchstens 800 mm Abstand. Abstand von der Schienenhinterkante zur Mauer: {formatMillimeters(calculateDirectMountClearance(configuration, ukRailProfile, facadeProfileDepth))} mm; nach dem Klotz/Kantholz verbleiben {formatMillimeters(calculateDirectMountClearance(configuration, ukRailProfile, facadeProfileDepth) - getUkPlasticBlockDepth(configuration, ukRailProfile, facadeProfileDepth))} mm.
                    </p>
                    {calculateDirectMountClearance(configuration, ukRailProfile, facadeProfileDepth) < getUkPlasticBlockDepth(configuration, ukRailProfile, facadeProfileDepth)
                      && <p className="color-hint" role="alert">Der Kunststoffklotz passt nicht in den verfügbaren Mauerabstand.</p>}
                  </>
                )}
                <p className="color-hint">
                  Befestigungslöcher und rote Schrauben: {ukRailFixings.length}
                </p>
              </>
            )
            : (
              <>
                <p className="color-hint">
                  Vertikale L-Winkel 50 × 40 × 2 mm, erster Winkel je Seite ca. 150 mm vom Fassadenrand, maximal 800 mm Achsabstand. Länge folgt der lokalen Fassadenkontur mit 5 mm unten und 45 mm oben.
                </p>
                <p className="color-hint">
                  Jede UK-Schiene muss auf mindestens zwei L-Winkeln aufliegen. Wenn nötig, werden Schienen kollisionsfrei bis zum nächsten Winkel verlängert; andernfalls wird der Winkelabstand verringert.
                </p>
                <NumberField
                  label="Max. Abstand Maueranschlussteile"
                  value={getUkAngleConnectorMaximumSpacing(configuration)}
                  unit="mm"
                  min={100}
                  max={2000}
                  step={50}
                  disabled={!ukRailView.enabled}
                  onChange={(connectorMaxSpacing) => updateUkRailView({ connectorMaxSpacing })}
                />
                {ukAngleProfile && <p className="color-hint">DXF-Profil aktiv · {ukAnglePlacements.length} Winkel positioniert.</p>}
                {ukConnectorCount > 0 && <p className="color-hint">Maueranschlussteile positioniert: {ukConnectorCount}</p>}
                {ukAngleError && <p className="color-hint" role="alert">{ukAngleError}</p>}
              </>
            )}
          <div className="wall-contour-info">
            <div className="profile-state">
              <span className="state-dot" />
              <span>{ukRailProfile ? `DXF-Profil aktiv · ${formatMillimeters(ukRailProfile.depth)} × ${formatMillimeters(ukRailProfile.height)} mm` : 'UK-Schienen-DXF wird geladen...'}</span>
            </div>
            <p className="color-hint">
              Horizontal, mindestens 2 Reihen, höchstens 1.200 mm Achsabstand. Untere Reihe 125–300 mm über Fassadenunterkante, obere 60–300 mm unter Fassadenoberkante. Wenn ein erforderlicher Höhenversatz unter 150 mm liegt, werden Schienen durchgehend geführt; ab 150 mm entsteht ein Sprung. An Höhensprüngen überlappen die Schienen bis zu 150 mm, soweit sie sich dabei nicht schneiden. Wo Fassadenbereiche mehr als 300 mm über die oberste oder unter die unterste Schiene hinausragen, werden lokal zusätzliche Schienen gesetzt. Der Abstand zu den Fassadenprofilen beträgt genau 7,5 mm; die Schienen sind je Seite 5 mm kürzer und werden bei Bedarf mit Stoß auf maximal 6.000 mm je Stück geteilt.
            </p>
            {ukRailView.enabled && ukRailProfile && (
              <p className="color-hint">Positionierte UK-Teilstücke: {ukRailPlacements.length}</p>
            )}
            {ukRailError && <p className="color-hint" role="alert">{ukRailError}</p>}
          </div>
        </div>
      </details>

      <details
        className="config-section"
        open={openSections.profile}
        onToggle={(event) => {
          const isOpen = event.currentTarget.open
          setOpenSections((sections) => ({ ...sections, profile: isOpen }))
        }}
      >
        <summary className="section-heading">
          <span className="section-index">04</span>
          <h2>Profil</h2>
        </summary>
        <label className="field-label profile-select-field">
          <span>{profileMix.mode === 'single' ? 'Standardprofil' : 'Referenzprofil (Tiefe)'}</span>
          <select
            value={profile.name}
            onChange={(event) => {
              const selectedProfile = STANDARD_PROFILES.find((candidate) => candidate.name === event.target.value)
              if (!selectedProfile) {
                throw new Error(`Unbekanntes Standardprofil: ${event.target.value}`)
              }
              onChange({
                profile: selectedProfile,
                ...(selectedProfile.id === 'block16L' && facadeEnds.left === 'high' && facadeEnds.right === 'high'
                  ? { facadeEnds: { ...facadeEnds, right: 'low' as const } }
                  : {}),
              })
            }}
            aria-label="Standardprofil auswählen"
          >
            {STANDARD_PROFILES.map((candidate) => <option key={candidate.id} value={candidate.name}>{candidate.name}</option>)}
          </select>
          </label>
        <div className="field-stack profile-mix-fields">
          <label className="field-label">
            <span>Profilanordnung</span>
            <select
              value={profileMix.mode}
              aria-label="Profilanordnung auswählen"
              onChange={(event) => onChange({
                profileMix: { ...profileMix, mode: event.target.value as ProfileMixMode },
              })}
            >
              <option value="single">Einzelprofil</option>
              <option value="module">Modul (Reihenfolge)</option>
              <option value="percent">Prozentuelle Mischung</option>
            </select>
          </label>
          {profileMix.mode === 'module' && (
            <div className="field-stack">
              <span className="field-hint">Reihenfolge von links nach rechts, wird über die Breite wiederholt.</span>
              {profileMix.module.map((id, index) => (
                <div key={`${id}-${index}`} className="profile-mix-row">
                  <select
                    value={id}
                    aria-label={`Modulprofil ${index + 1}`}
                    onChange={(event) => onChange({
                      profileMix: {
                        ...profileMix,
                        module: profileMix.module.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry),
                      },
                    })}
                  >
                    {STANDARD_PROFILES.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                  </select>
                  <button
                    type="button"
                    aria-label={`Modulprofil ${index + 1} entfernen`}
                    disabled={profileMix.module.length <= 1}
                    onClick={() => onChange({
                      profileMix: { ...profileMix, module: profileMix.module.filter((_, entryIndex) => entryIndex !== index) },
                    })}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => onChange({
                  profileMix: { ...profileMix, module: [...profileMix.module, profileMix.module[profileMix.module.length - 1] ?? 'even'] },
                })}
              >
                + Profil hinzufügen
              </button>
            </div>
          )}
          {profileMix.mode === 'percent' && (
            <div className="field-stack">
              {STANDARD_PROFILES.map((candidate) => (
                <label key={candidate.id} className="field-label">
                  <span>{candidate.name} (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={profileMix.percentages[candidate.id] ?? 0}
                    onChange={(event) => onChange({
                      profileMix: {
                        ...profileMix,
                        percentages: { ...profileMix.percentages, [candidate.id]: Math.max(0, Number(event.target.value) || 0) },
                      },
                    })}
                  />
                </label>
              ))}
              <span className={Math.abs(getPercentageTotal(profileMix) - 100) > 1e-6 ? 'field-error' : 'field-hint'}>
                Summe: {Math.round(getPercentageTotal(profileMix) * 100) / 100} % (muss 100 % ergeben)
              </span>
              <label className="field-label">
                <span>Zufallsmuster (Seed)</span>
                <input
                  type="number"
                  step={1}
                  value={profileMix.seed}
                  onChange={(event) => onChange({ profileMix: { ...profileMix, seed: Math.trunc(Number(event.target.value) || 0) } })}
                />
              </label>
            </div>
          )}
        </div>
        <div className="field-stack facade-end-fields">
          <label className="field-label">
            <span>Linkes Fassadenende</span>
            <select
              value={facadeEnds.left}
              onChange={(event) => {
                const finish = event.target.value
                if (finish !== 'high' && finish !== 'low') {
                  throw new Error(`Unbekannte Endausbildung links: ${finish}`)
                }
                onChange({ facadeEnds: { ...facadeEnds, left: finish } })
              }}
              aria-label="Linkes Fassadenende"
            >
              <option value="high" disabled={profile.id === 'block16L' && facadeEnds.right === 'high'}>Hoch · vordere Profilebene</option>
              <option value="low">Niedrig · hintere Decklasche</option>
            </select>
          </label>
          <label className="field-label">
            <span>Rechtes Fassadenende</span>
            <select
              value={facadeEnds.right}
              onChange={(event) => {
                const finish = event.target.value
                if (finish !== 'high' && finish !== 'low') {
                  throw new Error(`Unbekannte Endausbildung rechts: ${finish}`)
                }
                onChange({ facadeEnds: { ...facadeEnds, right: finish } })
              }}
              aria-label="Rechtes Fassadenende"
            >
              <option value="high" disabled={profile.id === 'block16L' && facadeEnds.left === 'high'}>Hoch · vordere Profilebene</option>
              <option value="low">Niedrig · hintere Decklasche</option>
            </select>
          </label>
        </div>
        <div className="profile-info">
          <div className="profile-state"><span className="state-dot" /><span>{profile.source === 'standard' ? 'Standardprofil aktiv' : profile.source === 'dxf' ? 'DXF importiert' : 'Beispielprofil aktiv'}</span></div>
          <p className="profile-name" title={profile.name}>{profile.name}</p>
          <div className="profile-dimensions">
            <span><Ruler size={13} /> Breite <strong>{formatMillimeters(profile.width)} mm</strong></span>
            <span>Tiefe <strong>{formatMillimeters(profile.depth)} mm</strong></span>
          </div>
        </div>
        <div className="color-settings">
          <label className="field-label color-ral-field">
            <span>RAL Classic</span>
            <span className="color-control">
              <span className="color-preview" style={{ backgroundColor: configuration.profileColor }} aria-hidden="true" />
              <select
                value={selectedRal?.code ?? 'custom'}
                onChange={(event) => {
                  if (event.target.value === 'custom') return
                  const selectedColor = RAL_CLASSIC_COLORS.find((color) => color.code === event.target.value)
                  if (!selectedColor) throw new Error(`Unbekannter RAL-Farbton: ${event.target.value}`)
                  onChange({ profileColor: selectedColor.hex })
                }}
                aria-label="RAL-Farbton auswählen"
              >
                {RAL_CLASSIC_COLORS.map((color) => <option key={color.code} value={color.code}>{color.code} · {color.name}</option>)}
                <option value="custom">Benutzerdefiniert</option>
              </select>
            </span>
            </label>
          <label className="field-label color-field">
            <span>HEX-Farbwert</span>
            <input
              className="hex-color-input"
              type="text"
              value={hexDraft}
              onChange={(event) => {
                const value = event.target.value.toUpperCase()
                setHexDraft(value)
                if (/^#[0-9A-F]{6}$/.test(value)) onChange({ profileColor: value.toLowerCase() })
              }}
              onBlur={() => setHexDraft(configuration.profileColor.toUpperCase())}
              aria-label="HEX-Farbwert eingeben"
              aria-describedby="hex-color-hint"
              pattern="#[0-9A-Fa-f]{6}"
              maxLength={7}
              spellCheck={false}
            />
          </label>
          <span id="hex-color-hint" className="color-hint">Alternativ zum RAL-Ton eingeben · Format #RRGGBB</span>
        </div>
      </details>

      <details
        className="config-section export-section"
        open={openSections.export}
        onToggle={(event) => {
          const isOpen = event.currentTarget.open
          setOpenSections((sections) => ({ ...sections, export: isOpen }))
        }}
      >
        <summary className="section-heading">
          <span className="section-index">05</span>
          <h2>CAD-Export</h2>
        </summary>
        <button
          className="upload-button"
          type="button"
          onClick={onExportStep}
          disabled={!layout.isValid || isExporting || isPdfExporting || isExcelExporting}
        >
          <Download size={16} strokeWidth={1.8} />
          <span>{isExporting ? 'STEP wird erstellt...' : 'Gesamte Fassade als STEP exportieren'}</span>
        </button>
        {exportStatus && <p className="export-status" role="status" aria-live="polite">{exportStatus}</p>}
        {isExporting && (
          <div className="export-progress" role="group" aria-label="STEP-Exportfortschritt">
            <progress max={100} value={exportProgress} aria-label="STEP-Exportfortschritt" />
            <span>{Math.round(exportProgress)} %</span>
          </div>
        )}
        {exportError && <p className="export-error" role="alert">{exportError}</p>}
        <p className="export-note">Bei eingeschalteter Unterkonstruktion enthält STEP zusätzlich alle UK-Schienenstücke und je nach Montageart die Bohrungen mit roten Schrauben und Kunststoffklötzen oder L-Winkel mit positionierten Maueranschlussteilen; bei eingeschalteter Maueransicht außerdem Grundmauer und aktivierte Anbauten. Eine DXF-Mauerkontur schneidet Profile geometrisch zu.</p>
        <div className="excel-export">
          <h3>Zuschnittliste Profile</h3>
          <p className="export-note">Profillängen und Gehrungswinkel für die waagerechte Aufspannung an der Doppelgehrungssäge.</p>
          <button
            className="upload-button"
            type="button"
            onClick={onExportExcel}
            disabled={!layout.isValid || isExporting || isPdfExporting || isExcelExporting}
          >
            <FileSpreadsheet size={16} strokeWidth={1.8} />
            <span>{isExcelExporting ? 'Excel wird erstellt...' : 'Zuschnittliste Profile exportieren'}</span>
          </button>
          {excelExportStatus && <p className="export-status" role="status" aria-live="polite">{excelExportStatus}</p>}
          {excelExportError && <p className="export-error" role="alert">{excelExportError}</p>}
        </div>
        <div className="pdf-export">
          <h3>PDF: Ansicht gesamter Fassade</h3>
          <p className="export-note">Drei Linienansichten mit Maßangaben · A3 quer · Maßstab automatisch</p>
          <button
            className="upload-button"
            type="button"
            onClick={onExportPdf}
            disabled={!layout.isValid || isExporting || isPdfExporting || isExcelExporting}
          >
            <Download size={16} strokeWidth={1.8} />
            <span>{isPdfExporting ? 'PDF wird erstellt...' : 'A3-Plan als PDF exportieren'}</span>
          </button>
          {pdfExportStatus && <p className="export-status" role="status" aria-live="polite">{pdfExportStatus}</p>}
          {pdfExportError && <p className="export-error" role="alert">{pdfExportError}</p>}
        </div>
      </details>

      <footer className="panel-footer"><span>LINARTE / KONFIGURATION</span><span>MM · DE</span></footer>
    </aside>
  )
}
