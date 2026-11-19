import initOpenCascade from 'opencascade.js'
import type { TopAbs_ShapeEnum, TopoDS_Shape } from 'opencascade.js'
import type { SlabStepRequest } from './slabStepExport'
import { COUNTERSINK_RADIUS, HOLE_CUTTER_TOP, HOLE_RADIUS, PROFILE_FLOOR_HEIGHT, profilePoint, sideFixingHeadInsetDistance, sideFixingNutOffset, sideFixingWallBounds } from '../domain/railingProfile'
import type { ProfilePart } from '../domain/railingProfile'
import { RAILING_SCREW_HEAD_HEIGHT, RAILING_SCREW_LENGTH, RAILING_SCREW_RADIUS, railingScrewPlacements } from '../domain/railingScrew'
import { SIDE_FIXING_AXIS_HEIGHT, SIDE_FIXING_BOLT_HEAD_DIAMETER, SIDE_FIXING_BOLT_HEAD_HEIGHT, SIDE_FIXING_BOLT_LENGTH, SIDE_FIXING_HOLE_DIAMETER, STEEL_PLATE_MARGIN, STEEL_PLATE_THICKNESS, type RailingMounting } from '../domain/railingMounting'
import { RAILING_COLORS, RAILING_GLASS_OPACITY } from '../domain/railingAppearance'
import { straightProfileExtrusion } from './straightProfileExtrusion'

const path = '/tmp/betondecke.step'

function reportProgress(message: string, progress: number) {
  self.postMessage({ type: 'progress', message, progress: Math.max(0, Math.min(99, progress)) })
}

function enumEntry<T>(object: object, key: string): T {
  const value = (object as Record<string, unknown>)[key]
  if (value === undefined) throw new Error(`OpenCascade: ${key} ist nicht verfügbar.`)
  return value as T
}

function makePrism(oc: Awaited<ReturnType<typeof initOpenCascade>>, points: Array<[number, number, number]>, vector: [number, number, number]): TopoDS_Shape {
  const polygon = new oc.BRepBuilderAPI_MakePolygon_1()
  try {
    for (const point of points) {
      const p = new oc.gp_Pnt_3(...point)
      try { polygon.Add_1(p) } finally { p.delete() }
    }
    polygon.Close()
    if (!polygon.IsDone()) throw new Error('Profilkontur konnte nicht geschlossen werden.')
    const wire = polygon.Wire()
    try {
      const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true)
      try {
        if (!faceMaker.IsDone()) throw new Error('Profilfläche konnte nicht erzeugt werden.')
        const face = faceMaker.Face()
        try {
          const direction = new oc.gp_Vec_4(...vector)
          try {
            const prism = new oc.BRepPrimAPI_MakePrism_1(face, direction, true, true)
            try {
              const progress = new oc.Message_ProgressRange_1()
              try { prism.Build(progress) } finally { progress.delete() }
              if (!prism.IsDone()) throw new Error('Profil konnte nicht extrudiert werden.')
              return prism.Shape()
            } finally { prism.delete() }
          } finally { direction.delete() }
        } finally { face.delete() }
      } finally { faceMaker.delete() }
    } finally { wire.delete() }
  } finally { polygon.delete() }
}

interface SideHoleCutter {
  x: number
  y: number
  z: number
  directionX: number
  directionY: number
  length: number
}

function cutSideHoles(
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
  shape: TopoDS_Shape,
  holes: SideHoleCutter[],
): TopoDS_Shape {
  const builder = new oc.BRep_Builder()
  const cutters = new oc.TopoDS_Compound()
  try {
    builder.MakeCompound(cutters)
    for (const hole of holes) {
      const point = new oc.gp_Pnt_3(hole.x, hole.y, hole.z)
      const direction = new oc.gp_Dir_4(hole.directionX, hole.directionY, 0)
      try {
        const axis = new oc.gp_Ax2_3(point, direction)
        try {
          const tool = new oc.BRepPrimAPI_MakeCylinder_3(axis, SIDE_FIXING_HOLE_DIAMETER / 2, hole.length)
          try {
            const cutter = tool.Shape()
            try { builder.Add(cutters, cutter) } finally { cutter.delete() }
          } finally { tool.delete() }
        } finally { axis.delete() }
      } finally { point.delete(); direction.delete() }
    }
    const progress = new oc.Message_ProgressRange_1()
    try {
      const cut = new oc.BRepAlgoAPI_Cut_3(shape, cutters, progress)
      try {
        if (!cut.IsDone()) throw new Error('Die seitlichen Bohrungen konnten nicht erzeugt werden.')
        const result = cut.Shape()
        if (result.IsNull()) {
          result.delete()
          throw new Error('Die seitlich gebohrte Kontur ist leer.')
        }
        return result
      } finally { cut.delete() }
    } finally { progress.delete() }
  } finally { cutters.delete(); builder.delete() }
}

