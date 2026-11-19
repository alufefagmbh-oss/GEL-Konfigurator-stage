import { useEffect, useRef, useState } from 'react'

export function ShippingCostDialog({ onConfirm, onClose }: {
  onConfirm: (amount: number) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])

  const submit = () => {
    const text = value.trim().replace(',', '.')
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
      setError('Bitte einen Betrag ab 0 mit höchstens zwei Nachkommastellen eingeben.')
      return
    }
    const amount = Number(text)
    if (!Number.isFinite(amount) || amount > 100000000) {
      setError('Bitte einen Betrag zwischen 0 und 100.000.000 Euro eingeben.')
      return
    }
    onConfirm(amount)
  }

  return <dialog ref={dialog} className="pricing-dialog shipping-dialog" aria-labelledby="shipping-title"
    onCancel={(event) => { event.preventDefault(); onClose() }}>
    <h2 id="shipping-title">Verpackung und Versand</h2>
    <p className="slab-note">Bitte den gemeinsamen Netto-Preis eingeben. Er wird in der Kalkulation und im PDF zum Gesamtpreis addiert. Für kostenlose Lieferung 0 eingeben.</p>
    <form onSubmit={(event) => { event.preventDefault(); submit() }}>
      <label className="field-label pricing-field">
        <span>Verpackung und Versand netto</span>
        <span className="input-with-unit"><input autoFocus type="text" inputMode="decimal" value={value}
          aria-invalid={!!error} aria-describedby={error ? 'shipping-error' : undefined}
          onChange={(event) => { setValue(event.target.value); setError('') }} /><span>€</span></span>
      </label>
      {error && <p id="shipping-error" className="dimension-error" role="alert">{error}</p>}
      <div className="pricing-actions shipping-actions">
        <button type="button" className="upload-button" onClick={onClose}>Abbrechen</button>
        <button type="submit" className="upload-button">Kalkulation anzeigen</button>
      </div>
    </form>
  </dialog>
}
