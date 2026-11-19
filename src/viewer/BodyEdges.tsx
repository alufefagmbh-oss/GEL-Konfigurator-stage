import { useEffect, useMemo } from 'react'
import { EdgesGeometry } from 'three'
import type { BufferGeometry } from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

export function FineEdges({ geometry }: { geometry: BufferGeometry }) {
  const lines = useMemo(() => {
    const positions = geometry.getAttribute('position')
    if (!positions || positions.count === 0) return null
    const vertices = new Float32Array(positions.count * 3)
    for (let i = 0; i < positions.count; i++) {
      vertices[i * 3] = positions.getX(i)
      vertices[i * 3 + 1] = positions.getY(i)
      vertices[i * 3 + 2] = positions.getZ(i)
    }
    const lineGeometry = new LineSegmentsGeometry()
    lineGeometry.setPositions(vertices)
    const material = new LineMaterial({ color: 0x000000, linewidth: 0.6, depthTest: true, depthWrite: false })
    const result = new LineSegments2(lineGeometry, material)
    result.renderOrder = 1
    return result
  }, [geometry])
  useEffect(() => () => {
    if (lines) {
      lines.geometry.dispose()
      lines.material.dispose()
    }
  }, [lines])
  return lines ? <primitive object={lines} /> : null
}

export function BodyEdges({ geometry }: { geometry: BufferGeometry }) {
  const edges = useMemo(() => new EdgesGeometry(geometry, 25), [geometry])
  useEffect(() => () => edges.dispose(), [edges])
  return <FineEdges geometry={edges} />
}