function sideHoleCutters(parts: ProfilePart[], profileOnly: boolean): SideHoleCutter[] {
  return parts.flatMap((part) => {
    const normal = { x: part.direction.y, y: -part.direction.x }
    const wall = sideFixingWallBounds(part.section)
    return part.holes.map((hole) => {
      const start = profileOnly
        ? {
          x: hole.x + normal.x,
          y: hole.y + normal.y,
        }
        : {
          x: hole.x - normal.x,
          y: hole.y - normal.y,
        }
      return {
        x: start.x,
        y: start.y,
        z: SIDE_FIXING_AXIS_HEIGHT,
        directionX: profileOnly ? -normal.x : normal.x,
        directionY: profileOnly ? -normal.y : normal.y,
        length: profileOnly ? wall.outer - wall.inner + 2 : STEEL_PLATE_THICKNESS + 2,
      }
    })
  })
}

function makeSteelPlate(
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
  points: SlabStepRequest['points'],
  height: number,
  profiles: ProfilePart[],
): TopoDS_Shape {
  const body = makePrism(oc, points.map((point): [number, number, number] => [point.x, point.y, -STEEL_PLATE_MARGIN]), [0, 0, height])
  const holes = sideHoleCutters(profiles, false)
  if (holes.length === 0) return body
  try { return cutSideHoles(oc, body, holes) } finally { body.delete() }
}

function makeProfile(oc: Awaited<ReturnType<typeof initOpenCascade>>, part: ProfilePart, thickness: number, mounting: RailingMounting): TopoDS_Shape {
  const baseHeight = mounting === '7A' ? 0 : thickness
  const straight = straightProfileExtrusion(part, baseHeight)
  if (straight) {
    const prism = makePrism(oc, straight.section, straight.vector)
    if (part.holes.length === 0) return prism
    try {
      return mounting === '7A'
        ? cutSideHoles(oc, prism, sideHoleCutters([part], true))
        : cutProfileHoles(oc, prism, part, thickness)
    } finally { prism.delete() }
  }
  const width = Math.max(...part.section.map((point) => point.x))
  const height = Math.max(...part.section.map((point) => point.y))
  const endProjection = (part.end.x - part.start.x) * part.direction.x + (part.end.y - part.start.y) * part.direction.y
  const sweepStart = Math.min(0, endProjection)
  const length = Math.abs(endProjection)
  const margin = 10 + (part.offset + width + 1) * Math.max(
    Math.abs(part.startMiter.x * part.direction.x + part.startMiter.y * part.direction.y),
    Math.abs(part.endMiter.x * part.direction.x + part.endMiter.y * part.direction.y),
  )
  const normal = { x: part.direction.y, y: -part.direction.x }
  const section = part.section.map((point): [number, number, number] => [
    part.start.x + (sweepStart - margin) * part.direction.x + (part.offset + point.x) * normal.x,
    part.start.y + (sweepStart - margin) * part.direction.y + (part.offset + point.x) * normal.y,
    baseHeight + point.y,
  ])
  const prism = makePrism(oc, section, [part.direction.x * (length + 2 * margin), part.direction.y * (length + 2 * margin), 0])
  try {
    const footprint = [
      profilePoint(part, { x: -1, y: 0 }, false),
      profilePoint(part, { x: -1, y: 0 }, true),
      profilePoint(part, { x: width + 1, y: 0 }, true),
      profilePoint(part, { x: width + 1, y: 0 }, false),
    ].map((point): [number, number, number] => [point.x, point.y, baseHeight - 1])
    const cutter = makePrism(oc, footprint, [0, 0, height + 2])
    try {
      const progress = new oc.Message_ProgressRange_1()
      try {
        const common = new oc.BRepAlgoAPI_Common_3(prism, cutter, progress)
        try {
          if (!common.IsDone()) throw new Error('Die Profilgehrung konnte nicht erzeugt werden.')
          const mitered = common.Shape()
          if (part.holes.length === 0) return mitered
          try {
            return mounting === '7A'
              ? cutSideHoles(oc, mitered, sideHoleCutters([part], true))
              : cutProfileHoles(oc, mitered, part, thickness)
          } finally { mitered.delete() }
        } finally { common.delete() }
      } finally { progress.delete() }
    } finally { cutter.delete() }
  } finally { prism.delete() }
}

