import initOpenCascade from 'opencascade.js'
import type {
  IFSelect_ReturnStatus as OpenCascadeReturnStatus,
  STEPControl_StepModelType as OpenCascadeStepModelType,
  STEPControl_Writer as OpenCascadeStepWriter,
  TopAbs_ShapeEnum as OpenCascadeShapeEnum,
  TopoDS_Face as OpenCascadeFace,
  TopoDS_Shape as OpenCascadeShape,
} from 'opencascade.js'
import type { MasonryViewConfiguration, Point2D, ProfileContour, ProfileDefinition, ProfilePlacement, SquareTimberPlacement, SupportRailPiece, SupportRailProfile, UkAngleConnectorPlacement, UkMountingExportData, UkRailFixingPlacement, UkRailPlacement, UkRailProfile, WallContour } from '../domain/types'
import { getFacadeProfileDepth, getProfileDepthCoordinate, getProfileFrontEdgeY } from '../domain/profileCoordinates'
import { getEndGap } from '../domain/endGap'
import { getWallVerticalBounds, insetWallContourVertically } from '../domain/wallContour'
import { DEFAULT_MASONRY_VIEW } from '../domain/masonryView'
import { DEFAULT_UK_RAIL_VIEW } from '../domain/ukRailView'
import { UK_RAIL_PROFILE_CLEARANCE } from '../domain/ukRail'
import { getSupportRailCorner, getSupportRailCutPosition } from '../domain/supportRail'
import { getUkAngleProfileContours } from '../domain/ukMounting'
import { getProfileInfoColor, UK_CONNECTOR_FACADE_COLOR, UK_INFO_COLORS } from '../domain/viewerColorScheme'
import { getFloorMaterialColor } from '../domain/floorMaterials'
import { getSpidiConnectorTransforms } from '../domain/spidiConnector'
import {
  DIRECT_MOUNT_SCREW_HEAD_DIAMETER_MM,
  DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM,
  DIRECT_MOUNT_SCREW_SHAFT_DIAMETER_MM,
  DIRECT_MOUNT_SCREW_SHAFT_LENGTH_MM,
} from '../domain/directMountScrew'
import type { StepExportRequest } from './stepExport'

const STEP_FILE_PATH = '/tmp/linarte-facade-export.step'
const SPIDI_FILE_PATH = '/tmp/genSpidi_export.stp'
const STEP_HEADER = 'ISO-10303-21;'
const STEP_FOOTER = 'END-ISO-10303-21;'

const KERNEL_START_TIMEOUT_MS = 120_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error: unknown) => { clearTimeout(timer); reject(error) },
    )
  })
}

function postProgress(message: string, progress: number) {
  self.postMessage({ type: 'progress', message, progress: Math.max(0, Math.min(100, progress)) })
}

function getEnumEntry<T>(enumObject: object, key: string): T {
  const entry = (enumObject as Record<string, unknown>)[key]
  if (entry === undefined) {
    throw new Error(`OpenCascade enum value ${key} is unavailable.`)
  }
  return entry as T
}

function getEnumNumber(value: unknown): number {
  if (typeof value !== 'object' || value === null || !('value' in value) || typeof value.value !== 'number') {
    throw new Error('OpenCascade returned an invalid enum value.')
  }
  return value.value
}

async function loadSpidiConnectorShape(
  length: number,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
): Promise<OpenCascadeShape> {
  const response = await fetch(`/genSpidi_${length}.stp`)
  if (!response.ok) {
    throw new Error(`Das Maueranschlussteil konnte nicht geladen werden (HTTP ${response.status}).`)
  }
  const file = new Uint8Array(await response.arrayBuffer())
  try {
    oc.FS.writeFile(SPIDI_FILE_PATH, file)
    const reader = new oc.STEPControl_Reader_1()
    try {
      const status = reader.ReadFile(SPIDI_FILE_PATH)
      const doneStatus = getEnumEntry<OpenCascadeReturnStatus>(oc.IFSelect_ReturnStatus, 'IFSelect_RetDone')
      const statusValue = getEnumNumber(status)
      if (statusValue !== getEnumNumber(doneStatus)) {
        throw new Error(`Die STEP-Datei des Maueranschlussteils konnte nicht gelesen werden (Status ${statusValue}).`)
      }
      if (reader.NbRootsForTransfer() < 1) {
        throw new Error('Die STEP-Datei des Maueranschlussteils enthält keine übertragbaren Bauteile.')
      }
      const progress = new oc.Message_ProgressRange_1()
      let transferred: number
      try {
        transferred = reader.TransferRoots(progress)
      } finally {
        progress.delete()
      }
      if (transferred < 1) {
        throw new Error('OpenCascade konnte das Maueranschlussteil nicht aus der STEP-Datei übertragen.')
      }
      const shape = reader.OneShape()
      if (shape.IsNull()) {
        shape.delete()
        throw new Error('OpenCascade hat eine leere Geometrie für das Maueranschlussteil erzeugt.')
      }
      return shape
    } finally {
      reader.delete()
    }
  } finally {
    if (oc.FS.analyzePath(SPIDI_FILE_PATH).exists) oc.FS.unlink(SPIDI_FILE_PATH)
  }
}

