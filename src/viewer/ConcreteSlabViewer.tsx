import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Bounds, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Ruler } from 'lucide-react'
import { CylinderGeometry, ExtrudeGeometry, Quaternion, Shape, Vector3 } from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { SlabDimension, SlabPoint } from '../domain/concreteSlab'
import type { ProfilePart } from '../domain/railingProfile'
import { formatMeasurement } from '../domain/measurementFormat'
import type { GlassPanel, RailingAccessoryLayout } from '../domain/railingAccessories'
import { SIDE_FIXING_AXIS_HEIGHT, SIDE_FIXING_HOLE_DIAMETER, STEEL_PLATE_MARGIN, STEEL_PLATE_THICKNESS } from '../domain/railingMounting'
import type { RailingMounting } from '../domain/railingMounting'
import { RailingProfiles } from './RailingProfiles'
import { BodyEdges } from './BodyEdges'
import { RAILING_COLORS } from '../domain/railingAppearance'
import type { ViewerImage } from './viewerImage'

interface ConcreteSlabViewerProps {
  points: SlabPoint[] | null
  dimensions: SlabDimension[] | null
  depth: number | null
  thickness: number | null
  mounting: RailingMounting
  error: string | null
  profiles: ProfilePart[]
  accessories: RailingAccessoryLayout
  glassPanels: GlassPanel[]
  captureRef: RefObject<(() => ViewerImage) | null>
}

type WorldPoint = [number, number, number]
interface DimensionDisplay {
  lines: WorldPoint[][]
  labels: { position: WorldPoint; text: string; description: string }[]
}

function createDimensionDisplay(points: SlabPoint[], dimensions: SlabDimension[], depth: number, thickness: number): DimensionDisplay {
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const scale = Math.max(maxX - minX, maxY - minY, thickness)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const height = thickness / scale / 2 + 0.003
  const toWorld = (point: SlabPoint): WorldPoint => [
    (point.x - centerX) / scale,
    height,
    (point.y - centerY) / scale,
  ]
  const offset = scale * 0.045
  const format = formatMeasurement

  const lines: WorldPoint[][] = []
  const labels: DimensionDisplay['labels'] = []
  dimensions.forEach((dimension, index) => {
    const dx = (dimension.end.x - dimension.start.x) / dimension.length
    const dy = (dimension.end.y - dimension.start.y) / dimension.length
    const normal = { x: -dy, y: dx }
    const start = { x: dimension.start.x + normal.x * offset, y: dimension.start.y + normal.y * offset }
    const end = { x: dimension.end.x + normal.x * offset, y: dimension.end.y + normal.y * offset }
    const label = { x: (start.x + end.x) / 2 + normal.x * offset * 0.3, y: (start.y + end.y) / 2 + normal.y * offset * 0.3 }
    const previous = dimensions[index - 1]
    const angle = dimension.angle
    const radius = previous ? Math.min(depth * 0.35, previous.length * 0.25, dimension.length * 0.25, scale * 0.08) : 0
    const startAngle = previous ? Math.atan2(previous.start.y - dimension.start.y, previous.start.x - dimension.start.x) : 0
    const arc = angle === null ? [] : Array.from({ length: 25 }, (_, i) => {
      const theta = startAngle + angle * Math.PI / 180 * i / 24
      return toWorld({ x: dimension.start.x + radius * Math.cos(theta), y: dimension.start.y + radius * Math.sin(theta) })
    })
    const middleAngle = angle === null ? 0 : startAngle + angle * Math.PI / 360
    const angleLabel = {
      x: dimension.start.x + radius * 1.35 * Math.cos(middleAngle),
      y: dimension.start.y + radius * 1.35 * Math.sin(middleAngle),
    }

    lines.push([toWorld(dimension.start), toWorld(start), toWorld(end), toWorld(dimension.end)])
    labels.push({ position: toWorld(label), text: `${format(dimension.length)} mm`, description: `Länge ${index + 1}: ${format(dimension.length)} Millimeter` })
    if (angle !== null) {
      lines.push(arc)
      labels.push({ position: toWorld(angleLabel), text: `${format(angle)}°`, description: `Innenwinkel ${index + 1}: ${format(angle)} Grad` })
    }
  })
  return { lines, labels }
}