function cutProfileHoles(oc: Awaited<ReturnType<typeof initOpenCascade>>, profile: TopoDS_Shape, part: ProfilePart, thickness: number): TopoDS_Shape {
  const builder = new oc.BRep_Builder()
  const cylinders = new oc.TopoDS_Compound()
  const cones = new oc.TopoDS_Compound()
  const direction = new oc.gp_Dir_4(0, 0, 1)
  try {
    builder.MakeCompound(cylinders)
    builder.MakeCompound(cones)
    for (const hole of part.holes) {
      for (const sink of [false, true]) {
        const bottom = sink ? PROFILE_FLOOR_HEIGHT - (COUNTERSINK_RADIUS - HOLE_RADIUS) : -1
        const point = new oc.gp_Pnt_3(hole.x, hole.y, thickness + bottom)
        try {
          const axis = new oc.gp_Ax2_3(point, direction)
          try {
            const tool = sink
              ? new oc.BRepPrimAPI_MakeCone_3(axis, HOLE_RADIUS, COUNTERSINK_RADIUS + 1, HOLE_CUTTER_TOP - bottom)
              : new oc.BRepPrimAPI_MakeCylinder_3(axis, HOLE_RADIUS, HOLE_CUTTER_TOP - bottom)
            try {
              const shape = tool.Shape()
              try { builder.Add(sink ? cones : cylinders, shape) } finally { shape.delete() }
            } finally { tool.delete() }
          } finally { axis.delete() }
        } finally { point.delete() }
      }
    }
    let result = profile
    for (const cutter of [cylinders, cones]) {
      const progress = new oc.Message_ProgressRange_1()
      try {
        const cut = new oc.BRepAlgoAPI_Cut_3(result, cutter, progress)
        try {
          if (!cut.IsDone()) throw new Error('Die Profilbohrungen konnten nicht erzeugt werden.')
          const next = cut.Shape()
          if (next.IsNull()) {
            next.delete()
            throw new Error('Das gebohrte Profil ist leer.')
          }
          if (result !== profile) result.delete()
          result = next
        } finally { cut.delete() }
      } catch (error) {
        if (result !== profile) result.delete()
        throw error
      } finally { progress.delete() }
    }
    return result
  } finally {
    direction.delete()
    cones.delete()
    cylinders.delete()
    builder.delete()
  }
}

function makeScrew(oc: Awaited<ReturnType<typeof initOpenCascade>>): TopoDS_Shape {
  const polygon = new oc.BRepBuilderAPI_MakePolygon_1()
  try {
    for (const [radius, height] of [
      [0, -RAILING_SCREW_LENGTH],
      [RAILING_SCREW_RADIUS, -RAILING_SCREW_LENGTH],
      [RAILING_SCREW_RADIUS, -RAILING_SCREW_HEAD_HEIGHT],
      [COUNTERSINK_RADIUS, 0],
      [0, 0],
    ]) {
      const point = new oc.gp_Pnt_3(radius, 0, height)
      try { polygon.Add_1(point) } finally { point.delete() }
    }
    polygon.Close()
    if (!polygon.IsDone()) throw new Error('Das Schraubenprofil konnte nicht geschlossen werden.')
    const wire = polygon.Wire()
    try {
      const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true)
      try {
        if (!faceMaker.IsDone()) throw new Error('Die Schraubenfläche konnte nicht erzeugt werden.')
        const face = faceMaker.Face()
        try {
          const origin = new oc.gp_Pnt_3(0, 0, 0)
          const direction = new oc.gp_Dir_4(0, 0, 1)
          try {
            const axis = new oc.gp_Ax1_2(origin, direction)
            try {
              const revolution = new oc.BRepPrimAPI_MakeRevol_2(face, axis, true)
              try {
                const progress = new oc.Message_ProgressRange_1()
                try { revolution.Build(progress) } finally { progress.delete() }
                if (!revolution.IsDone()) throw new Error('Der Schraubenkörper konnte nicht erzeugt werden.')
                return revolution.Shape()
              } finally { revolution.delete() }
            } finally { axis.delete() }
          } finally { direction.delete(); origin.delete() }
        } finally { face.delete() }
      } finally { faceMaker.delete() }
    } finally { wire.delete() }
  } finally { polygon.delete() }
}

