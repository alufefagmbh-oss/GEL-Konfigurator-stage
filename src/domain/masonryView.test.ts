import { describe, expect, it } from 'vitest'
import { DEFAULT_MASONRY_VIEW, getFloorWidth } from './masonryView'

describe('default masonry view', () => {
  it('starts hidden with the default masonry color and no transparency', () => {
    expect(DEFAULT_MASONRY_VIEW.enabled).toBe(false)
    expect(DEFAULT_MASONRY_VIEW.color).toBe('#F1ECE1')
    expect(DEFAULT_MASONRY_VIEW.transparency).toBe(0)
  })

  it('keeps masonry attachments disabled until explicitly enabled', () => {
    expect(DEFAULT_MASONRY_VIEW.topEnabled).toBe(false)
    expect(DEFAULT_MASONRY_VIEW.sideEnabled).toBe(false)
    expect(DEFAULT_MASONRY_VIEW.bottomEnabled).toBe(false)
  })

  it('uses 300 mm attachment dimensions and 200 mm forward projections by default', () => {
    expect(DEFAULT_MASONRY_VIEW.topHeight).toBe(300)
    expect(DEFAULT_MASONRY_VIEW.sideWidth).toBe(300)
    expect(DEFAULT_MASONRY_VIEW.bottomWallHeight).toBe(300)
    expect(DEFAULT_MASONRY_VIEW.topDepth).toBe(200)
    expect(DEFAULT_MASONRY_VIEW.sideDepth).toBe(200)
    expect(DEFAULT_MASONRY_VIEW.bottomWallDepth).toBe(200)
  })

  it('includes both side walls in the floor width when they are enabled', () => {
    expect(getFloorWidth(2000, { sideEnabled: true, sideWidth: 300 })).toBe(2600)
    expect(getFloorWidth(2000, { sideEnabled: false, sideWidth: 300 })).toBe(2000)
  })
})