function transformSpidiConnector(
  shape: OpenCascadeShape,
  placement: UkAngleConnectorPlacement,
  bounds: NonNullable<UkMountingExportData['connectorBounds']>,
  wallOffset: number,
  facadeWidth: number,
  facadeHeight: number,
  frontEdgeProfile: ProfileDefinition,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
): OpenCascadeShape {
  const transform = new oc.gp_Trsf_1()
  try {
    transform.SetValues(...getSpidiConnectorTransforms(
      placement,
      bounds,
      wallOffset,
      facadeWidth,
      facadeHeight,
      getProfileFrontEdgeY(frontEdgeProfile),
    ).cad)
    const builder = new oc.BRepBuilderAPI_Transform_2(shape, transform, true)
    try {
      if (!builder.IsDone()) throw new Error('Die Transformation eines Maueranschlussteils ist fehlgeschlagen.')
      const transformed = builder.Shape()
      if (transformed.IsNull()) {
        transformed.delete()
        throw new Error('Die Transformation hat einen leeren Maueranschlusskörper erzeugt.')
      }
      return transformed
    } finally {
      builder.delete()
    }
  } finally {
    transform.delete()
  }
}

function buildPolygonWire(
  points: Point2D[],
  project: (point: Point2D) => [number, number, number],
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
) {
  if (points.length < 3) {
    throw new Error('Eine Profilkontur enthält weniger als drei Eckpunkte.')
  }

  const polygon = new oc.BRepBuilderAPI_MakePolygon_1()
  try {
    for (const point of points) {
      const [x, y, z] = project(point)
      const cadPoint = new oc.gp_Pnt_3(x, y, z)
      try {
        polygon.Add_1(cadPoint)
      } finally {
        cadPoint.delete()
      }
    }
    polygon.Close()
    if (!polygon.IsDone()) {
      throw new Error('OpenCascade konnte eine geschlossene Profilkontur nicht erzeugen.')
    }
    return polygon.Wire()
  } finally {
    polygon.delete()
  }
}

function buildFace(
  contours: ProfileContour[],
  project: (point: Point2D) => [number, number, number],
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
) {
  const [outer, ...holes] = contours
  if (!outer) {
    throw new Error('Das Profil enthält keine Außenkontur.')
  }

  const outerWire = buildPolygonWire(outer.points, project, oc)
  const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(outerWire, true)
  outerWire.delete()
  try {
    for (const hole of holes) {
      const holeWire = buildPolygonWire(hole.points, project, oc)
      try {
        faceMaker.Add(holeWire)
      } finally {
        holeWire.delete()
      }
    }
    if (!faceMaker.IsDone()) {
      throw new Error('OpenCascade konnte die Profilfläche mit ihren Konturen nicht erzeugen.')
    }
    return faceMaker.Face()
  } finally {
    faceMaker.delete()
  }
}

function extrudeFace(
  face: OpenCascadeFace,
  vector: [number, number, number],
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
) {
  const direction = new oc.gp_Vec_4(...vector)
  try {
    const prism = new oc.BRepPrimAPI_MakePrism_1(face, direction, true, true)
    face.delete()
    try {
      const progress = new oc.Message_ProgressRange_1()
      try {
        prism.Build(progress)
      } finally {
        progress.delete()
      }
      if (!prism.IsDone()) {
        throw new Error('OpenCascade konnte das Profil nicht zu einem Volumenkörper extrudieren.')
      }
      return prism.Shape()
    } finally {
      prism.delete()
    }
  } finally {
    direction.delete()
  }
}

function buildProfileSolid(
  request: StepExportRequest,
  placement: ProfilePlacement,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
) {
  const profile = placement.profile
  const endGap = getEndGap(request.configuration)
  const clipContour = (contour: ProfileContour): ProfileContour => {
    let points = contour.points
    if (placement.leftTrimX !== undefined) {
      points = clipPolygonAtX(points, placement.leftTrimX, true)
    }
    if (placement.rightTrimX !== undefined) {
      points = clipPolygonAtX(points, placement.rightTrimX, false)
    }
    return { ...contour, points }
  }
  const contours = profile.source === 'example' && profile.contours.length === 0
    ? [{
      area: profile.width * profile.depth,
      points: [
        { x: -profile.width / 2, y: -profile.depth / 2 },
        { x: profile.width / 2, y: -profile.depth / 2 },
        { x: profile.width / 2, y: profile.depth / 2 },
        { x: -profile.width / 2, y: profile.depth / 2 },
      ],
    }]
    : profile.contours
  const trimmedContours = contours.map(clipContour).filter((contour) => contour.points.length >= 3)
  if (trimmedContours.length === 0) {
    throw new Error(`Das Profil „${profile.name}“ wird durch die gewählte Endausbildung vollständig abgeschnitten.`)
  }
  const face = buildFace(
    trimmedContours,
    (point) => [
      placement.axisX + request.configuration.width / 2 + (placement.profileOffsetX ?? 0) + point.x,
      getProfileDepthCoordinate(profile, point.y) + (placement.depthOffset ?? 0),
      request.wallContour ? 0 : endGap,
    ],
    oc,
  )
  const profileLength = request.configuration.height - (request.wallContour ? 0 : 2 * endGap)
  if (profileLength <= 0) {
    face.delete()
    throw new Error('Die Fassadenhöhe ist für den gewählten oberen und unteren Montagespalt zu gering.')
  }
  return extrudeFace(face, [0, 0, profileLength], oc)
}

function clipPolygonAtX(points: Point2D[], x: number, keepGreater: boolean): Point2D[] {
  if (points.length === 0) return []
  const clipped: Point2D[] = []
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const previous = points[(index + points.length - 1) % points.length]
    const currentDistance = (current.x - x) * (keepGreater ? 1 : -1)
    const previousDistance = (previous.x - x) * (keepGreater ? 1 : -1)
    const currentInside = currentDistance >= -1e-7
    const previousInside = previousDistance >= -1e-7
    if (currentInside !== previousInside) {
      const ratio = previousDistance / (previousDistance - currentDistance)
      clipped.push({
        x: previous.x + ratio * (current.x - previous.x),
        y: previous.y + ratio * (current.y - previous.y),
      })
    }
    if (currentInside) clipped.push(current)
  }
  return clipped.filter((point, index) => {
    const previous = clipped[(index + clipped.length - 1) % clipped.length]
    return Math.hypot(point.x - previous.x, point.y - previous.y) > 1e-7
  })
}

