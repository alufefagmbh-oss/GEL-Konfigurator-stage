const measurementFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatMeasurement(value: number): string {
  return measurementFormatter.format(Math.abs(value) < 0.000001 ? 0 : value)
}
