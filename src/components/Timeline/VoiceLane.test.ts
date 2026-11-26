import { act, createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VoiceLane, { VoiceClipDetails, VoiceDuckSelect } from './VoiceLane'
import { useVoiceStore } from '@/stores/voiceStore'
import { playVoice, stopVoice } from '@/voice/voicePlayback'
import type { VoiceClip } from '@/types/voice'

vi.mock('@/voice/voicePlayback', () => ({ playVoice: vi.fn(), stopVoice: vi.fn() }))

const playing: VoiceClip = { id: 'v1', startTime: 2, duration: 2.4, frozen: false, mime: 'audio/webm' }
const frozen: VoiceClip = { id: 'v2', startTime: 8, duration: 3, frozen: true, mime: 'audio/webm' }

describe('VoiceLane', () => {
  let root: Root
  let container: HTMLDivElement

  const render = async () => {
    const { clips, selectedId } = useVoiceStore.getState()
    const selected = clips.find((c) => c.id === selectedId)
    await act(async () =>
      root.render(
        createElement(
          Fragment,
          null,
          createElement(VoiceLane, { duration: 20, topClass: 'top-8' }),
          createElement(VoiceDuckSelect),
          selected ? createElement(VoiceClipDetails, { clip: selected }) : null,
        ),
      ),
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    useVoiceStore.setState({ clips: [], selectedId: null, duck: 'low' })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('is absent with no clips', async () => {
    await render()
    expect(container.querySelector('[aria-label="Voice lane"]')).toBeNull()
  })

  it('renders a bar per clip with its title', async () => {
    useVoiceStore.setState({ clips: [playing, frozen] })
    await render()
    const bars = container.querySelectorAll('[role="button"]')
    expect(bars).toHaveLength(2)
    expect(bars[0].getAttribute('title')).toBe('Voice, 2.4s, over the video')
    expect(bars[1].getAttribute('title')).toBe('Voice, 3.0s, on a frozen frame')
    expect(bars[0].textContent).toBe('2.4s')
  })

  it('selects and plays on click, and clears on the lane background', async () => {
    useVoiceStore.setState({ clips: [playing, frozen] })
    await render()
    const bar = container.querySelector('[role="button"]') as HTMLElement
    await act(async () => bar.click())
    expect(useVoiceStore.getState().selectedId).toBe('v1')
    expect(playVoice).toHaveBeenCalledWith('v1')
    await render()
    await act(async () => (container.querySelector('[aria-label="Voice lane"]') as HTMLElement).click())
    expect(useVoiceStore.getState().selectedId).toBeNull()
    expect(stopVoice).toHaveBeenCalled()
  })

  it('deletes the selected clip from its Delete button', async () => {
    useVoiceStore.setState({ clips: [playing], selectedId: 'v1' })
    await render()
    const del = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Delete') as HTMLElement
    await act(async () => del.click())
    expect(useVoiceStore.getState().clips).toHaveLength(0)
  })

  it('sets the duck from the select', async () => {
    useVoiceStore.setState({ clips: [playing] })
    await render()
    const select = container.querySelector('select') as HTMLSelectElement
    await act(async () => {
      select.value = 'off'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(useVoiceStore.getState().duck).toBe('off')
  })
})