function buildWallSolid(
  wall: WallContour,
  depth: number,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
) {
  const wallFace = buildFace(
    [{ points: wall.points, area: 0 }],
    (point) => [point.x, -1, point.y],
    oc,
  )
  return extrudeFace(wallFace, [0, depth + 2, 0], oc)
}

function buildMasonryPart(
  points: Point2D[],
  backY: number,
  depth: number,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
) {
  const face = buildFace(
    [{ points, area: 0 }],
    (point) => [point.x, backY, point.y],
    oc,
  )
  return extrudeFace(face, [0, -depth, 0], oc)
}

function buildMasonryParts(
  request: StepExportRequest,
  options: MasonryViewConfiguration,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
) {
  const width = request.configuration.width
  const height = request.configuration.height
  const contour: WallContour = request.wallContour ?? {
    name: 'Fassade',
    width,
    height,
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
  }
  const xValues = [...new Set(contour.points.map(({ x }) => x))].sort((a, b) => a - b)
  const lowerEdge = xValues.map((x) => ({ x, y: getWallVerticalBounds(contour, x).bottom }))
  const upperEdge = xValues.map((x) => ({ x, y: getWallVerticalBounds(contour, x).top }))
  const sideActive = options.sideEnabled && options.sideWidth > 0
  const extendedLowerEdge = sideActive
    ? [
        { x: -options.sideWidth, y: lowerEdge[0].y },
        ...lowerEdge,
        { x: contour.width + options.sideWidth, y: lowerEdge[lowerEdge.length - 1].y },
      ]
    : lowerEdge
  const extendedUpperEdge = sideActive
    ? [
        { x: -options.sideWidth, y: upperEdge[0].y },
        ...upperEdge,
        { x: contour.width + options.sideWidth, y: upperEdge[upperEdge.length - 1].y },
      ]
    : upperEdge
  const backY = options.facadeOffset + options.facadeDepth
  const parts: { shape: OpenCascadeShape; color: string }[] = []

  try {
    parts.push({ shape: buildMasonryPart(contour.points, backY, options.facadeDepth, oc), color: options.color })

    if (options.topEnabled && options.topHeight > 0) {
      const topY = Math.max(...extendedUpperEdge.map(({ y }) => y)) + options.topHeight
      const outline = [
        ...extendedUpperEdge,
        ...[...extendedUpperEdge].reverse().map(({ x }) => ({ x, y: topY })),
      ]
      parts.push({ shape: buildMasonryPart(outline, backY, options.facadeDepth + options.topDepth, oc), color: options.color })
    }

    if (sideActive) {
      for (const edgeX of [0, contour.width]) {
        const bounds = getWallVerticalBounds(contour, edgeX)
        const outerX = edgeX === 0 ? -options.sideWidth : contour.width + options.sideWidth
        parts.push({ shape: buildMasonryPart([
          { x: edgeX, y: bounds.bottom },
          { x: outerX, y: bounds.bottom },
          { x: outerX, y: bounds.top },
          { x: edgeX, y: bounds.top },
        ], backY, options.facadeDepth + options.sideDepth, oc), color: options.color })
      }
    }

    if (options.bottomEnabled && options.bottomType === 'wall' && options.bottomWallHeight > 0) {
      const bottomY = Math.min(...extendedLowerEdge.map(({ y }) => y)) - options.bottomWallHeight
      const outline = [
        ...extendedLowerEdge.map(({ x }) => ({ x, y: bottomY })),
        ...[...extendedLowerEdge].reverse(),
      ]
      parts.push({ shape: buildMasonryPart(outline, backY, options.facadeDepth + options.bottomWallDepth, oc), color: options.color })
    }

    if (options.bottomEnabled && options.bottomType === 'floor' && options.floorThickness > 0 && options.floorDepth > 0) {
      const floorY = Math.min(...extendedLowerEdge.map(({ y }) => y)) - options.floorThickness
      const outline = [
        ...extendedLowerEdge.map(({ x }) => ({ x, y: floorY })),
        ...[...extendedLowerEdge].reverse(),
      ]
      parts.push({
        shape: buildMasonryPart(outline, backY, options.floorDepth, oc),
        color: getFloorMaterialColor(options.floorMaterial),
      })
    }

    return parts
  } catch (error) {
    parts.forEach((part) => part.shape.delete())
    throw error
  }
}

function buildUkRailSolid(
  profile: UkRailProfile,
  placement: UkRailPlacement,
  profileDepth: number,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
) {
  const face = buildFace(
    profile.contours,
    (point) => [
      placement.startX,
      profileDepth + UK_RAIL_PROFILE_CLEARANCE + point.x,
      placement.centerHeight + point.y,
    ],
    oc,
  )
  return extrudeFace(face, [placement.endX - placement.startX, 0, 0], oc)
}