function makeAxialCylinder(
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
  x: number,
  y: number,
  z: number,
  directionX: number,
  directionY: number,
  radius: number,
  length: number,
): TopoDS_Shape {
  const point = new oc.gp_Pnt_3(x, y, z)
  const direction = new oc.gp_Dir_4(directionX, directionY, 0)
  try {
    const axis = new oc.gp_Ax2_3(point, direction)
    try {
      const cylinder = new oc.BRepPrimAPI_MakeCylinder_3(axis, radius, length)
      try { return cylinder.Shape() } finally { cylinder.delete() }
    } finally { axis.delete() }
  } finally { point.delete(); direction.delete() }
}

function makeSideBoltHead(
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
  x: number,
  y: number,
  z: number,
  directionX: number,
  directionY: number,
): TopoDS_Shape {
  const radius = SIDE_FIXING_BOLT_HEAD_DIAMETER / 2
  const height = SIDE_FIXING_BOLT_HEAD_HEIGHT
  const sphereRadius = (radius * radius + height * height) / (2 * height)
  const baseLatitude = Math.asin((sphereRadius - height) / sphereRadius)
  const center = new oc.gp_Pnt_3(
    x + directionX * (sphereRadius - height),
    y + directionY * (sphereRadius - height),
    z,
  )
  const inward = new oc.gp_Dir_4(-directionX, -directionY, 0)
  try {
    const axis = new oc.gp_Ax2_3(center, inward)
    try {
      const cap = new oc.BRepPrimAPI_MakeSphere_12(axis, sphereRadius, baseLatitude, Math.PI / 2, Math.PI * 2)
      try {
        const shape = cap.Shape()
        if (shape.IsNull()) {
          shape.delete()
          throw new Error('Der Torbandschraubenkopf konnte nicht erzeugt werden.')
        }
        return shape
      } finally { cap.delete() }
    } finally { axis.delete() }
  } finally { center.delete(); inward.delete() }
}

function makeSideNut(
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
  x: number,
  y: number,
  z: number,
  directionX: number,
  directionY: number,
): TopoDS_Shape {
  const radius = 8.5
  const tangent = { x: -directionY, y: directionX }
  const points = Array.from({ length: 6 }, (_, index): [number, number, number] => {
    const angle = index * Math.PI / 3
    return [
      x + tangent.x * radius * Math.cos(angle),
      y + tangent.y * radius * Math.cos(angle),
      z + radius * Math.sin(angle),
    ]
  })
  return makePrism(oc, points, [directionX * 8, directionY * 8, 0])
}

function fuseSideBolt(
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
  head: TopoDS_Shape,
  shaft: TopoDS_Shape,
): TopoDS_Shape {
  const progress = new oc.Message_ProgressRange_1()
  const fuse = new oc.BRepAlgoAPI_Fuse_3(head, shaft, progress)
  try {
    fuse.Build(progress)
    if (!fuse.IsDone()) throw new Error('Torbandschraubenkopf und Schaft konnten nicht vereinigt werden.')
    const bolt = fuse.Shape()
    if (bolt.IsNull()) {
      bolt.delete()
      throw new Error('Die vereinigte Torbandschraube ist leer.')
    }
    return bolt
  } finally {
    fuse.delete()
    progress.delete()
  }
}