function SlabDimensions({ display, overlay }: { display: DimensionDisplay; overlay: RefObject<HTMLDivElement | null> }) {
  const projected = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }) => {
    const elements = overlay.current?.querySelectorAll<HTMLElement>('.slab-dimension-label')
    if (!elements) return
    display.labels.forEach((label, index) => {
      const element = elements[index]
      if (!element) return
      projected.set(...label.position).project(camera)
      element.style.visibility = projected.z < -1 || projected.z > 1 ? 'hidden' : 'visible'
      element.style.left = `${(projected.x + 1) * size.width / 2}px`
      element.style.top = `${(1 - projected.y) * size.height / 2}px`
    })
  })
  return <group>{display.lines.map((line, index) => <Line key={index} points={line} color="#285598" lineWidth={1.5} />)}</group>
}

function ViewerImageCapture({ captureRef }: { captureRef: RefObject<(() => ViewerImage) | null> }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    const capture = (): ViewerImage => {
      const canvas = gl.domElement
      if (gl.getContext().isContextLost() || canvas.width === 0 || canvas.height === 0) {
        throw new Error('Die 3D-Ansicht ist nicht bereit. Bitte die Ansicht prüfen und erneut versuchen.')
      }
      const dimensions = scene.getObjectByName('slab-dimensions')
      const wasVisible = dimensions?.visible
      try {
        if (dimensions) dimensions.visible = false
        gl.render(scene, camera)
        const scale = Math.min(1, 1400 / Math.max(canvas.width, canvas.height))
        const output = document.createElement('canvas')
        output.width = Math.max(1, Math.round(canvas.width * scale))
        output.height = Math.max(1, Math.round(canvas.height * scale))
        const context = output.getContext('2d')
        if (!context) throw new Error('Das Bild der 3D-Ansicht konnte nicht verarbeitet werden.')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, output.width, output.height)
        context.drawImage(canvas, 0, 0, output.width, output.height)
        const dataUrl = output.toDataURL('image/jpeg', 0.8)
        if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('Das Bild der 3D-Ansicht konnte nicht komprimiert werden.')
        return { dataUrl, width: output.width, height: output.height }
      } finally {
        if (dimensions && wasVisible !== undefined) dimensions.visible = wasVisible
      }
    }
    captureRef.current = capture
    return () => { if (captureRef.current === capture) captureRef.current = null }
  }, [captureRef, gl, scene, camera])
  return null
}

