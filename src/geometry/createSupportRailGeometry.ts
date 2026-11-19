import * as THREE from 'three'
import { getSupportRailCorner } from '../domain/supportRail'
import type { SupportRailPiece, SupportRailProfile } from '../domain/types'

// Koordinaten: X = Fassadenbreite, Y = Tiefe (CAD, zur Mauer positiv), Z = Höhe.
export function createSupportRailGeometry(
  profile: SupportRailProfile,
  piece: SupportRailPiece,
  rearDepth: number,
): THREE.BufferGeometry {
  const [outer] = profile.contours
  if (!outer || outer.points.length < 3) {
    throw new Error('Die Auflager-Schienen-DXF enthält keine gültige Außenkontur.')
  }
  const section = outer.points
  const orientation = Math.sign(outer.area) || 1
  const startRing = section.map((point) => {
    const corner = getSupportRailCorner(piece, 'start', point.y - profile.supportHeight)
    return new THREE.Vector3(corner.x, rearDepth - point.x, corner.y)
  })
  const endRing = section.map((point) => {
    const corner = getSupportRailCorner(piece, 'end', point.y - profile.supportHeight)
    return new THREE.Vector3(corner.x, rearDepth - point.x, corner.y)
  })
  const axis = new THREE.Vector3(piece.direction.x, 0, piece.direction.y)
  const up = new THREE.Vector3(piece.normal.x, 0, piece.normal.y)
  const positions: number[] = []

  const addTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, outward: THREE.Vector3) => {
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
    const [first, second] = normal.dot(outward) >= 0 ? [b, c] : [c, b]
    positions.push(a.x, a.y, a.z, first.x, first.y, first.z, second.x, second.y, second.z)
  }

  const capTriangles = THREE.ShapeUtils.triangulateShape(
    section.map((point) => new THREE.Vector2(point.x, point.y)),
    [],
  )
  for (const [i, j, k] of capTriangles) {
    addTriangle(startRing[i], startRing[j], startRing[k], axis.clone().negate())
    addTriangle(endRing[i], endRing[j], endRing[k], axis)
  }

  for (let index = 0; index < section.length; index += 1) {
    const next = (index + 1) % section.length
    const du = section[next].x - section[index].x
    const dv = section[next].y - section[index].y
    const outward2D = orientation > 0 ? { u: dv, v: -du } : { u: -dv, v: du }
    const outward = new THREE.Vector3(0, -outward2D.u, 0).addScaledVector(up, outward2D.v)
    addTriangle(startRing[index], startRing[next], endRing[next], outward)
    addTriangle(startRing[index], endRing[next], endRing[index], outward)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
