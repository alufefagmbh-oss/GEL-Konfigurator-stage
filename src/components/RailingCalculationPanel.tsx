import { useState } from 'react'
import type { RefObject } from 'react'
import { calculateRailingPrice } from '../domain/railingPricing'
import type { PriceList, RailingCalculation } from '../domain/railingPricing'
import type { ProfilePart } from '../domain/railingProfile'
import type { RailingAccessoryLayout } from '../domain/railingAccessories'
import type { RailingMounting } from '../domain/railingMounting'
import { PricingAdminDialog } from './PricingAdminDialog'
import { ShippingCostDialog } from './ShippingCostDialog'
import type { ViewerImage } from '../viewer/viewerImage'

const money = (value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
const unitMoney = (value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value)
const quantity = (value: number, unit: string) => new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: unit === 'lfm' ? 1 : 0,
  maximumFractionDigits: unit === 'lfm' ? 1 : 6,
}).format(value)

export function RailingCalculationPanel({ profiles, accessories, valid, projectName, prices, setPrices, priceListName, setPriceListName, visualSnapshot, captureViewerRef, mounting }: {
  profiles: ProfilePart[]
  accessories: RailingAccessoryLayout
  valid: boolean
  projectName: string
  prices: PriceList
  setPrices: (prices: PriceList) => void
  priceListName: string
  setPriceListName: (name: string) => void
  visualSnapshot: string
  captureViewerRef: RefObject<(() => ViewerImage) | null>
  mounting: RailingMounting
}) {
  const [adminOpen, setAdminOpen] = useState(false)
  const [shippingOpen, setShippingOpen] = useState(false)
  const [result, setResult] = useState<{ snapshot: string; calculation: RailingCalculation; shipping: number } | null>(null)
  const [error, setError] = useState('')
  const snapshot = JSON.stringify([profiles, accessories, prices, projectName, priceListName, visualSnapshot, mounting])
  const current = valid && result?.snapshot === snapshot ? result : null

  const calculate = () => {
    setError('')
    setResult(null)
    if (!valid) {
      setError('Bitte zuerst eine gültige Geländerkonfiguration eingeben.')
      return
    }
    if (profiles.length === 0) {
      setError('Bitte einen Montagefall mit Geländer auswählen.')
      return
    }
    setShippingOpen(true)
  }

  const confirmCalculation = (shipping: number) => {
    setShippingOpen(false)
    setError('')
    try {
      setResult({ snapshot, calculation: calculateRailingPrice(profiles, accessories, prices, mounting), shipping })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Die Kalkulation ist fehlgeschlagen.')
    }
  }

  const downloadPdf = async () => {
    if (!current) return
    setError('')
    try {
      if (!captureViewerRef.current) throw new Error('Die 3D-Ansicht ist nicht verfügbar. Bitte die Ansicht prüfen und erneut versuchen.')
      const image = captureViewerRef.current()
      const { createRailingCalculationPdf } = await import('../pdf/createRailingCalculationPdf')
      await createRailingCalculationPdf(current.calculation, projectName, priceListName, image, current.shipping)
    } catch (cause) {
      setError(`PDF konnte nicht erstellt werden: ${cause instanceof Error ? cause.message : 'Unbekannter Fehler.'}`)
    }
  }

  return (
    <details className="config-section">
      <summary className="section-heading"><span className="section-index">08</span><h2>Kalkulation</h2></summary>
      <div className="pricing-actions">
        <button type="button" className="upload-button" onClick={() => setAdminOpen(true)}>Preise eingeben</button>
        <button type="button" className="upload-button" onClick={calculate}>Kalkulation</button>
      </div>
      <p className="slab-note">{priceListName ? `Preisliste: ${priceListName}. ` : ''}Preise als Datei sichern. Glas und Stahlblech bzw. Betondecke sind nicht enthalten.</p>
      <p className="slab-note">Das PDF enthält die aktuelle 3D-Ansicht ohne Bemaßung; Blickwinkel und Sichtbarkeit können in der Vorschau eingestellt werden.</p>
      {error && <p className="dimension-error" role="alert">{error}</p>}
      {result && !current && <p className="slab-note">Konfiguration oder Preise geändert. Bitte erneut kalkulieren.</p>}
      {current && <div className="pricing-result" role="status">
        {current.calculation.lines.map((line) => <div key={line.label} className="pricing-result-line">
          <span>{line.label}<small>{quantity(line.quantity, line.unit)} {line.unit} × {unitMoney(line.unitPrice)}</small></span>
          <span>{money(line.total)}</span>
        </div>)}
        <div className="pricing-result-line"><span>Verpackung und Versand netto</span><span>{money(current.shipping)}</span></div>
        <div className="pricing-total"><span>Gesamt netto inkl. Transport und Versand</span><strong>{money(Math.round((current.calculation.total + current.shipping) * 100) / 100)}</strong></div>
        <button type="button" className="upload-button" onClick={() => void downloadPdf()}>Kalkulation als PDF</button>
      </div>}
      {shippingOpen && <ShippingCostDialog onConfirm={confirmCalculation} onClose={() => setShippingOpen(false)} />}
      {adminOpen && <PricingAdminDialog prices={prices} name={priceListName} onSave={(updated, name) => { setPrices(updated); setPriceListName(name); setError('') }} onClose={() => setAdminOpen(false)} />}
    </details>
  )
}
