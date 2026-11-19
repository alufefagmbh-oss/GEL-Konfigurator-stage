import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import type { UkRailProfile } from '../domain/types'

export function createUkRailGeometry(
  profile: UkRailProfile,
  length: number,
  holes: { distanceFromStart: number; diameter: number }[] = [],
): THREE.BufferGeometry {
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error('Die Länge eines UK-Schienenstücks muss größer als 0 mm sein.')
  }
  const [outer, ...profileHoles] = profile.contours
  if (!outer || outer.points.length < 3) {
    throw new Error('Die UK-Schienen-DXF enthält keine gültige Außenkontur.')
  }

  const shape = new THREE.Shape()
  outer.points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y)
    else shape.lineTo(point.x, point.y)
  })
  shape.closePath()
  for (const contour of profileHoles) {
    const hole = new THREE.Path()
    contour.points.forEach((point, index) => {
      if (index === 0) hole.moveTo(point.x, point.y)
      else hole.lineTo(point.x, point.y)
    })
    hole.closePath()
    shape.holes.push(hole)
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
  })
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  if (holes.length === 0) return geometry

  const evaluator = new Evaluator()
  evaluator.useGroups = false
  evaluator.attributes = ['position', 'normal']
  let currentBrush = new Brush(geometry)
  let currentGeometry: THREE.BufferGeometry = geometry
  currentBrush.updateMatrixWorld(true)
  try {
    for (const { distanceFromStart, diameter } of holes) {
      if (!Number.isFinite(distanceFromStart) || distanceFromStart < 0 || distanceFromStart > length
        || !Number.isFinite(diameter) || diameter <= 0) {
        throw new Error('Die Bohrungsposition oder der Durchmesser ist für die UK-Schiene ungültig.')
      }

      const cutterGeometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, profile.depth + 2, 32)
      cutterGeometry.rotateX(Math.PI / 2)
      const cutter = new Brush(cutterGeometry)
      cutter.position.set(distanceFromStart, 0, -profile.depth / 2)
      cutter.updateMatrixWorld(true)

      let result: Brush
      try {
        result = evaluator.evaluate(currentBrush, cutter, SUBTRACTION)
      } catch (error) {
        cutter.disposeCacheData()
        cutterGeometry.dispose()
        throw error
      }
      currentBrush.disposeCacheData()
      if (currentGeometry !== geometry) currentGeometry.dispose()
      cutter.disposeCacheData()
      cutterGeometry.dispose()
      currentBrush = result
      currentGeometry = result.geometry
    }
    const perforatedGeometry = currentBrush.geometry
    perforatedGeometry.computeVertexNormals()
    perforatedGeometry.computeBoundingBox()
    perforatedGeometry.computeBoundingSphere()
    currentBrush.disposeCacheData()
    return perforatedGeometry
  } catch (error) {
    currentBrush.disposeCacheData()
    if (currentGeometry !== geometry) currentGeometry.dispose()
    geometry.dispose()
    throw error
  }
}