function SlabMesh({ points, thickness, mounting, profiles }: {
  points: SlabPoint[]
  thickness: number
  mounting: RailingMounting
  profiles: ProfilePart[]
}) {
  const { shape, scale, centerX, centerY } = useMemo(() => {
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))
    const scale = Math.max(maxX - minX, maxY - minY, thickness)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const shape = new Shape()
    shape.moveTo((points[0].x - centerX) / scale, (points[0].y - centerY) / scale)
    for (const point of points.slice(1)) shape.lineTo((point.x - centerX) / scale, (point.y - centerY) / scale)
    shape.closePath()
    return { shape, scale, centerX, centerY }
  }, [points, thickness])
  const geometry = useMemo(() => {
    const body = new ExtrudeGeometry(shape, { depth: thickness / scale, bevelEnabled: false })
    if (mounting !== '7A' || profiles.length === 0) return body
    const cutters = profiles.flatMap((part) => {
      const normal = new Vector3(part.direction.y, -part.direction.x, 0)
      const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal)
      return part.holes.map((hole) => {
        const cutter = new CylinderGeometry(
          SIDE_FIXING_HOLE_DIAMETER / 2 / scale,
          SIDE_FIXING_HOLE_DIAMETER / 2 / scale,
          (STEEL_PLATE_THICKNESS + 2) / scale,
          24,
        )
        cutter.applyQuaternion(orientation)
        cutter.translate(
          (hole.x + normal.x * STEEL_PLATE_THICKNESS / 2 - centerX) / scale,
          (hole.y + normal.y * STEEL_PLATE_THICKNESS / 2 - centerY) / scale,
          (thickness - STEEL_PLATE_MARGIN - SIDE_FIXING_AXIS_HEIGHT) / scale,
        )
        return cutter
      })
    })
    const merged = mergeGeometries(cutters)
    cutters.forEach((cutter) => cutter.dispose())
    if (!merged) {
      body.dispose()
      throw new Error('Die Stahlblechbohrungen konnten nicht vorbereitet werden.')
    }
    const plateBrush = new Brush(body)
    const cutterBrush = new Brush(merged)
    plateBrush.updateMatrixWorld(true)
    cutterBrush.updateMatrixWorld(true)
    try {
      const evaluator = new Evaluator()
      evaluator.useGroups = false
      evaluator.attributes = ['position', 'normal']
      const perforated = evaluator.evaluate(plateBrush, cutterBrush, SUBTRACTION)
      perforated.disposeCacheData()
      perforated.geometry.computeVertexNormals()
      return perforated.geometry
    } finally {
      plateBrush.disposeCacheData()
      cutterBrush.disposeCacheData()
      body.dispose()
      merged.dispose()
    }
  }, [shape, scale, thickness, mounting, profiles, centerX, centerY])
  const outlineGeometry = useMemo(() => new ExtrudeGeometry(shape, { depth: thickness / scale, bevelEnabled: false }), [shape, thickness, scale])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => outlineGeometry.dispose(), [outlineGeometry])

  return (
    <group rotation={[Math.PI / 2, 0, 0]} position={[0, (mounting === '7A' ? thickness - STEEL_PLATE_MARGIN : thickness / 2) / scale, 0]}>
      <mesh geometry={geometry}><meshStandardMaterial color={mounting === '7A' ? RAILING_COLORS.steel : RAILING_COLORS.concrete} metalness={mounting === '7A' ? 0.55 : 0} roughness={mounting === '7A' ? 0.5 : 0.9} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} /></mesh>
      <BodyEdges geometry={mounting === '7A' ? outlineGeometry : geometry} />
    </group>
  )
}

