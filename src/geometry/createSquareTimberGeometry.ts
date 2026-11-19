import * as THREE from 'three'
import type { SquareTimberPlacement } from '../domain/types'

// Lokale Achsen: X = Breite (zentriert), Y = Höhe ab Unterkante, Z = Tiefe von 0 bis -side.
export function createSquareTimberGeometry(
  timber: SquareTimberPlacement,
  holeDiameter: number,
): THREE.BufferGeometry {
  const { width, depth: side } = timber
  if (!Number.isFinite(side) || side <= 0 || !Number.isFinite(width) || width <= 0
    || !Number.isFinite(holeDiameter) || holeDiameter <= 0 || holeDiameter >= width) {
    throw new Error('Die Kantholzmaße und der Lochdurchmesser müssen gültig sein; das Loch muss kleiner als das Kantholz sein.')
  }
  const height = timber.top - timber.bottom
  const shape = new THREE.Shape()
  shape.moveTo(-width / 2, 0)
  shape.lineTo(width / 2, 0)
  shape.lineTo(width / 2, height)
  shape.lineTo(-width / 2, height)
  shape.closePath()
  for (const holeHeight of timber.holeHeights) {
    const hole = new THREE.Path()
    hole.absellipse(0, holeHeight - timber.bottom, holeDiameter / 2, holeDiameter / 2, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: side, bevelEnabled: false, curveSegments: 32 })
  geometry.translate(0, 0, -side)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
