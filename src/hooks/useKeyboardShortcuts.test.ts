import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useVoiceRecording, beginVoiceRecording, cancelVoiceRecording, setVoiceRecorderFactory } from '@/voice/voiceRecording'
import { useVideoStore } from '@/stores/videoStore'
import type { VoiceRecorder } from '@/voice/recorder'

vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))

function Harness() {
  useKeyboardShortcuts()
  return null
}

let root: Root
let container: HTMLDivElement

beforeEach(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  setVoiceRecorderFactory(async () => ({ stop: async () => null, cancel: vi.fn() }) as unknown as VoiceRecorder)
  const video = Object.assign(new EventTarget(), { paused: false, currentTime: 1 })
  useVideoStore.setState({ videoElement: video as unknown as HTMLVideoElement, fps: 30, reverseRate: 0, slowRecording: null })
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => root.render(createElement(Harness)))
})

afterEach(async () => {
  cancelVoiceRecording()
  await act(async () => root.unmount())
  setVoiceRecorderFactory(null)
  useVideoStore.setState({ videoElement: null })
})

describe('voice key wiring', () => {
  it('blur and an N keyup leave a button-started recording running', async () => {
    await act(async () => beginVoiceRecording('button'))
    expect(useVoiceRecording.getState().recording).not.toBeNull()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'n' }))
      window.dispatchEvent(new Event('blur'))
    })
    expect(useVoiceRecording.getState().recording).not.toBeNull()
  })

  it('blur ends a key-started recording', async () => {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }))
    })
    expect(useVoiceRecording.getState().recording).not.toBeNull()
    await act(async () => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(useVoiceRecording.getState().recording).toBeNull()
  })

  it('releasing N ends a key-started recording', async () => {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }))
    })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'n' }))
    })
    expect(useVoiceRecording.getState().recording).toBeNull()
  })
})
