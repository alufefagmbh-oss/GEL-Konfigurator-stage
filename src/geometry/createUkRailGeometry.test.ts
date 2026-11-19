import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createUkRailGeometry } from './createUkRailGeometry'
import { parseUkRailDxf } from '../dxf/parseUkRailDxf'
import { readFileSync } from 'node:fs'

const profile = parseUkRailDxf(readFileSync(
  new URL('../../public/genUK-Schiene.dxf', import.meta.url),
  'utf8',
))

describe('UK rail geometry', () => {
  it('extrudes the DXF section horizontally with its marked side facing the facade', () => {
    const geometry = createUkRailGeometry(profile, 1200)
    geometry.computeBoundingBox()

    expect(geometry.boundingBox?.min.x).toBeCloseTo(0)
    expect(geometry.boundingBox?.max.x).toBeCloseTo(1200)
    expect(geometry.boundingBox?.min.y).toBeCloseTo(-30)
    expect(geometry.boundingBox?.max.y).toBeCloseTo(30)
    expect(geometry.boundingBox?.min.z).toBeCloseTo(-18.5)
    expect(geometry.boundingBox?.max.z).toBeCloseTo(0)
    geometry.dispose()
  })

  it('rejects zero-length rail geometry', () => {
    expect(() => createUkRailGeometry(profile, 0)).toThrow('größer als 0 mm')
  })

  it('cuts true through-holes through the rail depth at the supplied rail positions', () => {
    const rectangularProfile = {
      name: 'test rail',
      contours: [{
        points: [
          { x: 0, y: -10 },
          { x: 20, y: -10 },
          { x: 20, y: 10 },
          { x: 0, y: 10 },
        ],
        area: 400,
      }],
      depth: 20,
      height: 20,
      screwHeadPlaneDepth: 10,
      profileSideDepth: 0,
      centerAxisHeight: 0,
    }
    const geometry = createUkRailGeometry(rectangularProfile, 100, [
      { distanceFromStart: 50, diameter: 10 },
    ])
    const material = new THREE.MeshBasicMaterial()
    const rail = new THREE.Mesh(geometry, material)
    const raycaster = new THREE.Raycaster()
    raycaster.set(new THREE.Vector3(50, 0, 10), new THREE.Vector3(0, 0, -1))
    expect(raycaster.intersectObject(rail).length).toBe(0)

    raycaster.set(new THREE.Vector3(70, 0, 10), new THREE.Vector3(0, 0, -1))
    expect(raycaster.intersectObject(rail).length).toBeGreaterThan(0)
    geometry.dispose()
    material.dispose()
  })
})
