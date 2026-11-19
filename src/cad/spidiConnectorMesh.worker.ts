import initOpenCascade from 'opencascade.js'
import type {
  IFSelect_ReturnStatus,
  TopAbs_ShapeEnum,
  TopoDS_Face,
  TopoDS_Shape,
} from 'opencascade.js'
import type { SpidiConnectorBounds } from '../domain/types'

const STEP_PATH = '/tmp/genSpidi_mesh.stp'

function getEnumEntry<T>(enumObject: object, key: string): T {
  const entry = (enumObject as Record<string, unknown>)[key]
  if (entry === undefined) throw new Error(`OpenCascade enum value ${key} is unavailable.`)
  return entry as T
}

function getEnumNumber(value: unknown): number {
  if (typeof value !== 'object' || value === null || !('value' in value) || typeof value.value !== 'number') {
    throw new Error('OpenCascade returned an invalid enum value.')
  }
  return value.value
}

async function loadMesh(length: number) {
  const response = await fetch(`/genSpidi_${length}.stp`)
  if (!response.ok) {
    throw new Error(`Das Maueranschlussteil konnte nicht geladen werden (HTTP ${response.status}).`)
  }
  const file = new Uint8Array(await response.arrayBuffer())
  const oc = await initOpenCascade()
  if (!oc.STEPControl_Controller.Init()) {
    throw new Error('Der STEP-Importer des Maueranschlussteils konnte nicht initialisiert werden.')
  }

  try {
    oc.FS.writeFile(STEP_PATH, file)
    const reader = new oc.STEPControl_Reader_1()
    try {
      const status = reader.ReadFile(STEP_PATH)
      const doneStatus = getEnumEntry<IFSelect_ReturnStatus>(oc.IFSelect_ReturnStatus, 'IFSelect_RetDone')
      if (getEnumNumber(status) !== getEnumNumber(doneStatus)) {
        throw new Error(`Die STEP-Datei des Maueranschlussteils konnte nicht gelesen werden (Status ${getEnumNumber(status)}).`)
      }
      if (reader.NbRootsForTransfer() < 1) {
        throw new Error('Die STEP-Datei des Maueranschlussteils enthält keine übertragbaren Bauteile.')
      }

      const transferProgress = new oc.Message_ProgressRange_1()
      let transferred: number
      try {
        transferred = reader.TransferRoots(transferProgress)
      } finally {
        transferProgress.delete()
      }
      if (transferred < 1) {
        throw new Error('OpenCascade konnte das Maueranschlussteil nicht aus der STEP-Datei übertragen.')
      }

      const shape = reader.OneShape()
      try {
        if (shape.IsNull()) throw new Error('OpenCascade hat eine leere Geometrie für das Maueranschlussteil erzeugt.')
        return createMesh(shape, oc)
      } finally {
        shape.delete()
      }
    } finally {
      reader.delete()
    }
  } finally {
    if (oc.FS.analyzePath(STEP_PATH).exists) oc.FS.unlink(STEP_PATH)
  }
}

function createMesh(
  shape: TopoDS_Shape,
  oc: Awaited<ReturnType<typeof initOpenCascade>>,
): { positions: Float32Array; bounds: SpidiConnectorBounds } {
  const mesher = new oc.BRepMesh_IncrementalMesh_2(shape, 0.5, false, 0.5, true)
  const positions: number[] = []
  const bounds: SpidiConnectorBounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  }

  try {
    if (!mesher.IsDone()) throw new Error('OpenCascade konnte das Maueranschlussteil nicht triangulieren.')
    const explorer = new oc.TopExp_Explorer_2(
      shape,
      getEnumEntry<TopAbs_ShapeEnum>(oc.TopAbs_ShapeEnum, 'TopAbs_FACE'),
      getEnumEntry<TopAbs_ShapeEnum>(oc.TopAbs_ShapeEnum, 'TopAbs_SHAPE'),
    )
    try {
      while (explorer.More()) {
        const faceShape = explorer.Current()
        const face: TopoDS_Face = oc.TopoDS.Face_1(faceShape)
        const location = new oc.TopLoc_Location_1()
        let triangulation: ReturnType<typeof oc.BRep_Tool.Triangulation> | undefined
        let locationTransform: ReturnType<typeof location.Transformation> | undefined
        try {
          triangulation = oc.BRep_Tool.Triangulation(
            face,
            location,
            undefined as never,
          )
          if (!triangulation.IsNull()) {
            const mesh = triangulation.get()
            locationTransform = location.Transformation()
            for (let triangleIndex = 1; triangleIndex <= mesh.NbTriangles(); triangleIndex += 1) {
              const triangle = mesh.Triangle(triangleIndex)
              try {
                for (let nodeIndex = 1; nodeIndex <= 3; nodeIndex += 1) {
                  const node = mesh.Node(triangle.Value(nodeIndex))
                  try {
                    node.Transform(locationTransform)
                    const x = node.X()
                    const y = node.Y()
                    const z = node.Z()
                    positions.push(x, y, z)
                    bounds.minX = Math.min(bounds.minX, x)
                    bounds.maxX = Math.max(bounds.maxX, x)
                    bounds.minY = Math.min(bounds.minY, y)
                    bounds.maxY = Math.max(bounds.maxY, y)
                    bounds.minZ = Math.min(bounds.minZ, z)
                    bounds.maxZ = Math.max(bounds.maxZ, z)
                  } finally {
                    node.delete()
                  }
                }
              } finally {
                triangle.delete()
              }
            }
          }
        } finally {
          locationTransform?.delete()
          triangulation?.delete()
          location.delete()
          face.delete()
          faceShape.delete()
        }
        explorer.Next()
      }
    } finally {
      explorer.delete()
    }
  } finally {
    mesher.delete()
  }

  if (positions.length === 0) throw new Error('Das Maueranschlussteil enthält keine darstellbare Oberflächengeometrie.')
  return { positions: new Float32Array(positions), bounds }
}

self.addEventListener('message', (event: MessageEvent<{ length: number }>) => {
  void loadMesh(event.data.length)
    .then(({ positions, bounds }) => {
      self.postMessage(
        { type: 'result', positions: positions.buffer, bounds },
        { transfer: [positions.buffer] },
      )
    })
    .catch((error: unknown) => {
      self.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Das Maueranschlussteil konnte nicht geladen werden.',
      })
    })
}, { once: true })
