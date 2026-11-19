import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, LatheGeometry, Matrix4, Vector2, Vector3 } from 'three'
import type { SlabPoint } from '../domain/concreteSlab'
import { COUNTERSINK_RADIUS } from '../domain/railingProfile'
import { RAILING_SCREW_HEAD_HEIGHT, RAILING_SCREW_LENGTH, RAILING_SCREW_RADIUS, railingScrewPlacements } from '../domain/railingScrew'
import type { ProfilePart } from '../domain/railingProfile'
import { FineEdges } from './BodyEdges'
import { RAILING_COLORS } from '../domain/railingAppearance'

export function createRailingScrewGeometry(): LatheGeometry {
  return new LatheGeometry([
    new Vector2(0, -RAILING_SCREW_LENGTH),
    new Vector2(RAILING_SCREW_RADIUS, -RAILING_SCREW_LENGTH),
    new Vector2(RAILING_SCREW_RADIUS, -RAILING_SCREW_HEAD_HEIGHT),
    new Vector2(COUNTERSINK_RADIUS, 0),
    new Vector2(0, 0),
  ], 24)
}

export function railingScrewMatrices(parts: ProfilePart[], points: SlabPoint[], thickness: number): Matrix4[] {
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const scale = Math.max(maxX - minX, maxY - minY, thickness)
  return railingScrewPlacements(parts, thickness).map((screw) => new Matrix4()
    .makeTranslation(
      (screw.x - (minX + maxX) / 2) / scale,
      (screw.headHeight - thickness / 2) / scale,
      (screw.y - (minY + maxY) / 2) / scale,
    )
    .scale(new Vector3(1 / scale, 1 / scale, 1 / scale)))
}

export function createScrewEdges(matrices: Matrix4[]): BufferGeometry {
  const vertices: number[] = []
  const point = new Vector3()
  for (const matrix of matrices) {
    for (const [radius, height] of [
      [COUNTERSINK_RADIUS, 0],
      [RAILING_SCREW_RADIUS, -RAILING_SCREW_HEAD_HEIGHT],
      [RAILING_SCREW_RADIUS, -RAILING_SCREW_LENGTH],
    ]) {
      for (let i = 0; i < 24; i++) {
        for (const angle of [i * Math.PI / 12, (i + 1) * Math.PI / 12]) {
          point.set(radius * Math.cos(angle), height, radius * Math.sin(angle)).applyMatrix4(matrix)
          vertices.push(point.x, point.y, point.z)
        }
      }
    }
  }
  const edges = new BufferGeometry()
  edges.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  return edges
}

export function RailingScrews({ parts, points, thickness }: { parts: ProfilePart[]; points: SlabPoint[]; thickness: number }) {
  const mesh = useRef<InstancedMesh>(null)
  const geometry = useMemo(createRailingScrewGeometry, [])
  const matrices = useMemo(() => railingScrewMatrices(parts, points, thickness), [parts, points, thickness])
  const edges = useMemo(() => createScrewEdges(matrices), [matrices])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => edges.dispose(), [edges])
  useLayoutEffect(() => {
    const instances = mesh.current
    if (!instances) return
    matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix))
    instances.instanceMatrix.needsUpdate = true
    instances.computeBoundingSphere()
  }, [matrices])

  if (matrices.length === 0) return null
  return <group>
    <instancedMesh key={matrices.length} ref={mesh} args={[geometry, undefined, matrices.length]}>
      <meshStandardMaterial color={RAILING_COLORS.screw} roughness={0.65} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </instancedMesh>
    <FineEdges geometry={edges} />
  </group>
}