export async function createStep(request: SlabStepRequest): Promise<Uint8Array> {
  reportProgress('CAD-Kernel wird geladen …', 2)
  const oc = await initOpenCascade()
  if (!oc.STEPControl_Controller.Init()) throw new Error('Der STEP-Export konnte nicht initialisiert werden.')
  reportProgress('CAD-Kernel bereit …', 5)

  const documentHandle = new oc.Handle_TDocStd_Document_2(
    new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1()),
  )
  const document = documentHandle.get()
  const root = document.Main()
  const documentTool = oc.XCAFDoc_DocumentTool.Set(root, true)
  const shapeToolHandle = oc.XCAFDoc_DocumentTool.ShapeTool(root)
  const colorToolHandle = oc.XCAFDoc_DocumentTool.ColorTool(root)
  const layerToolHandle = oc.XCAFDoc_DocumentTool.LayerTool(root)
  const shapeTool = shapeToolHandle.get()
  const colorTool = colorToolHandle.get()
  const layerTool = layerToolHandle.get()
  const writer = new oc.STEPCAFControl_Writer_1()
  const layerNames = new Set<string>()
  const mounting = request.mounting ?? '7B'
  const screws = mounting === '7A' ? [] : railingScrewPlacements(request.profiles, request.thickness)
  const sideFixings = mounting === '7A' ? request.profiles.flatMap((part) => {
    const headInsetDistance = sideFixingHeadInsetDistance(part.section)
    return part.holes.map((hole) => ({
      x: hole.x - part.direction.y * headInsetDistance,
      y: hole.y + part.direction.x * headInsetDistance,
      directionX: part.direction.y,
      directionY: -part.direction.x,
      nutOffset: sideFixingNutOffset(part.section),
    }))
  }) : []
  const totalBodies = 1 + request.profiles.length + request.accessories.sealLips.length
    + request.accessories.clampWedges.length + request.accessories.glassShoes.length
    + request.glassPanels.length + screws.length + sideFixings.length * 2
  let bodyCount = 0

  const addBody = (shape: TopoDS_Shape, name: string, layer: string, color: string, alpha = 1) => {
    if (shape.IsNull()) throw new Error(`${name} ist leer.`)
    const analyzer = new oc.BRepCheck_Analyzer(shape, true, false)
    try { if (!analyzer.IsValid_2()) throw new Error(`${name} ist kein gültiger Volumenkörper.`) } finally { analyzer.delete() }
    const explorer = new oc.TopExp_Explorer_2(shape,
      enumEntry<TopAbs_ShapeEnum>(oc.TopAbs_ShapeEnum, 'TopAbs_SOLID'),
      enumEntry<TopAbs_ShapeEnum>(oc.TopAbs_ShapeEnum, 'TopAbs_SHAPE'))
    let solidCount = 0
    try { while (explorer.More()) { solidCount++; explorer.Next() } } finally { explorer.delete() }
    if (solidCount !== 1) throw new Error(`${name} enthält ${solidCount} statt eines Volumenkörpers.`)

    const colorComponents = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
    if (!colorComponents) throw new Error(`Ungültige Bauteilfarbe: ${color}`)
    const [red, green, blue] = colorComponents.slice(1).map((component) => Number.parseInt(component, 16) / 255)
    const surfaceColor = new oc.Quantity_ColorRGBA_5(red, green, blue, alpha)
    const label = shapeTool.AddShape(shape, false, false)
    const partName = new oc.TCollection_ExtendedString_2(name, true)
    const layerName = new oc.TCollection_ExtendedString_2(layer, true)
    try {
      const nameAttribute = oc.TDataStd_Name.Set_1(label, partName)
      try {
        layerTool.SetLayer_2(label, layerName, true)
        colorTool.SetColor_3(label, surfaceColor, enumEntry(oc.XCAFDoc_ColorType, 'XCAFDoc_ColorSurf'))
      } finally { nameAttribute.delete() }
      layerNames.add(layer)
      bodyCount += 1
      reportProgress(`Bauteil ${bodyCount} von ${totalBodies} erstellt …`, 10 + 80 * bodyCount / totalBodies)
    } finally {
      surfaceColor.delete()
      layerName.delete()
      partName.delete()
      label.delete()
    }
  }

  const addProfileGroup = (profiles: ProfilePart[], groupName: string, layer: string, color: string, profileMounting = mounting) => {
    for (const [index, profile] of profiles.entries()) {
      reportProgress(`${groupName} ${index + 1}/${profiles.length} wird erstellt …`, 10 + 80 * bodyCount / totalBodies)
      const profileShape = makeProfile(oc, profile, request.thickness, profileMounting)
      try { addBody(profileShape, `${groupName}_${String(index + 1).padStart(2, '0')}`, layer, color) }
      finally { profileShape.delete() }
    }
  }

  try {
    writer.SetLayerMode(true)
    writer.SetNameMode(true)
    writer.SetColorMode(true)
    reportProgress(mounting === '7A' ? 'Stahlblech wird als Volumenkörper erstellt …' : 'Betondecke wird als Volumenkörper erstellt …', 7)
    if (mounting === '7A') {
      const plate = makeSteelPlate(oc, request.points, request.thickness, request.profiles)
      try { addBody(plate, 'Stahlblech_10mm', 'GEL_Stahlblech', RAILING_COLORS.steel) } finally { plate.delete() }
    } else {
    const polygon = new oc.BRepBuilderAPI_MakePolygon_1()
    try {
      for (const point of request.points) {
        const cadPoint = new oc.gp_Pnt_3(point.x, point.y, 0)
        try { polygon.Add_1(cadPoint) } finally { cadPoint.delete() }
      }
      polygon.Close()
      if (!polygon.IsDone()) throw new Error('Die Kontur konnte nicht geschlossen werden.')
      const wire = polygon.Wire()
      try {
        const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true)
        try {
          if (!faceMaker.IsDone()) throw new Error('Die Fläche der Betondecke konnte nicht erzeugt werden.')
          const face = faceMaker.Face()
          try {
            const vector = new oc.gp_Vec_4(0, 0, request.thickness)
            try {
              const prism = new oc.BRepPrimAPI_MakePrism_1(face, vector, true, true)
              try {
                const progress = new oc.Message_ProgressRange_1()
                try { prism.Build(progress) } finally { progress.delete() }
                if (!prism.IsDone()) throw new Error('Die Betondecke konnte nicht extrudiert werden.')
                const slab = prism.Shape()
                try { addBody(slab, 'Betondecke', 'GEL_Betondecke', RAILING_COLORS.concrete) } finally { slab.delete() }
              } finally { prism.delete() }
            } finally { vector.delete() }
          } finally { face.delete() }
        } finally { faceMaker.delete() }
      } finally { wire.delete() }
    } finally { polygon.delete() }
    }

    addProfileGroup(request.profiles, 'GEL2001_Grundprofil', 'GEL_Gelaenderschuh', RAILING_COLORS.aluminum, mounting)
    addProfileGroup(request.accessories.sealLips, 'GEL2001_Dichtlippe', 'GEL_Dichtlippen', RAILING_COLORS.sealLip, mounting)
    addProfileGroup(request.accessories.clampWedges, 'GEL2001_Klemmkeil', 'GEL_Klemmleisten', RAILING_COLORS.clampWedge, mounting)
    addProfileGroup(request.accessories.glassShoes, 'GEL2001_Glasschuh', 'GEL_Glasschuh', RAILING_COLORS.glassShoe, mounting)
    for (const [index, panel] of request.glassPanels.entries()) {
      reportProgress(`Glasscheibe ${index + 1}/${request.glassPanels.length} wird erstellt …`, 10 + 80 * bodyCount / totalBodies)
      const profile: ProfilePart = {
        ...panel.path,
        section: [
          { x: panel.center - panel.thickness / 2, y: panel.bottom },
          { x: panel.center + panel.thickness / 2, y: panel.bottom },
          { x: panel.center + panel.thickness / 2, y: panel.top },
          { x: panel.center - panel.thickness / 2, y: panel.top },
        ],
        holes: [],
      }
      const shape = makeProfile(oc, profile, request.thickness, mounting)
      try { addBody(shape, `GEL2001_Glasscheibe_${String(index + 1).padStart(2, '0')}`, 'GEL_Glas', RAILING_COLORS.glass, RAILING_GLASS_OPACITY) }
      finally { shape.delete() }
    }

    if (screws.length > 0) {
      reportProgress(`${screws.length} Schrauben werden erstellt …`, 10 + 80 * bodyCount / totalBodies)
      const template = makeScrew(oc)
      try {
        for (const [index, screw] of screws.entries()) {
          const vector = new oc.gp_Vec_4(screw.x, screw.y, screw.headHeight)
          const transform = new oc.gp_Trsf_1()
          try {
            transform.SetTranslation_1(vector)
            const mover = new oc.BRepBuilderAPI_Transform_2(template, transform, true)
            try {
              if (!mover.IsDone()) throw new Error(`Schraube ${index + 1} konnte nicht positioniert werden.`)
              const screwShape = mover.Shape()
              try { addBody(screwShape, `Schraube_${String(index + 1).padStart(2, '0')}`, 'GEL_Schrauben', RAILING_COLORS.screw) }
              finally { screwShape.delete() }
            } finally { mover.delete() }
          } finally { transform.delete(); vector.delete() }
        }
      } finally { template.delete() }
    }

    for (const [index, fixing] of sideFixings.entries()) {
      reportProgress(`Torbandschraube ${index + 1}/${sideFixings.length} wird erstellt …`, 10 + 80 * bodyCount / totalBodies)
      const shaft = makeAxialCylinder(oc, fixing.x, fixing.y, SIDE_FIXING_AXIS_HEIGHT, fixing.directionX, fixing.directionY, 5, SIDE_FIXING_BOLT_LENGTH)
      const head = makeSideBoltHead(oc, fixing.x, fixing.y, SIDE_FIXING_AXIS_HEIGHT, fixing.directionX, fixing.directionY)
      try {
        const bolt = fuseSideBolt(oc, head, shaft)
        try { addBody(bolt, `Torbandschraube_M10x30_D25_${String(index + 1).padStart(3, '0')}`, 'GEL_Schrauben', RAILING_COLORS.screw) }
        finally { bolt.delete() }
      } finally { head.delete(); shaft.delete() }
      const nut = makeSideNut(
        oc,
        fixing.x + fixing.directionX * fixing.nutOffset,
        fixing.y + fixing.directionY * fixing.nutOffset,
        SIDE_FIXING_AXIS_HEIGHT,
        fixing.directionX,
        fixing.directionY,
      )
      try { addBody(nut, `Mutter_DIN934_M10_${String(index + 1).padStart(3, '0')}`, 'GEL_Schrauben', RAILING_COLORS.screw) } finally { nut.delete() }
    }

    reportProgress('STEP-Datei wird geschrieben …', 92)
    const progress = new oc.Message_ProgressRange_1()
    const originalOpen = oc.FS.open
    let redirected = false
    let succeeded: boolean
    try {
      oc.FS.open = (file, flags, mode) => {
        if (!redirected) { redirected = true; return originalOpen.call(oc.FS, path, flags, mode) }
        return originalOpen.call(oc.FS, file, flags, mode)
      }
      succeeded = writer.Perform_2(documentHandle, path, progress)
    } finally {
      oc.FS.open = originalOpen
      progress.delete()
    }
    if (!redirected || !succeeded || !oc.FS.analyzePath(path).exists) throw new Error('Die STEP-Datei konnte nicht geschrieben werden.')
    const data = oc.FS.readFile(path)
    const text = new TextDecoder().decode(data)
    const exportedBodies = (text.match(/\bMANIFOLD_SOLID_BREP\s*\(/g) ?? []).length
    if (!text.startsWith('ISO-10303-21;') || !text.trimEnd().endsWith('END-ISO-10303-21;')
      || exportedBodies !== bodyCount
      || (layerNames.size > 0 && !text.includes('PRESENTATION_LAYER_ASSIGNMENT'))
      || [...layerNames].some((layer) => !text.includes(layer))) {
      throw new Error('Die STEP-Datei enthält nicht alle Volumenkörper und benannten Layer.')
    }
    return data
  } finally {
    if (oc.FS.analyzePath(path).exists) oc.FS.unlink(path)
    writer.delete()
    colorToolHandle.delete()
    shapeToolHandle.delete()
    layerToolHandle.delete()
    documentTool.delete()
    root.delete()
    documentHandle.delete()
  }
}
