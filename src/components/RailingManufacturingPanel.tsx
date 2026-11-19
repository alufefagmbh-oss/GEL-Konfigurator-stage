import { useState } from 'react'
import { Download } from 'lucide-react'
import { createRailingManufacturingData } from '../domain/railingManufacturing'
import type { RailingAccessoryLayout } from '../domain/railingAccessories'
import type { ProfilePart } from '../domain/railingProfile'
import type { RailingMounting } from '../domain/railingMounting'

export function RailingManufacturingPanel({ profiles, accessories, valid, projectName, mounting }: {
  profiles: ProfilePart[]
  accessories: RailingAccessoryLayout
  valid: boolean
  projectName: string
  mounting: RailingMounting
}) {
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const exportPdf = async () => {
    setError('')
    if (!valid || profiles.length === 0) {
      setError('Bitte zuerst eine gültige Geländerkonfiguration mit Profilen eingeben.')
      return
    }
    setWorking(true)
    try {
      const data = createRailingManufacturingData(profiles, accessories, mounting)
      const { createRailingManufacturingPdf } = await import('../pdf/createRailingManufacturingPdf')
      await createRailingManufacturingPdf(data, projectName)
    } catch (cause) {
      setError(`AV-Export fehlgeschlagen: ${cause instanceof Error ? cause.message : 'Unbekannter Fehler.'}`)
    } finally { setWorking(false) }
  }
  return <details className="config-section">
    <summary className="section-heading"><span className="section-index">07</span><h2>Export AV</h2></summary>
    <button type="button" className="upload-button" disabled={working} onClick={() => void exportPdf()}>
      <Download size={15} /> {working ? 'AV-PDF wird erstellt …' : 'AV-PDF herunterladen'}
    </button>
    <p className="slab-note">{mounting === '7A'
      ? 'Stückliste und Bearbeitungsdaten für die seitliche Befestigung. Das Stahlblech dient nur zur Visualisierung und ist nicht Teil des AV-Exports.'
      : 'Stückliste und Bearbeitungsdaten je Geländerschuh. Glas und Betondecke sind nicht enthalten.'} Modellangaben vor der Fertigung prüfen.</p>
    {error && <p className="dimension-error" role="alert">{error}</p>}
  </details>
}
