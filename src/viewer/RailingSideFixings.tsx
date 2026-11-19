import { useEffect, useMemo } from 'react'
import { CylinderGeometry, DoubleSide, LatheGeometry, Quaternion, Vector2, Vector3 } from 'three'
import { sideFixingHeadInsetDistance, sideFixingNutOffset } from '../domain/railingProfile'
import type { ProfilePart } from '../domain/railingProfile'
import type { SlabPoint } from '../domain/concreteSlab'
import { SIDE_FIXING_AXIS_HEIGHT, SIDE_FIXING_BOLT_HEAD_DIAMETER, SIDE_FIXING_BOLT_HEAD_HEIGHT, SIDE_FIXING_BOLT_LENGTH, SIDE_FIXING_NUT_THICKNESS } from '../domain/railingMounting'
import { RAILING_COLORS } from '../domain/railingAppearance'

export function RailingSideFixings({ parts, points, thickness }: { parts: ProfilePart[]; points: SlabPoint[]; thickness: number }) {
  const scale = useMemo(() => Math.max(
    Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
    Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)),
    thickness,
  ), [points, thickness])
  const centerX = useMemo(() => (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2, [points])
  const centerY = useMemo(() => (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2, [points])
  const fixings = useMemo(() => parts.flatMap((part) => {
    const headInsetDistance = sideFixingHeadInsetDistance(part.section)
    const nutOffset = sideFixingNutOffset(part.section)
    const normal = { x: part.direction.y, y: -part.direction.x }
    return part.holes.map((hole) => ({
      position: [
        (hole.x - normal.x * headInsetDistance - centerX) / scale,
        SIDE_FIXING_AXIS_HEIGHT / scale,
        (hole.y - normal.y * headInsetDistance - centerY) / scale,
      ] as [number, number, number],
      nutOffset,
      orientation: new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(normal.x, 0, normal.y),
      ),
    }))
  }), [parts, centerX, centerY, scale])
  const head = useMemo(() => {
    const radius = SIDE_FIXING_BOLT_HEAD_DIAMETER / 2 / scale
    const height = SIDE_FIXING_BOLT_HEAD_HEIGHT / scale
    const sphereRadius = (radius * radius + height * height) / (2 * height)
    const sphereCenter = sphereRadius - height
    const points = Array.from({ length: 17 }, (_, index) => {
      const y = -height + height * index / 16
      return new Vector2(Math.sqrt(Math.max(0, sphereRadius * sphereRadius - (y - sphereCenter) ** 2)), y)
    })
    points.push(new Vector2(0, 0))
    return new LatheGeometry(points, 48)
  }, [scale])
  const bolt = useMemo(() => new CylinderGeometry(5 / scale, 5 / scale, SIDE_FIXING_BOLT_LENGTH / scale, 24), [scale])
  const nut = useMemo(() => new CylinderGeometry(8.5 / scale, 8.5 / scale, SIDE_FIXING_NUT_THICKNESS / scale, 6), [scale])
  useEffect(() => () => { head.dispose(); bolt.dispose(); nut.dispose() }, [head, bolt, nut])

  return <group name="Torbandschrauben">
    {fixings.map((fixing, index) => <group key={index} position={fixing.position} quaternion={fixing.orientation}>
      <mesh geometry={head}>
          <meshStandardMaterial color={RAILING_COLORS.screw} metalness={0.75} roughness={0.38} side={DoubleSide} />
      </mesh>
      <mesh geometry={bolt} position={[0, SIDE_FIXING_BOLT_LENGTH / 2 / scale, 0]}>
        <meshStandardMaterial color={RAILING_COLORS.screw} metalness={0.75} roughness={0.38} />
      </mesh>
      <mesh geometry={nut} position={[0, (fixing.nutOffset + SIDE_FIXING_NUT_THICKNESS / 2) / scale, 0]}>
        <meshStandardMaterial color={RAILING_COLORS.screw} metalness={0.75} roughness={0.38} />
      </mesh>
    </group>)}
  </group>
}
