import * as THREE from 'three'
import { getWallEdgeCutLine } from '../domain/wallContour'
import type { ProfileDefinition, WallContour } from '../domain/types'

const GEOMETRY_TOLERANCE = 1e-7

interface GeometryPoint {
  x: number
  y: number
  z: number
}

function clipPolygon(
  polygon: GeometryPoint[],
  signedDistance: (point: GeometryPoint) => number,
): GeometryPoint[] {
  if (polygon.length === 0) return []
  const clipped: GeometryPoint[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[(index + polygon.length - 1) % polygon.length]
    const currentDistance = signedDistance(current)
    const previousDistance = signedDistance(previous)
    const currentInside = currentDistance >= -GEOMETRY_TOLERANCE
    const previousInside = previousDistance >= -GEOMETRY_TOLERANCE
    if (currentInside !== previousInside) {
      const ratio = previousDistance / (previousDistance - currentDistance)
      clipped.push({
        x: previous.x + ratio * (current.x - previous.x),
        y: previous.y + ratio * (current.y - previous.y),
        z: previous.z + ratio * (current.z - previous.z),
      })
    }
    if (currentInside) clipped.push(current)
  }
  return clipped
}

function createTrimmedGeometry(
  geometry: THREE.ExtrudeGeometry,
  height: number,
  wallTrim?: { contour: WallContour; axisX: number },
  horizontalClip?: { leftX?: number; rightX?: number },
  endGap = 0,
): THREE.BufferGeometry {
  const sourcePosition = geometry.getAttribute('position')
  geometry.computeBoundingBox()
  const minimumProfileX = Math.max(geometry.boundingBox?.min.x ?? 0, horizontalClip?.leftX ?? -Infinity)
  const maximumProfileX = Math.min(geometry.boundingBox?.max.x ?? 0, horizontalClip?.rightX ?? Infinity)
  if (maximumProfileX - minimumProfileX <= GEOMETRY_TOLERANCE) {
    throw new Error('Die gewählte Fassadenendfläche schneidet das Profil vollständig ab.')
  }
  const bottomCut = wallTrim
    ? getWallEdgeCutLine(
      wallTrim.contour,
      wallTrim.axisX + minimumProfileX + wallTrim.contour.width / 2,
      wallTrim.axisX + maximumProfileX + wallTrim.contour.width / 2,
      'bottom',
    )
    : null
  const topCut = wallTrim
    ? getWallEdgeCutLine(
      wallTrim.contour,
      wallTrim.axisX + minimumProfileX + wallTrim.contour.width / 2,
      wallTrim.axisX + maximumProfileX + wallTrim.contour.width / 2,
      'top',
    )
    : null
  const clippedGroups = geometry.groups.map((group) => ({
    materialIndex: group.materialIndex,
    vertices: [] as number[],
  }))

  geometry.groups.forEach((group, groupIndex) => {
    const vertices = clippedGroups[groupIndex].vertices
    for (let index = group.start; index < group.start + group.count; index += 3) {
      const triangle: GeometryPoint[] = [0, 1, 2].map((offset) => {
        const vertexIndex = index + offset
        return {
          x: sourcePosition.getX(vertexIndex),
          y: sourcePosition.getY(vertexIndex),
          z: sourcePosition.getZ(vertexIndex),
        }
      })

      let clipped = clipPolygon(triangle, (point) => point.x - minimumProfileX)
      clipped = clipPolygon(clipped, (point) => maximumProfileX - point.x)
      if (clipped.length < 3) continue

      if (bottomCut && topCut && wallTrim) {
        const bottomAt = (x: number) =>
          bottomCut.leftHeight + bottomCut.slope * (x - minimumProfileX) - wallTrim.contour.height / 2 + endGap
        const topAt = (x: number) =>
          topCut.leftHeight + topCut.slope * (x - minimumProfileX) - wallTrim.contour.height / 2 - endGap
        clipped = clipPolygon(clipped, (point) => point.y - bottomAt(point.x))
        clipped = clipPolygon(clipped, (point) => topAt(point.x) - point.y)
      }
      if (endGap > 0 && (!bottomCut || !topCut)) {
        clipped = clipPolygon(clipped, (point) => point.y + height / 2 - endGap)
        clipped = clipPolygon(clipped, (point) => height / 2 - endGap - point.y)
      }

      for (let vertex = 1; vertex < clipped.length - 1; vertex += 1) {
        for (const point of [clipped[0], clipped[vertex], clipped[vertex + 1]]) {
          vertices.push(point.x, point.y, point.z)
        }
      }
    }
  })

  const trimmedGeometry = new THREE.BufferGeometry()
  let groupStart = 0
  for (const group of clippedGroups) {
    trimmedGeometry.addGroup(groupStart, group.vertices.length / 3, group.materialIndex)
    groupStart += group.vertices.length / 3
  }
  trimmedGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(clippedGroups.flatMap((group) => group.vertices), 3),
  )
  trimmedGeometry.computeVertexNormals()
  trimmedGeometry.computeBoundingBox()
  trimmedGeometry.computeBoundingSphere()
  return trimmedGeometry
}

export function createProfileGeometry(
  profile: ProfileDefinition,
  height: number,
  wallTrim?: { contour: WallContour; axisX: number },
  horizontalClip?: { leftX?: number; rightX?: number },
  endGap = 0,
): THREE.BufferGeometry {
  if (!Number.isFinite(endGap) || endGap < 0 || endGap > 25) {
    throw new Error('Der Montagespalt muss zwischen 0 und 25 mm liegen.')
  }
  if (height <= endGap * 2) {
    throw new Error('Die Fassadenhöhe ist für den gewählten oberen und unteren Montagespalt zu gering.')
  }
  const profileContours = profile.source === 'example' && profile.contours.length === 0
    ? [{
      points: [
        { x: -profile.width / 2, y: -profile.depth / 2 },
        { x: profile.width / 2, y: -profile.depth / 2 },
        { x: profile.width / 2, y: profile.depth / 2 },
        { x: -profile.width / 2, y: profile.depth / 2 },
      ],
    }]
    : profile.contours

  const shape = new THREE.Shape()
  const [outer, ...innerContours] = profileContours
  outer.points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y)
    else shape.lineTo(point.x, point.y)
  })
  shape.closePath()
  for (const contour of innerContours) {
    const hole = new THREE.Path()
    contour.points.forEach((point, index) => {
      if (index === 0) hole.moveTo(point.x, point.y)
      else hole.lineTo(point.x, point.y)
    })
    hole.closePath()
    shape.holes.push(hole)
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 8,
  })
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, -height / 2, 0)
  if (wallTrim || horizontalClip || endGap > 0) {
    const trimmedGeometry = createTrimmedGeometry(geometry, height, wallTrim, horizontalClip, endGap)
    geometry.dispose()
    return trimmedGeometry
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  return geometry
}
