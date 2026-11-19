import { useEffect, useRef, useState } from 'react'
import type { PriceList } from '../domain/railingPricing'
import { RAILING_SCREW_DESCRIPTION } from '../domain/railingPricing'
import { parsePriceList, serializePriceList } from '../domain/priceListFile'
import { timestampedFileName } from '../domain/exportFileName'

type PriceKey = Exclude<keyof PriceList, 'profileStockLengthMm' | 'profilePerMeter'>
const fields: Array<{ key: PriceKey; label: string; unit: string; group: 'aluminium' | 'other' | 'work' }> = [
  { key: 'glassShoe', label: 'Glasschuh', unit: '€/Stk.', group: 'aluminium' },
  { key: 'clampWedge', label: 'Klemmleiste', unit: '€/Stk.', group: 'aluminium' },
  { key: 'sealLipPerMeter', label: 'Dichtlippen', unit: '€/lfm', group: 'other' },
  { key: 'screw', label: RAILING_SCREW_DESCRIPTION, unit: '€/Stk.', group: 'other' },
  { key: 'profileCut', label: 'Schnitt Geländerschuh', unit: '€/Schnitt', group: 'work' },
  { key: 'holeUpTo4', label: 'Bohrung bis 4 mm', unit: '€/Stk.', group: 'work' },
  { key: 'holeUpTo8', label: 'Bohrung über 4 bis 8 mm', unit: '€/Stk.', group: 'work' },
  { key: 'holeOver8', label: 'Bohrung über 8 mm', unit: '€/Stk.', group: 'work' },
]

function display(value: number | null): string {
  return value === null ? '' : String(Number(value.toPrecision(12)))
}

