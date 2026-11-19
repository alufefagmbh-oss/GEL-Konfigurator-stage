import type { ProfilePart } from '../domain/railingProfile'
import { profilePoint } from '../domain/railingProfile'

export function straightProfileExtrusion(part: ProfilePart, baseHeight: number): {
  section: Array<[number, number, number]>
  vector: [number, number, number]
} | null {
  const normal = { x: part.direction.y, y: -part.direction.x }
  if (part.startMiter.x !== normal.x || part.startMiter.y !== normal.y
    || part.endMiter.x !== normal.x || part.endMiter.y !== normal.y) return null

  const dx = part.end.x - part.start.x
  const dy = part.end.y - part.start.y
  const length = dx * part.direction.x + dy * part.direction.y
  if (length <= 0 || Math.abs(dx * normal.x + dy * normal.y) > 1e-7) return null
  return {
    section: part.section.map((point) => {
      const position = profilePoint(part, point, false)
      return [position.x, position.y, baseHeight + point.y]
    }),
    vector: [length * part.direction.x, length * part.direction.y, 0],
  }
}