function buildSupportRailSolid(
  profile: SupportRailProfile,
  piece: SupportRailPiece,
  rearDepth: number,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
) {
  const low = -profile.supportHeight - 5
  const high = profile.height - profile.supportHeight + 5
  const startT = Math.min(...[low, high].map((height) => getSupportRailCutPosition(piece.startCut, height))) - 5
  const endT = Math.max(...[low, high].map((height) => getSupportRailCutPosition(piece.endCut, height))) + 5
  const sweep = buildFace(
    profile.contours,
    (point) => {
      const height = point.y - profile.supportHeight
      return [
        piece.origin.x + startT * piece.direction.x + height * piece.normal.x,
        rearDepth - point.x,
        piece.origin.y + startT * piece.direction.y + height * piece.normal.y,
      ]
    },
    oc,
  )
  const sweepSolid = extrudeFace(sweep, [
    (endT - startT) * piece.direction.x,
    0,
    (endT - startT) * piece.direction.y,
  ], oc)

  const outline = [
    getSupportRailCorner(piece, 'start', low),
    getSupportRailCorner(piece, 'end', low),
    getSupportRailCorner(piece, 'end', high),
    getSupportRailCorner(piece, 'start', high),
  ]
  const frontY = rearDepth - profile.depth - 5
  const limiter = extrudeFace(
    buildFace(
      [{ points: outline, area: 0 }],
      (point) => [point.x, frontY, point.y],
      oc,
    ),
    [0, profile.depth + 10, 0],
    oc,
  )

  const progress = new oc.Message_ProgressRange_1()
  const common = new oc.BRepAlgoAPI_Common_3(sweepSolid, limiter, progress)
  sweepSolid.delete()
  limiter.delete()
  try {
    common.Build(progress)
    if (!common.IsDone()) {
      throw new Error('Der Gehrungsschnitt der Auflager-Schiene ist fehlgeschlagen.')
    }
    return common.Shape()
  } finally {
    common.delete()
    progress.delete()
  }
}

function cutCircularRailHoles(
  railSolid: OpenCascadeShape,
  fixings: UkRailFixingPlacement[],
  holeDiameter: number,
  depthStart: number,
  railDepth: number,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
): OpenCascadeShape {
  let result = railSolid
  const radius = holeDiameter / 2
  const holeSegments = 96
  for (const fixing of fixings) {
    const circle = Array.from({ length: holeSegments }, (_, index) => {
      const angle = index * Math.PI * 2 / holeSegments
      return {
        x: fixing.x + radius * Math.cos(angle),
        y: fixing.centerHeight + radius * Math.sin(angle),
      }
    })
    const cutterFace = buildFace(
      [{ points: circle, area: Math.PI * radius ** 2 }],
      (point) => [point.x, depthStart - 1, point.y],
      oc,
    )
    const cutter = extrudeFace(cutterFace, [0, railDepth + 2, 0], oc)
    const progress = new oc.Message_ProgressRange_1()
    const cut = new oc.BRepAlgoAPI_Cut_3(result, cutter, progress)
    result.delete()
    cutter.delete()
    try {
      cut.Build(progress)
      if (!cut.IsDone()) {
        throw new Error(`Das Befestigungsloch bei ${Math.round(fixing.x)} mm konnte nicht in die UK-Schiene gebohrt werden.`)
      }
      result = cut.Shape()
      if (result.IsNull()) {
        throw new Error(`Das Befestigungsloch bei ${Math.round(fixing.x)} mm hat die UK-Schiene ungültig gemacht.`)
      }
    } finally {
      cut.delete()
      progress.delete()
    }
  }
  return result
}

function buildUkAngleSolid(
  profile: NonNullable<UkMountingExportData['angleProfile']>,
  placement: UkMountingExportData['anglePlacements'][number],
  profileDepth: number,
  railDepth: number,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
): OpenCascadeShape {
  const face = buildFace(
    getUkAngleProfileContours(profile, placement.mirrored ?? false),
    (point) => [
      placement.centerX + point.x,
      profileDepth + UK_RAIL_PROFILE_CLEARANCE + railDepth + point.y,
      placement.startHeight,
    ],
    oc,
  )
  return extrudeFace(face, [0, 0, placement.endHeight - placement.startHeight], oc)
}

function buildPlasticBlockSolid(
  fixing: UkRailFixingPlacement,
  depthStart: number,
  blockDepth: number,
  holeDiameter: number,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
): OpenCascadeShape {
  const halfSize = 30
  const radius = holeDiameter / 2
  const holeSegments = 96
  const holePoints = Array.from({ length: holeSegments }, (_, index) => {
    const angle = -index * Math.PI * 2 / holeSegments
    return {
      x: fixing.x + radius * Math.cos(angle),
      y: fixing.centerHeight + radius * Math.sin(angle),
    }
  })
  const face = buildFace(
    [
      {
        area: 60 * 60,
        points: [
          { x: fixing.x - halfSize, y: fixing.centerHeight - halfSize },
          { x: fixing.x + halfSize, y: fixing.centerHeight - halfSize },
          { x: fixing.x + halfSize, y: fixing.centerHeight + halfSize },
          { x: fixing.x - halfSize, y: fixing.centerHeight + halfSize },
        ],
      },
      { area: -Math.PI * radius ** 2, points: holePoints },
    ],
    (point) => [point.x, depthStart, point.y],
    oc,
  )
  return extrudeFace(face, [0, blockDepth, 0], oc)
}

function buildSquareTimberSolid(
  timber: SquareTimberPlacement,
  depthStart: number,
  holeDiameter: number,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
): OpenCascadeShape {
  const half = timber.width / 2
  const side = timber.depth
  const radius = holeDiameter / 2
  const holeSegments = 96
  const holes = timber.holeHeights.map((height) => ({
    area: -Math.PI * radius ** 2,
    points: Array.from({ length: holeSegments }, (_, index) => {
      const angle = -index * Math.PI * 2 / holeSegments
      return { x: timber.x + radius * Math.cos(angle), y: height + radius * Math.sin(angle) }
    }),
  }))
  const face = buildFace(
    [
      {
        area: timber.width * (timber.top - timber.bottom),
        points: [
          { x: timber.x - half, y: timber.bottom },
          { x: timber.x + half, y: timber.bottom },
          { x: timber.x + half, y: timber.top },
          { x: timber.x - half, y: timber.top },
        ],
      },
      ...holes,
    ],
    (point) => [point.x, depthStart, point.y],
    oc,
  )
  return extrudeFace(face, [0, side, 0], oc)
}

