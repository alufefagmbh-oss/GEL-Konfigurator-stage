import { useEffect, useMemo } from 'react'
import { BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, LatheGeometry, Quaternion, ShapeUtils, Vector2, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { COUNTERSINK_RADIUS, HOLE_CUTTER_TOP, HOLE_RADIUS, PROFILE_FLOOR_HEIGHT, profilePoint, sideFixingWallBounds } from '../domain/railingProfile'
import type { ProfilePart } from '../domain/railingProfile'
import type { SlabPoint } from '../domain/concreteSlab'
import { RailingScrews } from './RailingScrews'
import { BodyEdges, FineEdges } from './BodyEdges'
import type { RailingAccessoryLayout } from '../domain/railingAccessories'
import type { GlassPanel } from '../domain/railingAccessories'
import { RAILING_COLORS, RAILING_GLASS_OPACITY } from '../domain/railingAppearance'
import { SIDE_FIXING_AXIS_HEIGHT, SIDE_FIXING_HOLE_DIAMETER, type RailingMounting } from '../domain/railingMounting'
import { RailingSideFixings } from './RailingSideFixings'

export function createRailingProfileGeometry(
  part: ProfilePart,
  points: SlabPoint[],
  thickness: number,
  mounting: RailingMounting = '7B',
  baseY = thickness / 2,
): BufferGeometry {
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))
    const scale = Math.max(maxX - minX, maxY - minY, thickness)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const coordinates: number[] = []
    const vertex = (point: SlabPoint, end: boolean) => {
      const location = profilePoint(part, point, end)
      return [(location.x - centerX) / scale, (baseY + point.y) / scale, (location.y - centerY) / scale]
    }
    const triangle = (a: number[], b: number[], c: number[]) => coordinates.push(...a, ...b, ...c)
    const section = part.section
    const caps = ShapeUtils.triangulateShape(section.map((point) => new Vector2(point.x, point.y)), [])
    for (const [a, b, c] of caps) {
      triangle(vertex(section[a], false), vertex(section[b], false), vertex(section[c], false))
      triangle(vertex(section[c], true), vertex(section[b], true), vertex(section[a], true))
    }
    for (let i = 0; i < section.length; i++) {
      const a = section[i]
      const b = section[(i + 1) % section.length]
      const a0 = vertex(a, false)
      const b0 = vertex(b, false)
      const a1 = vertex(a, true)
      const b1 = vertex(b, true)
      triangle(a0, b0, b1)
      triangle(a0, b1, a1)
    }
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(coordinates, 3))
    result.computeVertexNormals()
    if (part.holes.length === 0) return result
    if (mounting === '7A') {
      const width = Math.max(...section.map((point) => point.x))
      const wall = sideFixingWallBounds(section)
      const wallCenter = (wall.inner + wall.outer) / 2
      const wallThickness = wall.outer - wall.inner
      const normal = new Vector3(part.direction.y, 0, -part.direction.x)
      const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal)
      const cutters = part.holes.map((hole) => {
        const cutter = new CylinderGeometry(
          SIDE_FIXING_HOLE_DIAMETER / 2 / scale,
          SIDE_FIXING_HOLE_DIAMETER / 2 / scale,
          (wallThickness + 2) / scale,
          24,
        )
        cutter.applyQuaternion(orientation)
        cutter.translate(
          (hole.x + normal.x * (wallCenter - width) - centerX) / scale,
          (baseY + SIDE_FIXING_AXIS_HEIGHT) / scale,
          (hole.y + normal.z * (wallCenter - width) - centerY) / scale,
        )
        return cutter
      })
      const merged = mergeGeometries(cutters)
      cutters.forEach((cutter) => cutter.dispose())
      if (!merged) {
        result.dispose()
        throw new Error('Die seitlichen Profilbohrungen konnten nicht vorbereitet werden.')
      }
      const profileBrush = new Brush(result)
      const cutterBrush = new Brush(merged)
      profileBrush.updateMatrixWorld(true)
      cutterBrush.updateMatrixWorld(true)
      try {
        const evaluator = new Evaluator()
        evaluator.useGroups = false
        evaluator.attributes = ['position', 'normal']
        const perforated = evaluator.evaluate(profileBrush, cutterBrush, SUBTRACTION)
        perforated.disposeCacheData()
        perforated.geometry.computeVertexNormals()
        return perforated.geometry
      } finally {
        profileBrush.disposeCacheData()
        cutterBrush.disposeCacheData()
        result.dispose()
        merged.dispose()
      }
    }
    const sinkBottom = PROFILE_FLOOR_HEIGHT - (COUNTERSINK_RADIUS - HOLE_RADIUS)
    const cutters = part.holes.map((hole) => {
      const cutter = new LatheGeometry([
        new Vector2(0, -1 / scale),
        new Vector2(HOLE_RADIUS / scale, -1 / scale),
        new Vector2(HOLE_RADIUS / scale, sinkBottom / scale),
        new Vector2((COUNTERSINK_RADIUS + 1) / scale, HOLE_CUTTER_TOP / scale),
        new Vector2(0, HOLE_CUTTER_TOP / scale),
      ], 24)
      cutter.translate((hole.x - centerX) / scale, thickness / 2 / scale, (hole.y - centerY) / scale)
      const nonIndexed = cutter.toNonIndexed()
      cutter.dispose()
      return nonIndexed
    })
    const merged = mergeGeometries(cutters)
    cutters.forEach((cutter) => cutter.dispose())
    if (!merged) {
      result.dispose()
      throw new Error('Die Bohrungsgeometrie konnte nicht erzeugt werden.')
    }
    const profileBrush = new Brush(result)
    const cutterBrush = new Brush(merged)
    profileBrush.updateMatrixWorld(true)
    cutterBrush.updateMatrixWorld(true)
    try {
      const evaluator = new Evaluator()
      evaluator.useGroups = false
      evaluator.attributes = ['position', 'normal']
      const perforated = evaluator.evaluate(profileBrush, cutterBrush, SUBTRACTION)
      perforated.disposeCacheData()
      perforated.geometry.computeVertexNormals()
      return perforated.geometry
    } finally {
      profileBrush.disposeCacheData()
      cutterBrush.disposeCacheData()
      result.dispose()
      merged.dispose()
    }
}

