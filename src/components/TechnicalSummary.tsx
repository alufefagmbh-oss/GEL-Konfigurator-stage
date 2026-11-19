import { Layers3, Package, ScanLine } from 'lucide-react'
import { calculateFacadeAreaSquareMeters, calculateFacadeMassKilograms } from '../domain/facadeMass'
import type { FacadeConfiguration, FacadeLayout, UkRailPlacement, UkRailProfile, WallContour } from '../domain/types'
import { getFacadeProfilePlacements } from '../domain/profilePlacement'

export function TechnicalSummary({
  configuration,
  layout,
  wallContour,
  ukRailProfile,
  ukRailPlacements,
}: {
  configuration: FacadeConfiguration
  layout: FacadeLayout
  wallContour: WallContour | null
  ukRailProfile: UkRailProfile | null
  ukRailPlacements: UkRailPlacement[]
}) {
  const profileCount = getFacadeProfilePlacements(configuration, layout).length
  const facadeArea = calculateFacadeAreaSquareMeters(configuration)
  const facadeMass = calculateFacadeMassKilograms(
    configuration,
    layout,
    wallContour,
    (configuration.ukRailView?.enabled ?? true) ? ukRailProfile : null,
    (configuration.ukRailView?.enabled ?? true) ? ukRailPlacements : [],
  )
  const stats = [
    { icon: ScanLine, label: 'Fassadenfläche', value: new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(facadeArea), unit: 'm²' },
    { icon: Layers3, label: 'Profile gesamt', value: String(profileCount), unit: 'Stk.' },
    { icon: Package, label: 'Masse der Fassade', value: new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(facadeMass), unit: 'kg' },
  ]

  return (
    <section className="technical-summary" aria-label="Technische Zusammenfassung">
      <details open>
        <summary className="summary-heading">
          <span>PROJEKTDATEN</span>
          <span className="summary-toggle-hint">EIN-/AUSKLAPPEN</span>
        </summary>
        <div className="summary-grid">
          {stats.map(({ icon: Icon, label, value, unit }) => (
            <div className="summary-stat" key={label}>
              <Icon size={15} strokeWidth={1.7} />
              <div><span>{label}</span><strong>{value}<small> {unit}</small></strong></div>
            </div>
          ))}
        </div>
      </details>
    </section>
  )
}