function buildDirectMountScrewCylinder(
  fixing: UkRailFixingPlacement,
  radius: number,
  startDepth: number,
  length: number,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
): OpenCascadeShape {
  const segments = 48
  const points = Array.from({ length: segments }, (_, index) => {
    const angle = -index * Math.PI * 2 / segments
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
  })
  const face = buildFace(
    [{ points, area: Math.PI * radius ** 2 }],
    (point) => [fixing.x + point.x, startDepth, fixing.centerHeight + point.y],
    oc,
  )
  return extrudeFace(face, [0, length, 0], oc)
}

function fuseDirectMountScrew(
  head: OpenCascadeShape,
  shaft: OpenCascadeShape,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
): OpenCascadeShape {
  const progress = new oc.Message_ProgressRange_1()
  const fuse = new oc.BRepAlgoAPI_Fuse_3(head, shaft, progress)
  try {
    fuse.Build(progress)
    if (!fuse.IsDone()) {
      throw new Error('Schraubenkopf und Schaft konnten im STEP-Export nicht vereinigt werden.')
    }
    const screw = fuse.Shape()
    if (screw.IsNull()) {
      throw new Error('Die vereinigte Schraube ist leer.')
    }
    return screw
  } finally {
    fuse.delete()
    progress.delete()
  }
}

function countAndValidateSolids(
  shape: OpenCascadeShape,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
) {
  if (shape.IsNull()) {
    throw new Error('Ein Profil liegt außerhalb der Mauerkontur oder erzeugt keinen Volumenkörper.')
  }
  const analyzer = new oc.BRepCheck_Analyzer(shape, true, false)
  try {
    if (!analyzer.IsValid_2()) {
      throw new Error('OpenCascade hat einen ungültigen B-Rep-Volumenkörper erzeugt.')
    }
  } finally {
    analyzer.delete()
  }

  const explorer = new oc.TopExp_Explorer_2(
    shape,
    getEnumEntry<OpenCascadeShapeEnum>(oc.TopAbs_ShapeEnum, 'TopAbs_SOLID'),
    getEnumEntry<OpenCascadeShapeEnum>(oc.TopAbs_ShapeEnum, 'TopAbs_SHAPE'),
  )
  let count = 0
  try {
    while (explorer.More()) {
      count += 1
      explorer.Next()
    }
  } finally {
    explorer.delete()
  }
  if (count === 0) {
    throw new Error('Ein Profil enthält nach dem Zuschnitt keinen geschlossenen Volumenkörper.')
  }
  return count
}

function transferColoredShape(
  shape: OpenCascadeShape,
  colorHex: string,
  writer: OpenCascadeStepWriter,
  solidColors: string[],
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
) {
  if (!/^#[0-9a-f]{6}$/i.test(colorHex)) {
    throw new Error(`Ungültige STEP-Bauteilfarbe: ${colorHex}`)
  }

  const solidCount = countAndValidateSolids(shape, oc)
  const transferProgress = new oc.Message_ProgressRange_1()
  let transferStatus: OpenCascadeReturnStatus
  try {
    transferStatus = writer.Transfer(
      shape,
      getEnumEntry<OpenCascadeStepModelType>(oc.STEPControl_StepModelType, 'STEPControl_AsIs'),
      true,
      transferProgress,
    )
  } finally {
    transferProgress.delete()
  }
  const transferStatusValue = getEnumNumber(transferStatus)
  const doneStatusValue = getEnumNumber(
    getEnumEntry<OpenCascadeReturnStatus>(oc.IFSelect_ReturnStatus, 'IFSelect_RetDone'),
  )
  if (transferStatusValue !== doneStatusValue) {
    throw new Error(`OpenCascade konnte ein STEP-Bauteil nicht übernehmen (Status ${transferStatusValue}).`)
  }
  solidColors.push(...Array.from({ length: solidCount }, () => colorHex))
  return solidCount
}

