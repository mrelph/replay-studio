import { describe, it, expect, vi } from 'vitest'
import { startVoiceRecorder } from './recorder'

function fakeStream() {
  const track = { stop: vi.fn() }
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream }
}

class FakeMediaRecorder {
  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  emit = true
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    if (this.emit) this.ondataavailable?.({ data: new Blob(['abc'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

describe('startVoiceRecorder', () => {
  it('rejects when the microphone is refused', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('denied'))
    await expect(startVoiceRecorder({ getUserMedia })).rejects.toThrow('denied')
  })

  it('stop returns the recorded blob and releases the tracks', async () => {
    const { stream, track } = fakeStream()
    const rec = new FakeMediaRecorder()
    const recorder = await startVoiceRecorder({
      getUserMedia: vi.fn().mockResolvedValue(stream),
      createRecorder: () => rec as unknown as MediaRecorder,
    })
    const result = await recorder.stop()
    expect(result?.mime).toBe('audio/webm')
    expect(result?.blob.size).toBe(3)
    expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('stop resolves null when nothing was recorded', async () => {
    const { stream, track } = fakeStream()
    const rec = new FakeMediaRecorder()
    rec.emit = false
    const recorder = await startVoiceRecorder({
      getUserMedia: vi.fn().mockResolvedValue(stream),
      createRecorder: () => rec as unknown as MediaRecorder,
    })
    expect(await recorder.stop()).toBeNull()
    expect(track.stop).toHaveBeenCalled()
  })

  it('cancel stops the recorder and releases the tracks without a result', async () => {
    const { stream, track } = fakeStream()
    const rec = new FakeMediaRecorder()
    const recorder = await startVoiceRecorder({
      getUserMedia: vi.fn().mockResolvedValue(stream),
      createRecorder: () => rec as unknown as MediaRecorder,
    })
    recorder.cancel()
    expect(rec.state).toBe('inactive')
    expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('releases the tracks when the recorder cannot be created', async () => {
    const { stream, track } = fakeStream()
    await expect(
      startVoiceRecorder({
        getUserMedia: vi.fn().mockResolvedValue(stream),
        createRecorder: () => {
          throw new Error('no codec')
        },
      }),
    ).rejects.toThrow('no codec')
    expect(track.stop).toHaveBeenCalled()
  })
})