export function PricingAdminDialog({ prices, name, onSave, onClose }: {
  prices: PriceList
  name: string
  onSave: (prices: PriceList, name: string) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [listName, setListName] = useState(name)
  const [values, setValues] = useState(() => priceValues(prices))
  const [error, setError] = useState('')
  const [fileDownload, setFileDownload] = useState<{ url: string; name: string } | null>(null)

  function priceValues(list: PriceList): Record<keyof PriceList | 'profilePerPiece', string> {
    return {
      profileStockLengthMm: String(list.profileStockLengthMm),
      profilePerMeter: display(list.profilePerMeter),
      profilePerPiece: display(list.profilePerMeter === null ? null : list.profilePerMeter * list.profileStockLengthMm / 1000),
      glassShoe: display(list.glassShoe), clampWedge: display(list.clampWedge), sealLipPerMeter: display(list.sealLipPerMeter),
      screw: display(list.screw), profileCut: display(list.profileCut), holeUpTo4: display(list.holeUpTo4),
      holeUpTo8: display(list.holeUpTo8), holeOver8: display(list.holeOver8),
    }
  }

  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  useEffect(() => () => { if (fileDownload) URL.revokeObjectURL(fileDownload.url) }, [fileDownload])

  const update = (key: keyof PriceList | 'profilePerPiece', value: string) => {
    setFileDownload(null)
    setValues((current) => {
      const next = { ...current, [key]: value }
      const length = Number(next.profileStockLengthMm)
      if (key === 'profileStockLengthMm' && next.profilePerMeter === '' && next.profilePerPiece !== '') {
        const price = Number(next.profilePerPiece)
        if (Number.isFinite(price) && Number.isFinite(length) && length > 0) next.profilePerMeter = display(price * 1000 / length)
      } else if (key === 'profilePerMeter' || key === 'profileStockLengthMm') {
        const price = next.profilePerMeter.trim() === '' ? null : Number(next.profilePerMeter)
        if (price === null) next.profilePerPiece = ''
        else if (Number.isFinite(price) && Number.isFinite(length) && length > 0) next.profilePerPiece = display(price * length / 1000)
        else next.profilePerPiece = ''
      } else if (key === 'profilePerPiece') {
        const price = value.trim() === '' ? null : Number(value)
        next.profilePerMeter = price === null || !Number.isFinite(price) || !Number.isFinite(length) || length <= 0
          ? '' : display(price * 1000 / length)
      }
      return next
    })
  }

  const readValues = (): PriceList => {
    const length = Number(values.profileStockLengthMm)
    if (!values.profileStockLengthMm.trim() || !Number.isFinite(length) || length <= 0) {
      throw new Error('Bitte eine gültige Rohprofillänge größer als 0 mm eingeben.')
    }
    const result = { ...prices, profileStockLengthMm: length }
    for (const key of ['profilePerMeter', ...fields.map((field) => field.key)] as Array<Exclude<keyof PriceList, 'profileStockLengthMm'>>) {
      const input = values[key].trim()
      const amount = input === '' ? null : Number(input)
      if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
        throw new Error('Preise müssen gültige Zahlen größer oder gleich 0 sein.')
      }
      result[key] = amount
    }
    return result
  }

  const save = () => {
    try { onSave(readValues(), listName.trim()); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Preise konnten nicht übernommen werden.') }
  }

  const prepareDownload = () => {
    try {
      const cleanName = listName.trim()
      if (!cleanName) throw new Error('Bitte einen Namen für die Preisliste eingeben.')
      const contents = serializePriceList({ name: cleanName, prices: readValues() })
      setFileDownload({ url: URL.createObjectURL(new Blob([contents], { type: 'application/json' })), name: timestampedFileName(cleanName, 'preise.json', 'Preisliste') })
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Preisdatei konnte nicht erstellt werden.') }
  }

  const importFile = async (file: File) => {
    try {
      const list = parsePriceList(await file.text())
      setValues(priceValues(list.prices))
      setListName(list.name)
      setFileDownload(null)
      setError('')
    } catch (cause) { setError(`Preisdatei konnte nicht importiert werden: ${cause instanceof Error ? cause.message : 'Unbekannter Fehler.'}`) }
  }

  const field = (label: string, key: keyof PriceList | 'profilePerPiece', unit: string, min = 0) => (
    <label className="field-label pricing-field">
      <span>{label}</span>
      <span className="input-with-unit">
        <input type="number" min={min} step="any" value={values[key]} onChange={(event) => update(key, event.target.value)} />
        <span>{unit}</span>
      </span>
    </label>
  )

  return (
    <dialog ref={dialog} className="pricing-dialog" aria-labelledby="pricing-admin-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
      <h2 id="pricing-admin-title">Preise eingeben</h2>
      <p className="slab-note">Preise in Euro netto. Preisliste als Datei speichern und später wieder importieren. Leere Felder sind nicht festgelegt.</p>
      <label className="field-label pricing-field"><span>Name der Preisliste / Kunde</span>
        <input type="text" value={listName} onChange={(event) => { setListName(event.target.value); setFileDownload(null) }} />
      </label>
      <div className="pricing-actions pricing-file-actions">
        <input ref={fileInput} hidden type="file" accept=".json,application/json" onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importFile(file)
        }} />
        <button type="button" className="upload-button" onClick={() => fileInput.current?.click()}>Preisdatei importieren</button>
        <button type="button" className="upload-button" onClick={prepareDownload}>Preisdatei speichern</button>
      </div>
      {fileDownload && <a className="slab-download" href={fileDownload.url} download={fileDownload.name}>Preisdatei herunterladen</a>}
      <fieldset className="pricing-category"><legend>Alupreise</legend><p className="slab-note">Geländerschuh: Preis je Rohprofil und je Laufmeter werden automatisch umgerechnet.</p><div className="pricing-form">
        {field('Rohprofillänge Geländerschuh', 'profileStockLengthMm', 'mm', 1)}
        {field('Geländerschuh je lfm', 'profilePerMeter', '€/lfm')}
        {field('Geländerschuh je Rohprofil', 'profilePerPiece', '€/Stk.')}
        {fields.filter((item) => item.group === 'aluminium').map(({ key, label, unit }) => <div key={key}>{field(label, key, unit)}</div>)}
      </div></fieldset>
      <fieldset className="pricing-category"><legend>Sonstige Teile</legend><div className="pricing-form">
        {fields.filter((item) => item.group === 'other').map(({ key, label, unit }) => <div key={key}>{field(label, key, unit)}</div>)}
      </div><p className="slab-note">Die Schraube ist schematisch; Hersteller, Gewinde und Befestigungszulassung sind nicht festgelegt.</p></fieldset>
      <fieldset className="pricing-category"><legend>Bearbeitungspreise</legend><div className="pricing-form">
        {fields.filter((item) => item.group === 'work').map(({ key, label, unit }) => <div key={key}>{field(label, key, unit)}</div>)}
      </div></fieldset>
      {error && <p className="dimension-error" role="alert">{error}</p>}
      <div className="pricing-actions">
        <button type="button" className="upload-button" onClick={onClose}>Abbrechen</button>
        <button type="button" className="upload-button" onClick={save}>Preise übernehmen</button>
      </div>
    </dialog>
  )
}