export function ConcreteSlabViewer({
  points, dimensions, depth, thickness, mounting, error, profiles, accessories, glassPanels, captureRef,
}: ConcreteSlabViewerProps) {
  const valid = points !== null && dimensions !== null && depth !== null && thickness !== null
  const [showDimensions, setShowDimensions] = useState(true)
  const [showSlab, setShowSlab] = useState(true)
  const [showProfiles, setShowProfiles] = useState(true)
  const [showSealLips, setShowSealLips] = useState(true)
  const [showClampWedges, setShowClampWedges] = useState(true)
  const [showGlassShoes, setShowGlassShoes] = useState(true)
  const [showGlass, setShowGlass] = useState(true)
  const [showScrews, setShowScrews] = useState(true)
  const overlay = useRef<HTMLDivElement>(null)
  const display = useMemo(() => valid ? createDimensionDisplay(points, dimensions, depth, thickness) : null, [points, dimensions, depth, thickness, valid])

  return (
    <div className="viewer-shell">
      <div className="canvas-frame">
        <div className="viewer-toolbar slab-viewer-toolbar" role="group" aria-label="Sichtbarkeit in der 3D-Ansicht">
          <button
            type="button"
            className={showDimensions ? 'slab-dimension-toggle active' : 'slab-dimension-toggle'}
            aria-label="Bemaßung anzeigen"
            aria-pressed={showDimensions}
            title={showDimensions ? 'Bemaßung ausblenden' : 'Bemaßung einblenden'}
            onClick={() => setShowDimensions((value) => !value)}
          >
            <Ruler size={15} />
            <span>Maße</span>
          </button>
          <button type="button" className={`slab-dimension-toggle${showSlab ? ' active' : ''}`} aria-pressed={showSlab}
            title={showSlab ? `${mounting === '7A' ? 'Stahlblech' : 'Betondecke'} ausblenden` : `${mounting === '7A' ? 'Stahlblech' : 'Betondecke'} einblenden`} onClick={() => setShowSlab((value) => !value)}>
            {mounting === '7A' ? 'Stahlblech' : 'Betondecke'}
          </button>
          <button type="button" className={`slab-dimension-toggle${showProfiles ? ' active' : ''}`} aria-pressed={showProfiles}
            title={showProfiles ? 'Grundprofile ausblenden' : 'Grundprofile einblenden'} onClick={() => setShowProfiles((value) => !value)}>
            Grundprofile
          </button>
          <>
            <button type="button" className={`slab-dimension-toggle${showSealLips ? ' active' : ''}`} aria-pressed={showSealLips}
              title={showSealLips ? 'Dichtlippen ausblenden' : 'Dichtlippen einblenden'} onClick={() => setShowSealLips((value) => !value)}>
              Dichtlippen
            </button>
            <button type="button" className={`slab-dimension-toggle${showClampWedges ? ' active' : ''}`} aria-pressed={showClampWedges}
              title={showClampWedges ? 'Klemmkeile ausblenden' : 'Klemmkeile einblenden'} onClick={() => setShowClampWedges((value) => !value)}>
              Klemmkeile
            </button>
            <button type="button" className={`slab-dimension-toggle${showGlassShoes ? ' active' : ''}`} aria-pressed={showGlassShoes}
              title={showGlassShoes ? 'Glasschuhe ausblenden' : 'Glasschuhe einblenden'} onClick={() => setShowGlassShoes((value) => !value)}>
              Glasschuhe
            </button>
            <button type="button" className={`slab-dimension-toggle${showGlass ? ' active' : ''}`} aria-pressed={showGlass}
              title={showGlass ? 'Glas ausblenden' : 'Glas einblenden'} onClick={() => setShowGlass((value) => !value)}>
              Glas
            </button>
          </>
          <button type="button" className={`slab-dimension-toggle${showScrews ? ' active' : ''}`} aria-pressed={showScrews}
            title={showScrews ? 'Befestigung ausblenden' : 'Befestigung einblenden'} onClick={() => setShowScrews((value) => !value)}>
            {mounting === '7A' ? 'Torbandschrauben' : 'Schrauben'}
          </button>
        </div>
        <Canvas
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false }}
          camera={{ position: [0, 2.4, 4], fov: 40, near: 0.001, far: 100 }}
          fallback={<div className="canvas-message" role="alert">Die 3D-Ansicht wird von diesem Browser nicht unterstützt.</div>}
        >
          <color attach="background" args={['#ffffff']} />
          <ambientLight intensity={1.5} />
          <directionalLight position={[3, 5, 4]} intensity={2} />
          <directionalLight position={[-3, 2, -2]} intensity={0.7} />
          <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
          <ViewerImageCapture captureRef={captureRef} />
          {valid && (
            <>
              <Bounds key={`${JSON.stringify(points)}-${thickness}-${mounting}`} fit clip observe margin={1.6}>
                <group>
                  <group name={mounting === '7A' ? 'Stahlblech' : 'Betondecke'} visible={showSlab}><SlabMesh points={points} thickness={thickness} mounting={mounting} profiles={profiles} /></group>
                  <RailingProfiles
                    parts={profiles}
                    accessories={accessories}
                    glassPanels={glassPanels}
                    points={points}
                    thickness={thickness}
                    mounting={mounting}
                    showProfiles={showProfiles}
                    showSealLips={showSealLips}
                    showClampWedges={showClampWedges}
                    showGlassShoes={showGlassShoes}
                    showScrews={showScrews}
                    showGlass={showGlass}
                  />
                </group>
              </Bounds>
              {showDimensions && display && <group name="slab-dimensions"><SlabDimensions display={display} overlay={overlay} /></group>}
            </>
          )}
        </Canvas>
        <div className="slab-dimension-overlay" ref={overlay}>
          {showDimensions && display?.labels.map((label, index) => (
            <span className="slab-dimension-label" key={index} aria-label={label.description}>{label.text}</span>
          ))}
        </div>
        {!valid && <div className="canvas-message" role="status">{error ?? `Bitte gültige Maße eingeben, um ${mounting === '7A' ? 'das Stahlblech' : 'die Betondecke'} anzuzeigen.`}</div>}
      </div>
      <div className="viewer-caption">
        <span>3D-ANSICHT / {mounting === '7A' ? 'STAHLBLECH' : 'BETONDECKE'}</span>
        <span>DREHEN: MAUSTASTE · ZOOM: MAUSRAD</span>
      </div>
    </div>
  )
}
