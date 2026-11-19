import * as THREE from 'three'
import type { UkAngleProfile } from '../domain/types'
import { getUkAngleProfileContours } from '../domain/ukMounting'

export function createUkAngleGeometry(
  profile: UkAngleProfile,
  length: number,
  mirrored = false,
): THREE.BufferGeometry {
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error('Die Länge eines L-Winkels muss größer als 0 mm sein.')
  }
  const [outer, ...holes] = getUkAngleProfileContours(profile, mirrored)
  if (!outer || outer.points.length < 3) {
    throw new Error('Die L-Winkel-DXF enthält keine gültige Außenkontur.')
  }
  const shape = new THREE.Shape()
  outer.points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y)
    else shape.lineTo(point.x, point.y)
  })
  shape.closePath()
  for (const contour of holes) {
    const hole = new THREE.Path()
    contour.points.forEach((point, index) => {
      if (index === 0) hole.moveTo(point.x, point.y)
      else hole.lineTo(point.x, point.y)
    })
    hole.closePath()
    shape.holes.push(hole)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false })
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
