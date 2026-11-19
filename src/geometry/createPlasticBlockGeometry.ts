import * as THREE from 'three'

export function createPlasticBlockGeometry(depth: number, holeDiameter: number): THREE.BufferGeometry {
  if (!Number.isFinite(depth) || depth <= 0 || !Number.isFinite(holeDiameter) || holeDiameter <= 0 || holeDiameter >= 60) {
    throw new Error('Die Klotztiefe und der Durchmesser des Klotzlochs müssen gültig sein; das Loch muss kleiner als 60 mm sein.')
  }
  const shape = new THREE.Shape()
  shape.moveTo(-30, -30)
  shape.lineTo(30, -30)
  shape.lineTo(30, 30)
  shape.lineTo(-30, 30)
  shape.closePath()

  const hole = new THREE.Path()
  hole.absellipse(0, 0, holeDiameter / 2, holeDiameter / 2, 0, Math.PI * 2, true)
  shape.holes.push(hole)

  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 32 })
  geometry.translate(0, 0, -depth / 2)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
