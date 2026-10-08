import { describe, it, expect, beforeEach } from 'vitest'
import { useClipPrefsStore } from './clipPrefsStore'

function resetStore() {
  localStorage.clear()
  useClipPrefsStore.setState({ preRoll: 8, postRoll: 4, stickyTags: [] })
}

describe('clipPrefsStore', () => {
  beforeEach(() => {
    resetStore()
  })

  it('defaults to preRoll: 8, postRoll: 4, no sticky tags', () => {
    const { preRoll, postRoll, stickyTags } = useClipPrefsStore.getState()
    expect(preRoll).toBe(8)
    expect(postRoll).toBe(4)
    expect(stickyTags).toEqual([])
  })

  it('clamps preRoll/postRoll to [0, 60]', () => {
    const { setPreRoll, setPostRoll } = useClipPrefsStore.getState()
    setPreRoll(-5)
    expect(useClipPrefsStore.getState().preRoll).toBe(0)
    setPreRoll(500)
    expect(useClipPrefsStore.getState().preRoll).toBe(60)
    setPostRoll(NaN)
    expect(useClipPrefsStore.getState().postRoll).toBe(0)
  })

  it('toggleStickyTag adds a normalized tag, then removes it on a second call', () => {
    const { toggleStickyTag } = useClipPrefsStore.getState()
    toggleStickyTag('  Power   Play  ')
    expect(useClipPrefsStore.getState().stickyTags).toEqual(['Power Play'])

    toggleStickyTag('power play') // case-insensitive match removes it
    expect(useClipPrefsStore.getState().stickyTags).toEqual([])
  })

  it('toggleStickyTag ignores a tag that normalizes to nothing', () => {
    const { toggleStickyTag } = useClipPrefsStore.getState()
    toggleStickyTag('   ')
    expect(useClipPrefsStore.getState().stickyTags).toEqual([])
  })

  it('setStickyTags normalizes the whole list', () => {
    const { setStickyTags } = useClipPrefsStore.getState()
    setStickyTags(['Offense', 'offense', 'PP', ''])
    expect(useClipPrefsStore.getState().stickyTags).toEqual(['Offense', 'PP'])
  })
})

describe('reel prefs', () => {
  it('defaults to no title cards (2 s when on) and no individual clips', () => {
    useClipPrefsStore.setState({ reelTitleCards: false, reelCardSeconds: 2, reelSaveIndividual: false })
    const s = useClipPrefsStore.getState()
    expect([s.reelTitleCards, s.reelCardSeconds, s.reelSaveIndividual]).toEqual([false, 2, false])
  })

  it('remembers the toggles and clamps card length to 1-5 s', () => {
    const s = useClipPrefsStore.getState()
    s.setReelTitleCards(true)
    s.setReelSaveIndividual(true)
    s.setReelCardSeconds(12)
    expect(useClipPrefsStore.getState().reelCardSeconds).toBe(5)
    s.setReelCardSeconds(0)
    expect(useClipPrefsStore.getState().reelCardSeconds).toBe(1)
    const saved = JSON.parse(localStorage.getItem('replay-studio-clip-prefs') ?? '{}').state
    expect(saved).toMatchObject({ reelTitleCards: true, reelSaveIndividual: true, reelCardSeconds: 1 })
  })
})