function writeStepFile(
  writer: OpenCascadeStepWriter,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
  expectedProductCount: number,
  solidColors: string[],
) {
  const fileSystem = oc.FS
  const originalOpen = fileSystem.open
  let redirected = false
  let writeStatus = -1

  try {
    fileSystem.open = (path, flags, mode) => {
      if (!redirected) {
        redirected = true
        return originalOpen.call(fileSystem, STEP_FILE_PATH, flags, mode)
      }
      return originalOpen.call(fileSystem, path, flags, mode)
    }
    writeStatus = getEnumNumber(writer.Write(STEP_FILE_PATH))
  } finally {
    fileSystem.open = originalOpen
  }

  if (!redirected) {
    throw new Error('OpenCascade hat beim Schreiben keine STEP-Datei geöffnet.')
  }
  if (
    writeStatus !==
    getEnumNumber(getEnumEntry<OpenCascadeReturnStatus>(oc.IFSelect_ReturnStatus, 'IFSelect_RetDone'))
  ) {
    throw new Error(`OpenCascade konnte die STEP-Datei nicht schreiben (Status ${writeStatus}).`)
  }

  try {
    if (!fileSystem.analyzePath(STEP_FILE_PATH).exists) {
      throw new Error('OpenCascade meldete einen erfolgreichen STEP-Export, aber die Datei fehlt.')
    }
    const data = fileSystem.readFile(STEP_FILE_PATH)
    const text = new TextDecoder().decode(data)
    if (!text.startsWith(STEP_HEADER) || !text.trimEnd().endsWith(STEP_FOOTER)) {
      throw new Error('Die erzeugte Datei besitzt keinen vollständigen STEP-Dateikopf und -abschluss.')
    }
    const dataEndIndex = text.lastIndexOf('ENDSEC;')
    if (dataEndIndex <= text.indexOf('DATA;')) {
      throw new Error('Die STEP-Datei enthält keinen gültigen DATA-Abschnitt für Bauteilfarben.')
    }
    const exportText = text
    const productCount = (exportText.match(/\bPRODUCT\s*\(/g) ?? []).length
    if (productCount !== expectedProductCount) {
      throw new Error(`Die STEP-Datei enthält ${productCount} statt ${expectedProductCount} erwarteter Bauteile.`)
    }
    const solidIds = Array.from(
      exportText.matchAll(/^\s*#(\d+)\s*=\s*MANIFOLD_SOLID_BREP\s*\(/gm),
      (match) => match[1],
    )
    if (solidIds.length !== solidColors.length) {
      throw new Error('Die STEP-Datei enthält nicht alle erzeugten geschlossenen B-Rep-Volumenkörper.')
    }

    const entityIds = Array.from(exportText.matchAll(/^\s*#(\d+)\s*=/gm), (match) => Number(match[1]))
    if (entityIds.length === 0) throw new Error('Die STEP-Datei enthält keine STEP-Entitäten.')
    let nextEntityId = entityIds.reduce((maximum, entityId) => Math.max(maximum, entityId), 0)
    const colorStyles = new Map<string, number>()
    const styleEntities: string[] = []
    const getStyleAssignment = (colorHex: string) => {
      const existing = colorStyles.get(colorHex)
      if (existing !== undefined) return existing

      const match = /^#([0-9a-f]{6})$/i.exec(colorHex)
      if (!match) throw new Error(`Ungültige STEP-Bauteilfarbe: ${colorHex}`)
      const [red, green, blue] = [0, 2, 4].map(
        (offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255,
      )
      const colorId = ++nextEntityId
      const fillColorId = ++nextEntityId
      const fillStyleId = ++nextEntityId
      const surfaceFillId = ++nextEntityId
      const surfaceSideId = ++nextEntityId
      const surfaceUsageId = ++nextEntityId
      const assignmentId = ++nextEntityId
      styleEntities.push(
        `#${colorId}=COLOUR_RGB('',${red.toFixed(6)},${green.toFixed(6)},${blue.toFixed(6)});`,
        `#${fillColorId}=FILL_AREA_STYLE_COLOUR('',#${colorId});`,
        `#${fillStyleId}=FILL_AREA_STYLE('',(#${fillColorId}));`,
        `#${surfaceFillId}=SURFACE_STYLE_FILL_AREA(#${fillStyleId});`,
        `#${surfaceSideId}=SURFACE_SIDE_STYLE('',(#${surfaceFillId}));`,
        `#${surfaceUsageId}=SURFACE_STYLE_USAGE(.BOTH.,#${surfaceSideId});`,
        `#${assignmentId}=PRESENTATION_STYLE_ASSIGNMENT((#${surfaceUsageId}));`,
      )
      colorStyles.set(colorHex, assignmentId)
      return assignmentId
    }

    for (const [index, solidId] of solidIds.entries()) {
      const assignmentId = getStyleAssignment(solidColors[index])
      styleEntities.push(`#${++nextEntityId}=STYLED_ITEM('',(#${assignmentId}),#${solidId});`)
    }
    const styledDataEndIndex = exportText.lastIndexOf('ENDSEC;')
    const coloredText = `${exportText.slice(0, styledDataEndIndex)}${styleEntities.join('\n')}\n${exportText.slice(styledDataEndIndex)}`
    if (!coloredText.includes('COLOUR_RGB') || !coloredText.includes('STYLED_ITEM')) {
      throw new Error('Die STEP-Datei enthält keine zugewiesenen Bauteilfarben.')
    }
    return new TextEncoder().encode(coloredText)
  } finally {
    if (fileSystem.analyzePath(STEP_FILE_PATH).exists) fileSystem.unlink(STEP_FILE_PATH)
  }
}

async function createStepExport(request: StepExportRequest) {
  postProgress('CAD-Kernel wird geladen (ca. 66 MB)...', 0)
  const oc = await withTimeout(
    initOpenCascade(),
    KERNEL_START_TIMEOUT_MS,
    'Der CAD-Kernel konnte nicht gestartet werden (Zeitüberschreitung). Bitte Seite neu laden und erneut versuchen; ggf. andere Browser-Tabs schließen.',
  )
  postProgress('CAD-Kernel geladen. Modell wird vorbereitet...', 8)
  if (!oc.STEPControl_Controller.Init()) {
    throw new Error('Der STEP-Export konnte nicht initialisiert werden.')
  }

  if (request.placements.length === 0) {
    throw new Error('Für den STEP-Export wurde keine gültige Profilanordnung übergeben.')
  }

  const writer = new oc.STEPControl_Writer_1()
  const solidColors: string[] = []
  try {
    let wallSolid: OpenCascadeShape | undefined
    let masonryParts: { shape: OpenCascadeShape; color: string }[] = []
    let expectedProductCount = request.placements.length
    try {
      if (request.wallContour) {
        postProgress('Mauerkontur wird als CAD-Volumen aufgebaut...', 10)
        const maximumDepth = getFacadeProfileDepth(request.configuration.profile, request.placements)
        wallSolid = buildWallSolid(
          insetWallContourVertically(request.wallContour, getEndGap(request.configuration)),
          maximumDepth,
          oc,
        )
      }

      const masonryView = request.configuration.masonryView ?? DEFAULT_MASONRY_VIEW
      if (masonryView.enabled) {
        postProgress('Mauer und aktivierte Anbauten werden als STEP-Volumenkörper aufgebaut...', 15)
        masonryParts = buildMasonryParts(request, masonryView, oc)
        for (const [index, part] of masonryParts.entries()) {
          postProgress(`Mauerbauteil ${index + 1}/${masonryParts.length} wird übertragen...`, 16 + (index / Math.max(1, masonryParts.length)) * 8)
          try {
            transferColoredShape(part.shape, part.color, writer, solidColors, oc)
          } catch (error) {
            throw new Error(`Mauerbauteil ${index + 1} konnte nicht in das STEP-Modell übernommen werden.`, { cause: error })
          }
          expectedProductCount += 1
        }
      }

      if ((request.configuration.ukRailView ?? DEFAULT_UK_RAIL_VIEW).enabled) {
        const profile = request.ukRailProfile
        if (!profile || request.ukRailPlacements.length === 0) {
          throw new Error('Für den STEP-Export ist keine gültige UK-Schienenkontur und -positionierung verfügbar.')
        }
        const mounting = request.ukMountingData
        if (!mounting) {
          throw new Error('Für den STEP-Export fehlen die Montageangaben der Unterkonstruktion.')
        }
        const selectedMountingMethod = request.configuration.ukRailView?.mountingMethod ?? 'direct-to-wall'
        if (mounting.mountingMethod !== selectedMountingMethod) {
          throw new Error('Die Montageart der Unterkonstruktion stimmt nicht mehr mit der Auswahl überein. Bitte erneut exportieren.')
        }
        const profileDepth = getFacadeProfileDepth(request.configuration.profile, request.placements)
        for (const [index, placement] of request.ukRailPlacements.entries()) {
          postProgress(`UK-Schienenstück ${index + 1}/${request.ukRailPlacements.length} wird als B-Rep berechnet...`, 25 + ((index + 1) / request.ukRailPlacements.length) * 18)
          let railSolid = buildUkRailSolid(
            profile,
            placement,
            profileDepth,
            oc,
          )
          if (mounting.mountingMethod === 'direct-to-wall') {
            const railFixings = mounting.fixings.filter((fixing) =>
              fixing.centerHeight === placement.centerHeight
              && fixing.x >= placement.startX - 1e-7
              && fixing.x <= placement.endX + 1e-7,
            )
            railSolid = cutCircularRailHoles(
              railSolid,
              railFixings,
              mounting.holeDiameter,
              profileDepth + UK_RAIL_PROFILE_CLEARANCE,
              profile.depth,
              oc,
            )
          }
          try {
            transferColoredShape(railSolid, UK_INFO_COLORS.rail, writer, solidColors, oc)
            expectedProductCount += 1
          } finally {
            railSolid.delete()
          }
        }
        if (selectedMountingMethod === 'direct-to-wall') {
          for (const [index, fixing] of mounting.fixings.entries()) {
            const componentProgress = 44 + (index / Math.max(1, mounting.fixings.length)) * 16
            postProgress(`Schraube ${index + 1}/${mounting.fixings.length} wird als CAD-Volumenkörper aufgebaut...`, componentProgress)
            const head = buildDirectMountScrewCylinder(
              fixing,
              DIRECT_MOUNT_SCREW_HEAD_DIAMETER_MM / 2,
              profileDepth + UK_RAIL_PROFILE_CLEARANCE + profile.screwHeadPlaneDepth - DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM,
              DIRECT_MOUNT_SCREW_HEAD_LENGTH_MM,
              oc,
            )
            let shaft: OpenCascadeShape | undefined
            let screw: OpenCascadeShape | undefined
            try {
              shaft = buildDirectMountScrewCylinder(
                fixing,
                DIRECT_MOUNT_SCREW_SHAFT_DIAMETER_MM / 2,
                profileDepth + UK_RAIL_PROFILE_CLEARANCE + profile.screwHeadPlaneDepth,
                DIRECT_MOUNT_SCREW_SHAFT_LENGTH_MM,
                oc,
              )
              screw = fuseDirectMountScrew(head, shaft, oc)
              const screwSolidCount = transferColoredShape(screw, '#FF0000', writer, solidColors, oc)
              if (screwSolidCount !== 1) {
                throw new Error(`Die Schraube besteht nach der Vereinigung aus ${screwSolidCount} statt einem Volumenkörper.`)
              }
              expectedProductCount += 1
            } finally {
              head.delete()
              shaft?.delete()
              screw?.delete()
            }
            if (mounting.squareTimbers.length > 0) continue
            postProgress(`Kunststoffklotz ${index + 1}/${mounting.fixings.length} wird als B-Rep aufgebaut...`, componentProgress + 8 / Math.max(1, mounting.fixings.length))
            const blockSolid = buildPlasticBlockSolid(
              fixing,
              profileDepth + UK_RAIL_PROFILE_CLEARANCE + profile.depth,
              mounting.plasticBlockDepth,
              mounting.holeDiameter + 2,
              oc,
            )
            try {
              transferColoredShape(blockSolid, UK_INFO_COLORS.block, writer, solidColors, oc)
              expectedProductCount += 1
            } finally {
              blockSolid.delete()
            }
          }
          for (const [index, timber] of mounting.squareTimbers.entries()) {
            postProgress(`Kantholz ${index + 1}/${mounting.squareTimbers.length} wird als B-Rep aufgebaut...`, 58)
            const timberSolid = buildSquareTimberSolid(
              timber,
              profileDepth + UK_RAIL_PROFILE_CLEARANCE + profile.depth,
              mounting.holeDiameter + 2,
              oc,
            )
            try {
              transferColoredShape(timberSolid, UK_INFO_COLORS.timber, writer, solidColors, oc)
              expectedProductCount += 1
            } finally {
              timberSolid.delete()
            }
          }
        } else if (selectedMountingMethod === 'aluminum-substructure') {
          const angleProfile = mounting.angleProfile
          if (!angleProfile) throw new Error('Für die Alu-UK fehlt die DXF-Kontur der L-Winkel.')
          if (mounting.anglePlacements.length === 0) {
            throw new Error('Für die Alu-UK wurden keine L-Winkel positioniert.')
          }
          if (mounting.connectorPlacements.length === 0) {
            throw new Error('Für die Alu-UK wurden keine Maueranschlussteile positioniert.')
          }
          for (const [index, placement] of mounting.anglePlacements.entries()) {
            postProgress(`L-Winkel ${index + 1}/${mounting.anglePlacements.length} wird als B-Rep aufgebaut...`, 44 + ((index + 1) / mounting.anglePlacements.length) * 16)
            const angleSolid = buildUkAngleSolid(
              angleProfile,
              placement,
              profileDepth,
              profile.depth,
              oc,
            )
            try {
              transferColoredShape(angleSolid, UK_INFO_COLORS.angle, writer, solidColors, oc)
              expectedProductCount += 1
            } finally {
              angleSolid.delete()
            }
          }
          const connectorBounds = mounting.connectorBounds
          if (!connectorBounds) {
            throw new Error('Für die Maueranschlussteile fehlen die importierten Bauteilabmessungen.')
          }
          postProgress('Maueranschlussteil wird geladen...', 60)
          const connectorLength = mounting.connectorLength
          if (connectorLength === null) {
            throw new Error('Für die Maueranschlussteile fehlt die gewählte Spidi-Länge.')
          }
          const connectorShape = await loadSpidiConnectorShape(connectorLength, oc)
          try {
            const wallOffset = request.configuration.masonryView?.facadeOffset
              ?? DEFAULT_MASONRY_VIEW.facadeOffset
            for (const [index, placement] of mounting.connectorPlacements.entries()) {
              postProgress(
                `Maueranschlussteil ${index + 1}/${mounting.connectorPlacements.length} wird positioniert...`,
                60 + ((index + 1) / mounting.connectorPlacements.length) * 2,
              )
              const connectorSolid = transformSpidiConnector(
                connectorShape,
                placement,
                connectorBounds,
                wallOffset,
                request.configuration.width,
                request.configuration.height,
                request.configuration.profile,
                oc,
              )
              try {
                transferColoredShape(
                  connectorSolid,
                  request.profileDisplayMode === 'facadeColor'
                    ? UK_CONNECTOR_FACADE_COLOR
                    : UK_INFO_COLORS.connector,
                  writer,
                  solidColors,
                  oc,
                )
                expectedProductCount += 1
              } finally {
                connectorSolid.delete()
              }
            }
          } finally {
            connectorShape.delete()
          }
        }
        const supportRailProfile = mounting.supportRailProfile
        if (!supportRailProfile || mounting.supportRailPieces.length === 0) {
          throw new Error('Es fehlt die Auflager-Schiene.')
        }
        const supportRailRearDepth = profileDepth + UK_RAIL_PROFILE_CLEARANCE + profile.depth
        for (const [index, piece] of mounting.supportRailPieces.entries()) {
          postProgress(
            `Auflager-Schiene ${index + 1}/${mounting.supportRailPieces.length} wird berechnet...`,
            62,
          )
          const railSolid = buildSupportRailSolid(supportRailProfile, piece, supportRailRearDepth, oc)
          try {
            transferColoredShape(
              railSolid,
              request.profileDisplayMode === 'facadeColor'
                ? request.configuration.profileColor
                : UK_INFO_COLORS.rail,
              writer,
              solidColors,
              oc,
            )
            expectedProductCount += 1
          } finally {
            railSolid.delete()
          }
        }
      }

      for (const [index, placement] of request.placements.entries()) {
        postProgress(`Profil ${index + 1}/${request.placements.length} wird als B-Rep berechnet...`, 62 + ((index + 1) / request.placements.length) * 30)
        let profileSolid = buildProfileSolid(request, placement, oc)
        if (wallSolid) {
          const progress = new oc.Message_ProgressRange_1()
          const common = new oc.BRepAlgoAPI_Common_3(profileSolid, wallSolid, progress)
          profileSolid.delete()
          try {
            common.Build(progress)
            if (!common.IsDone()) {
              throw new Error(`Der Mauerkontur-Zuschnitt für Profil ${index + 1} ist fehlgeschlagen.`)
            }
            profileSolid = common.Shape()
          } finally {
            common.delete()
            progress.delete()
          }
        }

        try {
          const spacingDeviation = request.spacingDeviations[placement.layoutIndex - 1] ?? 0
          transferColoredShape(
            profileSolid,
            getProfileInfoColor(spacingDeviation, placement.isSwitchProfile),
            writer,
            solidColors,
            oc,
          )
        } finally {
          profileSolid.delete()
        }
      }
    } finally {
      wallSolid?.delete()
      masonryParts.forEach((part) => part.shape.delete())
    }

    postProgress('STEP-Datei wird geschrieben und geprüft...', 95)
    const data = writeStepFile(writer, oc, expectedProductCount, solidColors)
    postProgress('STEP-Datei wurde geschrieben und geprüft.', 100)
    return data
  } finally {
    writer.delete()
  }
}

self.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason
  self.postMessage({ type: 'error', message: reason instanceof Error ? reason.message : 'Der STEP-Export ist fehlgeschlagen.' })
})

self.onmessage = (event: MessageEvent<StepExportRequest>) => {
  void createStepExport(event.data)
    .then((data) => {
      const transferable = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      self.postMessage({ type: 'result', data: transferable }, { transfer: [transferable] })
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Der STEP-Export ist fehlgeschlagen.'
      self.postMessage({ type: 'error', message })
    })
}
