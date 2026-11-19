export type ProjectExportExtension = 'linarte.json' | 'step' | 'pdf'

export function timestampedFileName(name: string, extension: string, fallback: string, date = new Date()): string {
  const safeName = name.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/[. ]+$/g, '')
  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-') + `_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`
  return `${safeName || fallback}_${timestamp}.${extension}`
}

export function getProjectExportFileName(
  name: string,
  extension: ProjectExportExtension,
  date = new Date(),
): string {
  return timestampedFileName(name, extension, 'Linarte-Projekt', date)
}
