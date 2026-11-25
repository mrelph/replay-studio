import { describe, it, expect, beforeEach } from 'vitest'
import { useSpeedStore } from './speedStore'
import { useVideoStore } from './videoStore'

const r = (id: string, start: number, end: number, speed = 0.5) => ({ id, start, end, speed })

beforeEach(() => {
  useVideoStore.setState({ duration: 20, fps: 30 })
  useSpeedStore.getState().replaceAll([])
})

describe('speedStore', () => {
  it('replaceAll, remove and place keep the selection honest', () => {
    const s = useSpeedStore.getState()
    s.replaceAll([r('a', 2, 4)])
    s.select('a')
    s.replaceAll([r('a', 2, 4)])
    expect(useSpeedStore.getState().selectedId).toBeNull()
    s.select('a')
    s.place(r('b', 1, 5))
    expect(useSpeedStore.getState().selectedId).toBeNull()
    s.select('b')
    s.remove('b')
    expect(useSpeedStore.getState().selectedId).toBeNull()
  })

  it('setSpeed clamps', () => {
    const s = useSpeedStore.getState()
    s.place(r('a', 2, 4))
    s.setSpeed('a', 99)
    expect(useSpeedStore.getState().regions[0].speed).toBe(4)
    s.setSpeed('a', 0)
    expect(useSpeedStore.getState().regions[0].speed).toBe(0.1)
  })

  it('re-snaps loaded regions when the real fps arrives', () => {
    const fps = 59.94
    useSpeedStore.getState().replaceAll([r('a', 2.01, 4.02)])
    useVideoStore.setState({ fps })
    const [a] = useSpeedStore.getState().regions
    expect(Math.abs(a.start * fps - Math.round(a.start * fps))).toBeLessThan(1e-6)
    expect(Math.abs(a.end * fps - Math.round(a.end * fps))).toBeLessThan(1e-6)
    useVideoStore.setState({ duration: 21 })
    expect(useSpeedStore.getState().regions).toEqual([a])
  })

  it('keeps regions loaded before the duration is known', () => {
    useVideoStore.setState({ duration: 0 })
    useSpeedStore.getState().replaceAll([r('a', 2, 4)])
    expect(useSpeedStore.getState().regions).toHaveLength(1)
    useVideoStore.setState({ duration: 20 })
    expect(useSpeedStore.getState().regions).toEqual([r('a', 2, 4)])
  })

  it('leaves user-placed regions alone on a no-op fps set', () => {
    useSpeedStore.getState().replaceAll([r('a', 2, 4)])
    useVideoStore.setState({ fps: 59.94 })
    useSpeedStore.getState().place(r('b', 6.0123, 8))
    const before = useSpeedStore.getState().regions
    useVideoStore.setState({ fps: 59.94 })
    expect(useSpeedStore.getState().regions).toBe(before)
  })
})
