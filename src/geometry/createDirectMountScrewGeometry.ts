import * as THREE from 'three'
import {
  DIRECT_MOUNT_SCREW_HEAD_DIAMETER_MM,
  DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM,
  DIRECT_MOUNT_SCREW_SHAFT_DIAMETER_MM,
  DIRECT_MOUNT_SCREW_SHAFT_LENGTH_MM,
} from '../domain/directMountScrew'

export function createDirectMountScrewGeometry(): THREE.BufferGeometry {
  const head = new THREE.CylinderGeometry(
    DIRECT_MOUNT_SCREW_HEAD_DIAMETER_MM / 2,
    DIRECT_MOUNT_SCREW_HEAD_DIAMETER_MM / 2,
    DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM,
    48,
  )
  const shaft = new THREE.CylinderGeometry(
    DIRECT_MOUNT_SCREW_SHAFT_DIAMETER_MM / 2,
    DIRECT_MOUNT_SCREW_SHAFT_DIAMETER_MM / 2,
    DIRECT_MOUNT_SCREW_SHAFT_LENGTH_MM,
    48,
  )
  head.translate(0, -DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM / 2, 0)
  shaft.translate(
    0,
    -(DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM + DIRECT_MOUNT_SCREW_SHAFT_LENGTH_MM / 2),
    0,
  )
  head.rotateX(Math.PI / 2)
  shaft.rotateX(Math.PI / 2)

  const nonIndexedHead = head.toNonIndexed()
  const nonIndexedShaft = shaft.toNonIndexed()
  const headPositions = nonIndexedHead.getAttribute('position')
  const shaftPositions = nonIndexedShaft.getAttribute('position')
  const positions = new Float32Array(headPositions.count * 3 + shaftPositions.count * 3)
  positions.set(headPositions.array)
  positions.set(shaftPositions.array, headPositions.count * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  head.dispose()
  shaft.dispose()
  nonIndexedHead.dispose()
  nonIndexedShaft.dispose()
  return geometry
}
