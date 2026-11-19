import type { SpidiConnectorBounds, UkAngleConnectorPlacement } from './types'

export type CadConnectorTransform = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

export type ViewerConnectorTransform = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

// Pauschaler Versatz nach links (Fassadenansicht von vorne), gemessen in Fassadenbreite
export const SPIDI_CONNECTOR_LEFT_OFFSET_MM = 38

export function getSpidiConnectorTransforms(
  placement: UkAngleConnectorPlacement,
  bounds: SpidiConnectorBounds,
  wallOffset: number,
  facadeWidth: number,
  facadeHeight: number,
  profileFrontEdgeY = 0,
): { cad: CadConnectorTransform; viewer: ViewerConnectorTransform } {
  const centerY = (bounds.minY + bounds.maxY) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const cadTranslationX = placement.centerX + centerY - SPIDI_CONNECTOR_LEFT_OFFSET_MM
  // Die Rückseite (Pad) liegt auf der Mauervorderkante; CAD misst die Tiefe ab der Profilvorderkante.
  const cadTranslationY = wallOffset - bounds.maxX
  const viewerTranslationY = cadTranslationY + profileFrontEdgeY
  const cadTranslationZ = placement.centerHeight - centerZ

  return {
    cad: [
      0, -1, 0, cadTranslationX,
      1, 0, 0, cadTranslationY,
      0, 0, 1, cadTranslationZ,
    ],
    viewer: [
      0, -1, 0, cadTranslationX - facadeWidth / 2,
      0, 0, 1, cadTranslationZ - facadeHeight / 2,
      -1, 0, 0, -viewerTranslationY,
      0, 0, 0, 1,
    ],
  }
}
