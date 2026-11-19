import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { Eye, EyeOff, Grid3X3, RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import type { CameraProjection, FacadeConfiguration, MasonryViewConfiguration, ProfileDisplayMode, ProfilePlacement, SupportRailPiece, SupportRailProfile, UkAngleConnectorPlacement, UkAnglePlacement, UkAngleProfile, UkRailFixingPlacement, UkRailPlacement, UkRailProfile, WallContour } from '../domain/types'
import { getFacadeProfileDepth, getProfileFrontEdgeY } from '../domain/profileCoordinates'
import { getWallVerticalBounds } from '../domain/wallContour'
import { DEFAULT_MASONRY_VIEW, getFloorWidth } from '../domain/masonryView'
import { DEFAULT_UK_RAIL_VIEW } from '../domain/ukRailView'
import { UK_RAIL_PROFILE_CLEARANCE } from '../domain/ukRail'
import { FLOOR_PATTERN_MATERIALS, getFloorMaterialColor } from '../domain/floorMaterials'
import { getGridColors } from '../domain/viewerAppearance'
import { getProfileInfoColor, UK_CONNECTOR_FACADE_COLOR, UK_INFO_COLORS } from '../domain/viewerColorScheme'
import { getSpidiConnectorTransforms } from '../domain/spidiConnector'
import { createProfileGeometry } from '../geometry/createProfileGeometry'
import { createUkRailGeometry } from '../geometry/createUkRailGeometry'
import { createUkAngleGeometry } from '../geometry/createUkAngleGeometry'
import { createSupportRailGeometry } from '../geometry/createSupportRailGeometry'
import { createPlasticBlockGeometry } from '../geometry/createPlasticBlockGeometry'
import { createSquareTimberGeometry } from '../geometry/createSquareTimberGeometry'
import type { SquareTimberPlacement } from '../domain/types'
import { createDirectMountScrewGeometry } from '../geometry/createDirectMountScrewGeometry'
import { getUkRailMountingMethod, getUkPlasticBlockDepth, getUkRailHoleDiameter } from '../domain/ukMounting'
import { DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM } from '../domain/directMountScrew'
import type { SpidiConnectorMeshData } from '../cad/spidiConnectorMesh'

const SPACING_TOLERANCE = 1e-7
const PROFILE_EDGE_COLOR = '#555555'
const UK_ALUMINUM_COLOR = '#B8BEC1'

function ProfileInstances({
  configuration,
  spacingDeviations,
  profileDisplayMode,
  wallContour,
  placements,
  endGap,
}: {
  configuration: FacadeConfiguration
  spacingDeviations: number[]
  profileDisplayMode: ProfileDisplayMode
  wallContour: WallContour | null
  placements: ProfilePlacement[]
  endGap: number
}) {
  const facadeFrontEdgeY = getProfileFrontEdgeY(configuration.profile)
  const baseGeometry = useMemo(
    () => createProfileGeometry(configuration.profile, configuration.height, undefined, undefined, endGap),
    [configuration.profile, configuration.height, endGap],
  )
  const profileGeometries = useMemo(() => placements.map((placement) => {
    const hasEndTrim = placement.leftTrimX !== undefined || placement.rightTrimX !== undefined
    if (!wallContour && !hasEndTrim && placement.profile === configuration.profile) return baseGeometry
    return createProfileGeometry(
      placement.profile,
      configuration.height,
      wallContour
        ? { contour: wallContour, axisX: placement.axisX + (placement.profileOffsetX ?? 0) }
        : undefined,
      hasEndTrim ? { leftX: placement.leftTrimX, rightX: placement.rightTrimX } : undefined,
      endGap,
    )
  }), [baseGeometry, configuration.height, configuration.profile, endGap, placements, wallContour])
  const edgeGeometry = useMemo(() => {
    const vertices: number[] = []
    profileGeometries.forEach((profileGeometry, index) => {
      profileGeometry.computeBoundingBox()
      const bounds = profileGeometry.boundingBox
      if (!bounds) return

      const center = bounds.getCenter(new THREE.Vector3())
      const edges = new THREE.EdgesGeometry(profileGeometry, 1)
      const edgePositions = edges.getAttribute('position')
      const placement = placements[index]
      const axisX = placement.axisX + (placement.profileOffsetX ?? 0)
      const depthTranslation = facadeFrontEdgeY
        - getProfileFrontEdgeY(placement.profile)
        + (placement.depthOffset ?? 0)
      for (let vertex = 0; vertex < edgePositions.count; vertex += 1) {
        const point = new THREE.Vector3(
          edgePositions.getX(vertex),
          edgePositions.getY(vertex),
          edgePositions.getZ(vertex),
        )
        const outward = point.clone().sub(center)
        if (outward.lengthSq() > 0) point.add(outward.normalize().multiplyScalar(0.08))
        vertices.push(point.x + axisX, point.y, point.z - depthTranslation)
      }
      edges.dispose()
    })

    const combined = new THREE.BufferGeometry()
    combined.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    combined.computeBoundingSphere()
    return combined
  }, [facadeFrontEdgeY, placements, profileGeometries])
  const profileColor = useMemo(
    () => new THREE.Color(configuration.profileColor),
    [configuration.profileColor],
  )

  useEffect(() => () => {
    baseGeometry.dispose()
  }, [baseGeometry])
  useEffect(() => () => {
    new Set(profileGeometries).forEach((profileGeometry) => {
      if (profileGeometry !== baseGeometry) profileGeometry.dispose()
    })
  }, [baseGeometry, profileGeometries])
  useEffect(() => () => edgeGeometry.dispose(), [edgeGeometry])

  function getPlacementColor(placement: ProfilePlacement): THREE.Color {
    const deviation = spacingDeviations[placement.layoutIndex - 1] ?? 0
    return profileDisplayMode === 'facadeColor'
      ? profileColor
      : new THREE.Color(getProfileInfoColor(deviation, placement.isSwitchProfile))
  }

  return (
    <group>
      {placements.map((placement, index) => (
        <mesh
          key={`${placement.profile.id ?? placement.profile.name}-${placement.axisX}-${index}`}
          geometry={profileGeometries[index]}
          position={[
            placement.axisX + (placement.profileOffsetX ?? 0),
            0,
            -(facadeFrontEdgeY - getProfileFrontEdgeY(placement.profile) + (placement.depthOffset ?? 0)),
          ]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial attach="material-0" color={getPlacementColor(placement)} metalness={0.12} roughness={0.48} />
          <meshStandardMaterial attach="material-1" color={getPlacementColor(placement).clone().multiplyScalar(0.65)} metalness={0.05} roughness={0.72} />
        </mesh>
      ))}
      <lineSegments geometry={edgeGeometry} renderOrder={1}>
        <lineBasicMaterial color={PROFILE_EDGE_COLOR} transparent opacity={0.72} depthWrite={false} />
      </lineSegments>
    </group>
  )
}

function UkRailInstances({
  configuration,
  profile,
  placements,
  angleProfile,
  anglePlacements,
  connectorPlacements,
  connectorMesh,
  connectorWallOffset,
  fixings,
  facadeDepth,
  facadeFrontEdgeY,
  profileDisplayMode,
  showRails,
  showBlocks,
  showScrews,
  showAngles,
  showConnectors,
  supportRailProfile,
  supportRailPieces,
  showSupportRail,
  squareTimbers,
}: {
  configuration: FacadeConfiguration
  profile: UkRailProfile | null
  placements: UkRailPlacement[]
  angleProfile: UkAngleProfile | null
  anglePlacements: UkAnglePlacement[]
  connectorPlacements: UkAngleConnectorPlacement[]
  connectorMesh: SpidiConnectorMeshData | null
  connectorWallOffset: number
  fixings: UkRailFixingPlacement[]
  facadeDepth: number
  facadeFrontEdgeY: number
  profileDisplayMode: ProfileDisplayMode
  showRails: boolean
  showBlocks: boolean
  showScrews: boolean
  showAngles: boolean
  showConnectors: boolean
  supportRailProfile: SupportRailProfile | null
  supportRailPieces: SupportRailPiece[]
  showSupportRail: boolean
  squareTimbers: SquareTimberPlacement[]
}) {
  const mountingMethod = getUkRailMountingMethod(configuration)
  const supportRailRearDepth = profile ? facadeDepth + UK_RAIL_PROFILE_CLEARANCE + profile.depth : 0
  const supportRailGeometries = useMemo(
    () => supportRailProfile
      ? supportRailPieces.map((piece) => createSupportRailGeometry(supportRailProfile, piece, supportRailRearDepth))
      : [],
    [supportRailPieces, supportRailProfile, supportRailRearDepth],
  )
  useEffect(() => () => supportRailGeometries.forEach((geometry) => geometry.dispose()), [supportRailGeometries])
  const geometries = useMemo(
    () => profile ? placements.map((placement) => createUkRailGeometry(
      profile,
      placement.endX - placement.startX,
      mountingMethod === 'direct-to-wall'
        ? fixings
          .filter((fixing) => Math.abs(fixing.centerHeight - placement.centerHeight) < 1e-6
            && fixing.x >= placement.startX - 1e-6
            && fixing.x <= placement.endX + 1e-6)
          .map((fixing) => ({
            distanceFromStart: fixing.x - placement.startX,
            diameter: getUkRailHoleDiameter(configuration),
          }))
        : [],
    )) : [],
    [configuration, fixings, mountingMethod, placements, profile],
  )
  const angleGeometries = useMemo(
    () => angleProfile ? anglePlacements.map((placement) => createUkAngleGeometry(
      angleProfile,
      placement.endHeight - placement.startHeight,
      placement.mirrored,
    )) : [],
    [anglePlacements, angleProfile],
  )
  const connectorGeometry = useMemo(() => {
    if (!connectorMesh) return null
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(connectorMesh.positions, 3))
    geometry.computeVertexNormals()
    return geometry
  }, [connectorMesh])
  const connectorMatrices = useMemo(() => {
    if (!connectorMesh) return []
    return connectorPlacements.map((placement) => new THREE.Matrix4().set(
      ...getSpidiConnectorTransforms(
        placement,
        connectorMesh.bounds,
        connectorWallOffset,
        configuration.width,
        configuration.height,
        facadeFrontEdgeY,
      ).viewer,
    ))
  }, [configuration.height, configuration.width, connectorMesh, connectorPlacements, connectorWallOffset, facadeFrontEdgeY])
  const blockDepth = profile ? getUkPlasticBlockDepth(configuration, profile, facadeDepth) : 0
  const blockGeometry = useMemo(() => {
    return blockDepth > 0
      ? createPlasticBlockGeometry(blockDepth, getUkRailHoleDiameter(configuration) + 2)
      : null
  }, [blockDepth, configuration])
  const timberMode = squareTimbers.length > 0
  const timberGeometries = useMemo(
    () => squareTimbers.map((timber) => createSquareTimberGeometry(timber, getUkRailHoleDiameter(configuration) + 2)),
    [configuration, squareTimbers],
  )
  useEffect(() => () => timberGeometries.forEach((geometry) => geometry.dispose()), [timberGeometries])
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries])
  useEffect(() => () => angleGeometries.forEach((geometry) => geometry.dispose()), [angleGeometries])
  useEffect(() => () => blockGeometry?.dispose(), [blockGeometry])
  useEffect(() => () => connectorGeometry?.dispose(), [connectorGeometry])
  if (!profile || !(configuration.ukRailView ?? DEFAULT_UK_RAIL_VIEW).enabled) return null

  const rearZ = -facadeFrontEdgeY - facadeDepth - UK_RAIL_PROFILE_CLEARANCE - profile.depth
  const aluminumMode = profileDisplayMode === 'facadeColor'

  return (
    <group>
      {showRails && placements.map((placement, index) => (
        <mesh
          key={`${placement.startX}-${placement.endX}-${placement.centerHeight}`}
          geometry={geometries[index]}
          position={[
            placement.startX - configuration.width / 2,
            placement.centerHeight - configuration.height / 2,
            -facadeFrontEdgeY - facadeDepth - UK_RAIL_PROFILE_CLEARANCE,
          ]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={aluminumMode ? UK_ALUMINUM_COLOR : UK_INFO_COLORS.rail}
            metalness={0.72}
            roughness={0.32}
          />
        </mesh>
      ))}
      {mountingMethod === 'direct-to-wall' && (showBlocks || showScrews) && fixings.map((fixing, index) => (
        <group
          key={`fixing-${fixing.x}-${fixing.centerHeight}-${index}`}
          position={[fixing.x - configuration.width / 2, fixing.centerHeight - configuration.height / 2, 0]}
        >
          {showScrews && (
            <DirectMountScrew
              facadeDepth={facadeDepth}
              facadeFrontEdgeY={facadeFrontEdgeY}
              profile={profile}
            />
          )}
          {showBlocks && blockGeometry && !timberMode && (
            <mesh geometry={blockGeometry} position={[0, 0, rearZ - blockDepth / 2]} castShadow>
              <meshStandardMaterial color={aluminumMode ? '#FFFFFF' : UK_INFO_COLORS.block} roughness={0.82} />
            </mesh>
          )}
        </group>
      ))}
      {mountingMethod === 'direct-to-wall' && showBlocks && squareTimbers.map((timber, index) => (
        <mesh
          key={`timber-${timber.x}`}
          geometry={timberGeometries[index]}
          position={[timber.x - configuration.width / 2, timber.bottom - configuration.height / 2, rearZ]}
          castShadow
        >
          <meshStandardMaterial color={UK_INFO_COLORS.timber} roughness={0.85} />
        </mesh>
      ))}
      {showAngles && mountingMethod === 'aluminum-substructure' && angleProfile && anglePlacements.map((placement, index) => (
        <mesh
          key={`angle-${placement.centerX}-${index}`}
          geometry={angleGeometries[index]}
          position={[
            placement.centerX - configuration.width / 2,
            placement.startHeight - configuration.height / 2,
            rearZ,
          ]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={aluminumMode ? UK_ALUMINUM_COLOR : UK_INFO_COLORS.angle}
            metalness={0.75}
            roughness={0.3}
          />
        </mesh>
      ))}
      {showConnectors && mountingMethod === 'aluminum-substructure' && connectorGeometry && connectorPlacements.map((placement, index) => (
        <mesh
          key={`wall-connector-${placement.centerX}-${placement.centerHeight}-${index}`}
          geometry={connectorGeometry}
          matrix={connectorMatrices[index]}
          matrixAutoUpdate={false}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={profileDisplayMode === 'facadeColor' ? UK_CONNECTOR_FACADE_COLOR : UK_INFO_COLORS.connector}
            metalness={0.62}
            roughness={0.38}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {showSupportRail && (
        <group
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-configuration.width / 2, -configuration.height / 2, -facadeFrontEdgeY]}
        >
          {supportRailGeometries.map((geometry, index) => (
            <mesh key={`support-rail-${index}`} geometry={geometry} castShadow receiveShadow>
              <meshStandardMaterial
                color={aluminumMode ? configuration.profileColor : UK_INFO_COLORS.rail}
                metalness={0.75}
                roughness={0.3}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}

function DirectMountScrew({
  facadeDepth,
  facadeFrontEdgeY,
  profile,
}: {
  facadeDepth: number
  facadeFrontEdgeY: number
  profile: UkRailProfile
}) {
  const screwGeometry = useMemo(() => createDirectMountScrewGeometry(), [])
  useEffect(() => () => screwGeometry.dispose(), [screwGeometry])

  const railFrontZ = -facadeFrontEdgeY - facadeDepth - UK_RAIL_PROFILE_CLEARANCE
  return (
    <mesh
      geometry={screwGeometry}
      position={[
        0,
        0,
        railFrontZ - profile.screwHeadPlaneDepth + DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM,
      ]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#FF0000" metalness={0.55} roughness={0.35} />
    </mesh>
  )
}

function WallReference({ contour, facadeOffset }: { contour: WallContour; facadeOffset: number }) {
  const surface = useMemo(() => {
    const shape = new THREE.Shape()
    contour.points.forEach((point, index) => {
      const x = point.x - contour.width / 2
      const y = point.y - contour.height / 2
      if (index === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    })
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }, [contour])

  useEffect(() => () => surface.dispose(), [surface])

  return (
    <group position={[0, 0, -facadeOffset + 0.5]}>
      <mesh geometry={surface}>
        <meshBasicMaterial color="#285598" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

function createFloorTexture(materialId: string): THREE.CanvasTexture | null {
  if (!FLOOR_PATTERN_MATERIALS.some((material) => material.id === materialId)) return null
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Die Bodentextur konnte nicht erstellt werden.')

  let seed = materialId.length * 7919
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  if (materialId === 'pattern:grass') {
    context.fillStyle = '#355d24'
    context.fillRect(0, 0, 128, 128)
    for (let index = 0; index < 700; index += 1) {
      const shade = random() > 0.5 ? '#c7ee62' : '#142d18'
      context.strokeStyle = shade
      context.lineWidth = 3 + random() * 3
      context.beginPath()
      const x = random() * 128
      const y = random() * 128
      context.moveTo(x, y)
      context.lineTo(x + (random() - 0.5) * 18, y - 10 - random() * 18)
      context.stroke()
    }
  } else if (materialId === 'pattern:gravel') {
    context.fillStyle = '#a19c91'
    context.fillRect(0, 0, 128, 128)
    for (let index = 0; index < 360; index += 1) {
      context.fillStyle = ['#56544e', '#e1dacb', '#77746b', '#f0e9da'][Math.floor(random() * 4)]
      context.beginPath()
      context.ellipse(random() * 128, random() * 128, 2 + random() * 5, 1.5 + random() * 4, random() * Math.PI, 0, Math.PI * 2)
      context.fill()
    }
  } else if (materialId === 'pattern:stone') {
    context.fillStyle = '#b1a99b'
    context.fillRect(0, 0, 128, 128)
    context.strokeStyle = '#514b42'
    context.lineWidth = 5
    for (let row = 0; row < 4; row += 1) {
      const offset = row % 2 === 0 ? 0 : -32
      for (let column = -1; column < 4; column += 1) {
        const x = column * 48 + offset
        const y = row * 32
        context.fillStyle = ['#d0c7b8', '#b5aa99', '#e0d7c8'][(row + column + 6) % 3]
        context.fillRect(x + 2, y + 2, 44, 28)
        context.strokeRect(x + 2, y + 2, 44, 28)
      }
    }
  } else {
    context.fillStyle = '#aaa9a3'
    context.fillRect(0, 0, 128, 128)
    const image = context.createImageData(128, 128)
    for (let index = 0; index < image.data.length; index += 4) {
      const shade = 105 + Math.floor(random() * 115)
      image.data[index] = shade
      image.data[index + 1] = shade
      image.data[index + 2] = Math.max(0, shade - 5)
      image.data[index + 3] = 150
    }
    context.putImageData(image, 0, 0)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  const repeat = materialId === 'pattern:stone' ? 1 : 3
  texture.repeat.set(repeat, repeat)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function MasonryPreview({
  width,
  height,
  facadeFrontZ,
  wallContour,
  options,
}: {
  width: number
  height: number
  facadeFrontZ: number
  wallContour: WallContour | null
  options: MasonryViewConfiguration
}) {
  const geometry = useMemo(() => {
    type BoxBounds = [number, number, number, number, number, number]
    const backZ = facadeFrontZ - options.facadeOffset - options.facadeDepth
    const topActive = options.topEnabled && options.topHeight > 0
    const sideActive = options.sideEnabled && options.sideWidth > 0
    const boxes: BoxBounds[] = [[
      -width / 2, width / 2, -height / 2, height / 2, backZ, backZ + options.facadeDepth,
    ]]
    const mainFrontZ = backZ + options.facadeDepth
    if (topActive) {
      const sideOverhang = sideActive ? options.sideWidth : 0
      boxes.push([
        -width / 2 - sideOverhang, width / 2 + sideOverhang,
        height / 2, height / 2 + options.topHeight,
        backZ, mainFrontZ + options.topDepth,
      ])
    }
    if (sideActive) {
      const sideFrontZ = mainFrontZ + options.sideDepth
      const sideTopY = height / 2 + (topActive ? options.topHeight : 0)
      boxes.push(
        [-width / 2 - options.sideWidth, -width / 2, -height / 2, sideTopY, backZ, sideFrontZ],
        [width / 2, width / 2 + options.sideWidth, -height / 2, sideTopY, backZ, sideFrontZ],
      )
    }
    if (options.bottomEnabled && options.bottomType === 'wall' && options.bottomWallHeight > 0) {
      const bottomWidth = getFloorWidth(width, options)
      const mainFrontZ = backZ + options.facadeDepth
      boxes.push([
        -bottomWidth / 2, bottomWidth / 2,
        -height / 2 - options.bottomWallHeight, -height / 2,
        backZ, mainFrontZ + options.bottomWallDepth,
      ])
    }
    const coordinates = [0, 1, 2].map((axis) => [...new Set(boxes.flatMap((box) => [box[axis * 2], box[axis * 2 + 1]]))].sort((a, b) => a - b))
    const [xs, ys, zs] = coordinates
    const occupied = new Set<string>()
    for (let x = 0; x < xs.length - 1; x += 1) {
      for (let y = 0; y < ys.length - 1; y += 1) {
        for (let z = 0; z < zs.length - 1; z += 1) {
          const centerX = (xs[x] + xs[x + 1]) / 2
          const centerY = (ys[y] + ys[y + 1]) / 2
          const centerZ = (zs[z] + zs[z + 1]) / 2
          if (boxes.some((box) => centerX > box[0] && centerX < box[1]
            && centerY > box[2] && centerY < box[3]
            && centerZ > box[4] && centerZ < box[5])) {
            occupied.add(`${x},${y},${z}`)
          }
        }
      }
    }

    const vertices: number[] = []
    const faces = [
      { axis: 0, step: [1, 0, 0], normal: 0, sign: 1 },
      { axis: 0, step: [-1, 0, 0], normal: 0, sign: -1 },
      { axis: 1, step: [0, 1, 0], normal: 1, sign: 1 },
      { axis: 1, step: [0, -1, 0], normal: 1, sign: -1 },
      { axis: 2, step: [0, 0, 1], normal: 2, sign: 1 },
      { axis: 2, step: [0, 0, -1], normal: 2, sign: -1 },
    ] as const
    const corners = [
      [0, 0], [1, 0], [1, 1], [0, 1],
    ] as const
    for (const cell of occupied) {
      const [x, y, z] = cell.split(',').map(Number)
      const cellIndices = [x, y, z]
      const bounds = [
        [xs[x], xs[x + 1]], [ys[y], ys[y + 1]], [zs[z], zs[z + 1]],
      ]
      for (const face of faces) {
        const neighbor = [...cellIndices]
        neighbor[face.axis] += face.step[face.axis]
        if (occupied.has(neighbor.join(','))) continue
        const axisPair = face.axis === 0 ? [1, 2] : face.axis === 1 ? [2, 0] : [0, 1]
        const points = corners.map(([first, second]) => {
          const point = [0, 0, 0]
          point[face.axis] = bounds[face.axis][face.sign > 0 ? 1 : 0]
          point[axisPair[0]] = bounds[axisPair[0]][first]
          point[axisPair[1]] = bounds[axisPair[1]][second]
          return point
        })
        const [a, b, c, d] = face.sign > 0
          ? points
          : [points[0], points[3], points[2], points[1]]
        for (const point of [a, b, c, a, c, d]) vertices.push(point[0], point[1], point[2])
      }
    }

    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    result.computeVertexNormals()
    result.computeBoundingSphere()
    return result
  }, [facadeFrontZ, height, options, width])

  const contourParts = useMemo(() => {
    if (!wallContour) return null
    const xValues = [...new Set(wallContour.points.map(({ x }) => x))].sort((a, b) => a - b)
    const toScenePoint = (x: number, y: number) => ({ x: x - width / 2, y: y - height / 2 })
    const makeExtrusion = (points: Array<{ x: number; y: number }>, depth: number, z: number) => {
      const shape = new THREE.Shape()
      points.forEach((point, index) => {
        if (index === 0) shape.moveTo(point.x, point.y)
        else shape.lineTo(point.x, point.y)
      })
      shape.closePath()
      const part = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
      part.translate(0, 0, z)
      return part
    }
    const lowerEdge = xValues.map((x) => ({ x, y: getWallVerticalBounds(wallContour, x).bottom }))
    const upperEdge = xValues.map((x) => ({ x, y: getWallVerticalBounds(wallContour, x).top }))
    const topActive = options.topEnabled && options.topHeight > 0
    const sideActive = options.sideEnabled && options.sideWidth > 0
    const extendedLowerEdge = sideActive
      ? [
          { x: -options.sideWidth, y: lowerEdge[0].y },
          ...lowerEdge,
          { x: wallContour.width + options.sideWidth, y: lowerEdge[lowerEdge.length - 1].y },
        ]
      : lowerEdge
    const extendedUpperEdge = sideActive
      ? [
          { x: -options.sideWidth, y: upperEdge[0].y },
          ...upperEdge,
          { x: wallContour.width + options.sideWidth, y: upperEdge[upperEdge.length - 1].y },
        ]
      : upperEdge
    const profileOutline = wallContour.points.map(({ x, y }) => toScenePoint(x, y))
    const mainBackZ = facadeFrontZ - options.facadeOffset - options.facadeDepth
    const parts = [makeExtrusion(profileOutline, options.facadeDepth, mainBackZ)]
    let floor: THREE.BufferGeometry | null = null

    if (topActive) {
      const topOuterY = Math.max(...extendedUpperEdge.map(({ y }) => y)) + options.topHeight
      const topOutline = [
        ...extendedUpperEdge.map(({ x, y }) => toScenePoint(x, y)),
        ...[...extendedUpperEdge].reverse().map(({ x }) => toScenePoint(x, topOuterY)),
      ]
      parts.push(makeExtrusion(topOutline, options.facadeDepth + options.topDepth, mainBackZ))
    }
    if (options.bottomEnabled && options.bottomType === 'wall' && options.bottomWallHeight > 0) {
      const bottomOuterY = Math.min(...extendedLowerEdge.map(({ y }) => y)) - options.bottomWallHeight
      const bottomOutline = [
        ...extendedLowerEdge.map(({ x }) => toScenePoint(x, bottomOuterY)),
        ...[...extendedLowerEdge].reverse().map(({ x, y }) => toScenePoint(x, y)),
      ]
      parts.push(makeExtrusion(bottomOutline, options.facadeDepth + options.bottomWallDepth, mainBackZ))
    }
    if (options.bottomEnabled && options.bottomType === 'floor' && options.floorThickness > 0 && options.floorDepth > 0) {
      const floorOuterY = Math.min(...extendedLowerEdge.map(({ y }) => y)) - options.floorThickness
      const floorOutline = [
        ...extendedLowerEdge.map(({ x }) => toScenePoint(x, floorOuterY)),
        ...[...extendedLowerEdge].reverse().map(({ x, y }) => toScenePoint(x, y)),
      ]
      floor = makeExtrusion(floorOutline, options.floorDepth, mainBackZ)
    }
    if (sideActive) {
      for (const edgeX of [0, wallContour.width]) {
        const bounds = getWallVerticalBounds(wallContour, edgeX)
        const isLeft = edgeX === 0
        const outerX = isLeft ? -options.sideWidth : wallContour.width + options.sideWidth
        const sideOutline = isLeft
          ? [
              toScenePoint(outerX, bounds.bottom),
              toScenePoint(edgeX, bounds.bottom),
              toScenePoint(edgeX, bounds.top),
              toScenePoint(outerX, bounds.top),
            ]
          : [
              toScenePoint(edgeX, bounds.bottom),
              toScenePoint(outerX, bounds.bottom),
              toScenePoint(outerX, bounds.top),
              toScenePoint(edgeX, bounds.top),
            ]
        parts.push(makeExtrusion(sideOutline, options.facadeDepth + options.sideDepth, mainBackZ))
      }
    }
    return { masonry: parts, floor }
  }, [facadeFrontZ, height, options, wallContour, width])

  const manualFloorGeometry = useMemo(() => {
    if (wallContour || !options.bottomEnabled || options.bottomType !== 'floor' || options.floorDepth <= 0 || options.floorThickness <= 0) return null
    const backZ = facadeFrontZ - options.facadeOffset - options.facadeDepth
    const floor = new THREE.BoxGeometry(getFloorWidth(width, options), options.floorThickness, options.floorDepth)
    floor.translate(0, -height / 2 - options.floorThickness / 2, backZ + options.floorDepth / 2)
    return floor
  }, [facadeFrontZ, height, options, wallContour, width])
  const floorGeometry = contourParts?.floor ?? manualFloorGeometry
  const displayedParts = useMemo(() => contourParts?.masonry ?? [geometry], [contourParts, geometry])
  const floorTexture = useMemo(() => createFloorTexture(options.floorMaterial), [options.floorMaterial])
  const floorColor = getFloorMaterialColor(options.floorMaterial)
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => {
    contourParts?.masonry.forEach((part) => part.dispose())
    contourParts?.floor?.dispose()
  }, [contourParts])
  useEffect(() => () => {
    if (!contourParts) manualFloorGeometry?.dispose()
  }, [contourParts, manualFloorGeometry])
  useEffect(() => () => floorTexture?.dispose(), [floorTexture])

  return (
    <>
      {options.enabled && displayedParts.map((part, index) => (
        <mesh key={index} geometry={part} receiveShadow castShadow>
            <meshStandardMaterial
              color={options.color}
              transparent={options.transparency > 0}
              opacity={1 - options.transparency / 100}
              depthWrite
              roughness={0.94}
            />
        </mesh>
      ))}
      {options.enabled && floorGeometry && (
        <mesh geometry={floorGeometry} receiveShadow castShadow>
            <meshStandardMaterial
              map={floorTexture}
              color={floorTexture ? '#ffffff' : floorColor}
              transparent={!floorTexture && options.transparency > 0}
              opacity={floorTexture ? 1 : 1 - options.transparency / 100}
              depthWrite
              roughness={0.94}
            />
        </mesh>
      )}
    </>
  )
}

type ViewDirection = 'isometric' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

const WORLD_UP: [number, number, number] = [0, 0, 1]

function CameraRig({
  width,
  height,
  depth,
  frontEdgeY,
  view,
  projection,
}: {
  width: number
  height: number
  depth: number
  frontEdgeY: number
  view: ViewDirection
  projection: CameraProjection
}) {
  const distance = Math.max(width, height, depth) * 1.8
  const target: [number, number, number] = [width / 2, -frontEdgeY - depth / 2, height / 2]
  const directions: Record<ViewDirection, [number, number, number]> = {
    isometric: [1, -1, 1],
    front: [0, -1, 0],
    back: [0, 1, 0],
    left: [-1, 0, 0],
    right: [1, 0, 0],
    top: [0, 0, 1],
    bottom: [0, 0, -1],
  }
  const direction = new THREE.Vector3(...directions[view]).normalize()
  const position: [number, number, number] = [
    target[0] + direction.x * distance,
    target[1] + direction.y * distance,
    target[2] + direction.z * distance,
  ]
  const up: [number, number, number] = view === 'top' || view === 'bottom' ? [0, 1, 0] : WORLD_UP
  if (projection === 'orthographic') {
    return <OrthographicCamera makeDefault position={position} up={up} onUpdate={(camera) => camera.lookAt(...target)} near={1} far={50000} zoom={1.25} />
  }
  return <PerspectiveCamera makeDefault position={position} up={up} onUpdate={(camera) => camera.lookAt(...target)} fov={36} near={1} far={50000} />
}

const AXES = [
  { label: 'X', direction: new THREE.Vector3(1, 0, 0), color: '#ff0000' },
  { label: 'Y', direction: new THREE.Vector3(0, 1, 0), color: '#00a000' },
  { label: 'Z', direction: new THREE.Vector3(0, 0, 1), color: '#0000ff' },
] as const

function CoordinateAxes({ size }: { size: number }) {
  const origin = useMemo(() => new THREE.Vector3(0, 0, 0), [])
  const headLength = Math.max(12, size * 0.12)
  const headWidth = Math.max(7, size * 0.06)
  const axesRef = useRef<THREE.Group>(null)

  useEffect(() => {
    axesRef.current?.traverse((object) => {
      if (!(object instanceof THREE.Line || object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => {
        material.depthTest = false
        material.needsUpdate = true
      })
      object.renderOrder = 10
    })
  }, [headLength, headWidth, size])

  return (
    <group ref={axesRef}>
      {AXES.map(({ label, direction, color }) => (
        <group key={label}>
          <arrowHelper args={[direction, origin, size, color, headLength, headWidth]} />
        </group>
      ))}
    </group>
  )
}

export function FacadeViewer({
  configuration,
  wallContour,
  spacingDeviations,
  placements,
  ukRailProfile,
  ukRailPlacements,
  ukAngleProfile,
  ukAnglePlacements,
  ukAngleConnectorPlacements,
  supportRailProfile,
  supportRailPieces,
  spidiConnectorMesh,
  ukRailFixings,
  squareTimbers,
  profileDisplayMode,
  onProfileDisplayModeChange,
  dimensionsValid,
  layoutError,
  endGap,
}: {
  configuration: FacadeConfiguration
  wallContour: WallContour | null
  spacingDeviations: number[]
  placements: ProfilePlacement[]
  ukRailProfile: UkRailProfile | null
  ukRailPlacements: UkRailPlacement[]
  ukAngleProfile: UkAngleProfile | null
  ukAnglePlacements: UkAnglePlacement[]
  ukAngleConnectorPlacements: UkAngleConnectorPlacement[]
  supportRailProfile: SupportRailProfile | null
  supportRailPieces: SupportRailPiece[]
  spidiConnectorMesh: SpidiConnectorMeshData | null
  ukRailFixings: UkRailFixingPlacement[]
  squareTimbers: SquareTimberPlacement[]
  profileDisplayMode: ProfileDisplayMode
  onProfileDisplayModeChange: (mode: ProfileDisplayMode) => void
  dimensionsValid: boolean
  layoutError: string
  endGap: number
}) {
  const [view, setView] = useState<ViewDirection>('isometric')
  const [projection, setProjection] = useState<CameraProjection>('orthographic')
  const [showGrid, setShowGrid] = useState(true)
  const [showAxes, setShowAxes] = useState(true)
  const [showWallContour, setShowWallContour] = useState(true)
  const [showMasonry, setShowMasonry] = useState(true)
  const [showProfiles, setShowProfiles] = useState(true)
  const [showRails, setShowRails] = useState(true)
  const [showBlocks, setShowBlocks] = useState(true)
  const [showScrews, setShowScrews] = useState(true)
  const [showAngles, setShowAngles] = useState(true)
  const [showConnectors, setShowConnectors] = useState(true)
  const [showSupportRail, setShowSupportRail] = useState(true)
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF')
  const [viewRevision, setViewRevision] = useState(0)
  const { width, height } = configuration
  const masonryView = configuration.masonryView ?? DEFAULT_MASONRY_VIEW
  const facadeFrontZ = -getProfileFrontEdgeY(configuration.profile)
  const frontEdgeY = getProfileFrontEdgeY(configuration.profile)
  const profileDepth = getFacadeProfileDepth(configuration.profile, placements)
  const hasCompressedProfiles = profileDisplayMode === 'info'
    && spacingDeviations.some((deviation) => deviation < -SPACING_TOLERANCE)
  const hasStretchedProfiles = profileDisplayMode === 'info'
    && spacingDeviations.some((deviation) => deviation > SPACING_TOLERANCE)
  const gridColors = getGridColors(backgroundColor)

  const boundsKey = `${width}-${height}-${configuration.profile.name}-${configuration.profile.width}-${placements.length}-${wallContour?.name ?? ''}-${showWallContour}-${showMasonry}-${showProfiles}-${showRails}-${showBlocks}-${showScrews}-${showAngles}-${showConnectors}-${showSupportRail}-${supportRailPieces.length}-${JSON.stringify(masonryView)}-${JSON.stringify(configuration.ukRailView ?? DEFAULT_UK_RAIL_VIEW)}-${ukRailProfile?.name ?? ''}-${ukRailPlacements.length}-${ukAngleProfile?.name ?? ''}-${ukAnglePlacements.length}-${ukAngleConnectorPlacements.length}-${view}-${projection}-${viewRevision}`
  return (
    <div className="viewer-shell">
      <div className="viewer-toolbar" role="toolbar" aria-label="Ansichtswerkzeuge">
        <label className="viewer-display-mode">
          <span>Ansicht</span>
          <select
            aria-label="Ansichtsrichtung"
            value={view}
            onChange={(event) => {
              const selectedView = event.target.value
              if (selectedView === 'isometric'
                || selectedView === 'front'
                || selectedView === 'back'
                || selectedView === 'left'
                || selectedView === 'right'
                || selectedView === 'top'
                || selectedView === 'bottom') {
                setView(selectedView)
              } else {
                throw new Error(`Unbekannte Ansichtsrichtung: ${selectedView}`)
              }
            }}
          >
            <option value="isometric">Isometrisch</option>
            <option value="front">Von vorne</option>
            <option value="back">Von hinten</option>
            <option value="left">Von links</option>
            <option value="right">Von rechts</option>
            <option value="top">Von oben</option>
            <option value="bottom">Von unten</option>
          </select>
        </label>
        <span className="toolbar-divider" />
        <label className="viewer-display-mode">
          <span>Projektion</span>
          <select
            aria-label="Kameraprojektion"
            value={projection}
            onChange={(event) => {
              const selectedProjection = event.target.value
              if (selectedProjection !== 'orthographic' && selectedProjection !== 'perspective') {
                throw new Error(`Unbekannte Kameraprojektion: ${selectedProjection}`)
              }
              setProjection(selectedProjection)
            }}
          >
            <option value="orthographic">Orthografisch / isometrisch</option>
            <option value="perspective">Perspektivisch</option>
          </select>
        </label>
        <span className="toolbar-divider" />
        <label className="viewer-display-mode">
          <span>Darstellung</span>
          <select
            aria-label="Darstellung im Ansichtsfenster"
            value={profileDisplayMode}
            onChange={(event) => {
              const mode = event.target.value
              if (mode !== 'facadeColor' && mode !== 'info') {
                throw new Error(`Unbekannter Darstellungsmodus: ${mode}`)
              }
              onProfileDisplayModeChange(mode)
            }}
          >
            <option value="facadeColor">Fassadenfarbe</option>
            <option value="info">Infos anzeigen</option>
          </select>
        </label>
        <span className="toolbar-divider" />
        <button className={showGrid ? 'tool-button active' : 'tool-button'} type="button" title="Raster ein-/ausblenden" aria-label="Raster ein- oder ausblenden" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={16} /></button>
        <button className={showAxes ? 'tool-button active' : 'tool-button'} type="button" title="Achsen ein-/ausblenden" aria-label="Achsen ein- oder ausblenden" aria-pressed={showAxes} onClick={() => setShowAxes((value) => !value)}><span className="axis-icon">XYZ</span></button>
        {wallContour && <button className={showWallContour ? 'tool-button active' : 'tool-button'} type="button" title="Mauerkontur ein- oder ausblenden" aria-label="Mauerkontur ein- oder ausblenden" aria-pressed={showWallContour} onClick={() => setShowWallContour((value) => !value)}>{showWallContour ? <Eye size={15} /> : <EyeOff size={15} />}</button>}
        <details className="viewer-layer-menu">
          <summary title="Bauteilgruppen ein- oder ausblenden">Bauteile</summary>
          <div className="viewer-layer-options" aria-label="Bauteilgruppen">
            <label><input type="checkbox" checked={showProfiles} onChange={(event) => setShowProfiles(event.target.checked)} /> Lamellenprofile</label>
            {masonryView.enabled && <label><input type="checkbox" checked={showMasonry} onChange={(event) => setShowMasonry(event.target.checked)} /> Mauer und Anbauten</label>}
            {wallContour && <label><input type="checkbox" checked={showWallContour} onChange={(event) => setShowWallContour(event.target.checked)} /> DXF-Mauerkontur</label>}
            {(configuration.ukRailView ?? DEFAULT_UK_RAIL_VIEW).enabled && (
              <>
                <label><input type="checkbox" checked={showRails} onChange={(event) => setShowRails(event.target.checked)} /> UK-Schienen</label>
                <label><input type="checkbox" checked={showSupportRail} onChange={(event) => setShowSupportRail(event.target.checked)} /> Auflager-Schiene</label>
                {getUkRailMountingMethod(configuration) === 'direct-to-wall'
                  ? <>
                    <label><input type="checkbox" checked={showBlocks} onChange={(event) => setShowBlocks(event.target.checked)} /> Kunststoffklötze / Kanthölzer</label>
                    <label><input type="checkbox" checked={showScrews} onChange={(event) => setShowScrews(event.target.checked)} /> Schrauben</label>
                  </>
                  : <>
                    <label><input type="checkbox" checked={showAngles} onChange={(event) => setShowAngles(event.target.checked)} /> L-Winkel</label>
                    <label><input type="checkbox" checked={showConnectors} onChange={(event) => setShowConnectors(event.target.checked)} /> Maueranschlussteile</label>
                  </>}
              </>
            )}
          </div>
        </details>
        <label className="background-color-control">
          <span>Hintergrundfarbe</span>
          <input
            type="color"
            value={backgroundColor}
            onChange={(event) => setBackgroundColor(event.target.value)}
            aria-label="Hintergrundfarbe des Ansichtsfensters"
            title="Hintergrundfarbe des Ansichtsfensters"
          />
        </label>
        <button className="tool-button" type="button" title="Ansicht zurücksetzen" aria-label="Ansicht zurücksetzen" onClick={() => setViewRevision((revision) => revision + 1)}><RotateCcw size={15} /></button>
      </div>

      <div className="canvas-frame">
        <Canvas
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false }}
          camera={{ position: [width * 0.92, Math.max(width, height) * 1.8, height * 0.9], up: WORLD_UP, fov: 36, near: 1, far: 50000 }}
        >
          <color attach="background" args={[backgroundColor]} />
          <CameraRig
            key={`${view}-${projection}`}
            width={width}
            height={height}
            depth={profileDepth}
            frontEdgeY={frontEdgeY}
            view={view}
            projection={projection}
          />
          <ambientLight intensity={1.5} />
          <directionalLight position={[width / 2, profileDepth * 2, height * 1.4]} intensity={3} castShadow />
          <directionalLight position={[-width, -profileDepth, height * 0.2]} intensity={1.5} />
          <group position={[width / 2, -frontEdgeY, height / 2]} rotation={[Math.PI / 2, 0, 0]}>
            <Bounds key={boundsKey} fit clip observe margin={1.22}>
              <MasonryPreview
                width={width}
                height={height}
                facadeFrontZ={facadeFrontZ}
                wallContour={wallContour}
                options={{ ...masonryView, enabled: masonryView.enabled && showMasonry }}
              />
              {wallContour && showWallContour && (
                <WallReference contour={wallContour} facadeOffset={masonryView.facadeOffset} />
              )}
              <UkRailInstances
                configuration={configuration}
                profile={ukRailProfile}
                placements={ukRailPlacements}
                angleProfile={ukAngleProfile}
                anglePlacements={ukAnglePlacements}
                connectorPlacements={ukAngleConnectorPlacements}
                connectorMesh={spidiConnectorMesh}
                connectorWallOffset={masonryView.facadeOffset}
                fixings={ukRailFixings}
                facadeDepth={profileDepth}
                facadeFrontEdgeY={frontEdgeY}
                profileDisplayMode={profileDisplayMode}
                showRails={showRails}
                showBlocks={showBlocks}
                showScrews={showScrews}
                showAngles={showAngles}
                showConnectors={showConnectors}
                supportRailProfile={supportRailProfile}
                supportRailPieces={supportRailPieces}
                showSupportRail={showSupportRail}
                squareTimbers={squareTimbers}
              />
              {showProfiles && dimensionsValid && (
                <ProfileInstances
                  configuration={configuration}
                  spacingDeviations={spacingDeviations}
                  profileDisplayMode={profileDisplayMode}
                  wallContour={wallContour}
                  placements={placements}
                  endGap={endGap}
                />
              )}
            </Bounds>
          </group>
          {showGrid && <gridHelper args={[Math.max(width, height) * 1.45, 30, gridColors[0], gridColors[1]]} position={[width / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]} />}
          {showAxes && <CoordinateAxes size={Math.max(width, height) * 0.15} />}
          <OrbitControls
            makeDefault
            target={[width / 2, -frontEdgeY - profileDepth / 2, height / 2]}
            enableDamping
            dampingFactor={0.08}
            minDistance={100}
            maxDistance={Math.max(width, height) * 8}
          />
        </Canvas>
        {showAxes && (
          <div className="axis-labels" aria-label="Koordinatenachsen: X rot, Y grün, Z blau">
            {AXES.map(({ label }) => <span key={label} className={`axis-label axis-label-${label.toLowerCase()}`}>{label}</span>)}
          </div>
        )}
        {!dimensionsValid && <div className="canvas-message">{layoutError || 'Breite und Höhe müssen größer als 0 mm sein.'}</div>}
      </div>
      <div className="viewer-caption">
        <span><i className="caption-dot" /> {placements.length} Profile · {configuration.profileMix && configuration.profileMix.mode !== 'single' ? 'Mischung' : configuration.profile.name}{wallContour ? ' · DXF-Mauer' : ''}{(configuration.ukRailView ?? DEFAULT_UK_RAIL_VIEW).enabled && ukRailProfile ? ` · ${ukRailPlacements.length} UK-Teilstücke` : ''}</span>
        <span className="spacing-legend" aria-label="Farblegende der Rasteranpassungen">
          {hasCompressedProfiles && <span><i className="spacing-swatch compressed" /> Gestaucht</span>}
          {hasStretchedProfiles && <span><i className="spacing-swatch stretched" /> Gestreckt</span>}
        </span>
        <span>MM / 1:1 MODELL</span>
      </div>
    </div>
  )
}