function ProfileMesh({ part, points, thickness, mounting = '7B', baseY = thickness / 2, color = RAILING_COLORS.aluminum }: {
  part: ProfilePart
  points: SlabPoint[]
  thickness: number
  mounting?: RailingMounting
  baseY?: number
  color?: string
}) {
  const geometry = useMemo(() => createRailingProfileGeometry(part, points, thickness, mounting, baseY), [part, points, thickness, mounting, baseY])
  const outlineGeometry = useMemo(() => createRailingProfileGeometry({ ...part, holes: [] }, points, thickness, mounting, baseY), [part, points, thickness, mounting, baseY])
  const holeEdges = useMemo(() => createProfileHoleEdges(part, points, thickness, mounting, baseY), [part, points, thickness, mounting, baseY])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => outlineGeometry.dispose(), [outlineGeometry])
  useEffect(() => () => holeEdges.dispose(), [holeEdges])
  return <group>
    <mesh geometry={geometry}><meshStandardMaterial color={color} metalness={0.25} roughness={0.72} side={DoubleSide} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} /></mesh>
    <BodyEdges geometry={outlineGeometry} />
    <FineEdges geometry={holeEdges} />
  </group>
}

export function createProfileHoleEdges(part: ProfilePart, points: SlabPoint[], thickness: number, mounting: RailingMounting = '7B', baseY = thickness / 2): BufferGeometry {
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const scale = Math.max(maxX - minX, maxY - minY, thickness)
  const coordinates: number[] = []
  if (part.holes.length === 0) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(coordinates, 3))
    return geometry
  }
  if (mounting === '7A') {
    const width = Math.max(...part.section.map((point) => point.x))
    const wall = sideFixingWallBounds(part.section)
    const normal = { x: part.direction.y, y: -part.direction.x }
    for (const hole of part.holes) {
      for (let i = 0; i < 24; i++) {
        for (const angle of [i * Math.PI / 12, (i + 1) * Math.PI / 12]) {
          const along = SIDE_FIXING_HOLE_DIAMETER / 2 * Math.cos(angle)
          const vertical = SIDE_FIXING_HOLE_DIAMETER / 2 * Math.sin(angle)
          const center = {
            x: hole.x + normal.x * (wall.outer - width + 0.02),
            y: hole.y + normal.y * (wall.outer - width + 0.02),
          }
          coordinates.push(
            (center.x + part.direction.x * along - (minX + maxX) / 2) / scale,
            (baseY + SIDE_FIXING_AXIS_HEIGHT + vertical) / scale,
            (center.y + part.direction.y * along - (minY + maxY) / 2) / scale,
          )
        }
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(coordinates, 3))
    return geometry
  }
  for (const hole of part.holes) {
    for (const [radius, height] of [[COUNTERSINK_RADIUS, PROFILE_FLOOR_HEIGHT]]) {
      for (let i = 0; i < 24; i++) {
        for (const angle of [i * Math.PI / 12, (i + 1) * Math.PI / 12]) {
          coordinates.push(
            (hole.x + radius * Math.cos(angle) - (minX + maxX) / 2) / scale,
            (thickness / 2 + height) / scale,
            (hole.y + radius * Math.sin(angle) - (minY + maxY) / 2) / scale,
          )
        }
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(coordinates, 3))
  return geometry
}

function GlassPaneMesh({ panel, points, thickness, baseY }: { panel: GlassPanel; points: SlabPoint[]; thickness: number; baseY: number }) {
  const geometry = useMemo(() => {
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))
    const scale = Math.max(maxX - minX, maxY - minY, thickness)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const corner = (x: number, y: number, end: boolean): [number, number, number] => {
      const location = profilePoint(panel.path, { x, y: 0 }, end)
      return [(location.x - centerX) / scale, (baseY + y) / scale, (location.y - centerY) / scale]
    }
    const low = panel.bottom
    const high = panel.top
    const x0 = panel.center - panel.thickness / 2
    const x1 = panel.center + panel.thickness / 2
    const vertices = [
      corner(x0, low, false), corner(x1, low, false), corner(x1, low, true), corner(x0, low, true),
      corner(x0, high, false), corner(x1, high, false), corner(x1, high, true), corner(x0, high, true),
    ]
    const faces = [
      [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3],
      [1, 2, 6, 5], [0, 3, 2, 1], [4, 5, 6, 7],
    ]
    const coordinates: number[] = []
    for (const [a, b, c, d] of faces) coordinates.push(...vertices[a], ...vertices[b], ...vertices[c], ...vertices[a], ...vertices[c], ...vertices[d])
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(coordinates, 3))
    result.computeVertexNormals()
    return result
  }, [panel, points, thickness, baseY])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry}><meshStandardMaterial color={RAILING_COLORS.glass} transparent opacity={RAILING_GLASS_OPACITY} roughness={0.15} metalness={0.02} side={DoubleSide} depthWrite={false} /></mesh>
}

