import { describe, it, expect } from 'vitest'
import { getToolDefaults } from './annotationDefaults'

describe('getToolDefaults drawIn', () => {
  it.each([
    ['pen', 0.4],
    ['path', 0.4],
    ['line', 0.35],
    ['arrow', 0.35],
    ['arc-arrow', 0.35],
    ['rectangle', 0.4],
    ['circle', 0.4],
  ])('%s draws on in %ss', (tool, s) => {
    expect(getToolDefaults(tool).drawIn).toBe(s)
  })

  it.each(['text', 'spotlight', 'magnifier', 'tracker', 'select', 'freeze', 'unknown-tool'])(
    '%s has no draw-on',
    (tool) => {
      expect(getToolDefaults(tool).drawIn).toBe(0)
    }
  )
})
