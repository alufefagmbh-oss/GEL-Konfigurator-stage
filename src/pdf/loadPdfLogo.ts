export interface PdfLogo {
  dataUrl: string
  width: number
  height: number
}

export async function loadPdfLogo(): Promise<PdfLogo> {
  const response = await fetch(`${import.meta.env.BASE_URL}gel-konfigurator-logo.jpg`)
  if (!response.ok) throw new Error(`Das Logo konnte nicht geladen werden (HTTP ${response.status}).`)
  const reader = new FileReader()
  const dataUrl = new Promise<string>((resolve, reject) => {
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Das Logo konnte nicht für den PDF-Export gelesen werden.'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Das Logo konnte nicht für den PDF-Export gelesen werden.'))
  })
  const blob = await response.blob()
  reader.readAsDataURL(blob)
  const [dataUrlResult, image] = await Promise.all([dataUrl, createImageBitmap(blob)])
  const dimensions = { width: image.width, height: image.height }
  image.close()
  return { dataUrl: dataUrlResult, ...dimensions }
}