export function RailingProfiles({ parts, accessories, glassPanels, points, thickness, mounting = '7B', showProfiles, showSealLips, showClampWedges, showGlassShoes, showScrews, showGlass }: {
  parts: ProfilePart[]
  accessories: RailingAccessoryLayout
  glassPanels: GlassPanel[]
  points: SlabPoint[]
  thickness: number
  mounting?: RailingMounting
  showProfiles: boolean
  showSealLips: boolean
  showClampWedges: boolean
  showGlassShoes: boolean
  showScrews: boolean
  showGlass: boolean
}) {
  const profileBaseY = mounting === '7A' ? 0 : thickness / 2
  return <group>
    <group name="Gelaenderschuh" visible={showProfiles}>
      {parts.map((part, index) => <ProfileMesh key={index} part={part} points={points} thickness={thickness} mounting={mounting} baseY={profileBaseY} />)}
    </group>
    <group name="Dichtlippen" visible={showSealLips}>
      {accessories.sealLips.map((part, index) => <ProfileMesh key={index} part={part} points={points} thickness={thickness} mounting={mounting} baseY={profileBaseY} color={RAILING_COLORS.sealLip} />)}
    </group>
    <group name="Klemmleisten" visible={showClampWedges}>
      {accessories.clampWedges.map((part, index) => <ProfileMesh key={index} part={part} points={points} thickness={thickness} mounting={mounting} baseY={profileBaseY} color={RAILING_COLORS.clampWedge} />)}
    </group>
    <group name="Glasschuh" visible={showGlassShoes}>
      {accessories.glassShoes.map((part, index) => <ProfileMesh key={index} part={part} points={points} thickness={thickness} mounting={mounting} baseY={profileBaseY} color={RAILING_COLORS.glassShoe} />)}
    </group>
    <group name="Glas" visible={showGlass}>{glassPanels.map((panel, index) => <GlassPaneMesh key={index} panel={panel} points={points} thickness={thickness} baseY={profileBaseY} />)}</group>
    <group name="Schrauben" visible={showScrews}>
      {mounting === '7A'
        ? <RailingSideFixings parts={parts} points={points} thickness={thickness} />
        : <RailingScrews parts={parts} points={points} thickness={thickness} />}
    </group>
  </group>
}
