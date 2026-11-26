import { describe, it, expect, vi } from 'vitest'
import { startVoiceRecorder } from './recorder'

function fakeStream() {
  const listeners: (() => void)[] = []
  const track = { stop: vi.fn(), addEventListener: (_: string, fn: () => void) => listeners.push(fn), end: () => listeners.forEach((fn) => fn()) }
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

  it('reports a track that ends mid-recording once and still returns the audio', async () => {
    const { stream, track } = fakeStream()
    const rec = new FakeMediaRecorder()
    const onEnded = vi.fn()
    const recorder = await startVoiceRecorder({
      getUserMedia: vi.fn().mockResolvedValue(stream),
      createRecorder: () => rec as unknown as MediaRecorder,
      onEnded,
    })
    track.end()
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect((await recorder.stop())?.blob.size).toBe(3)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('does not report an end that stop() or cancel() caused', async () => {
    const { stream } = fakeStream()
    const onEnded = vi.fn()
    const recorder = await startVoiceRecorder({
      getUserMedia: vi.fn().mockResolvedValue(stream),
      createRecorder: () => new FakeMediaRecorder() as unknown as MediaRecorder,
      onEnded,
    })
    await recorder.stop()
    expect(onEnded).not.toHaveBeenCalled()
  })

  async function started(rec: FakeMediaRecorder, onEnded = vi.fn()) {
    const { stream, track } = fakeStream()
    const recorder = await startVoiceRecorder({
      getUserMedia: vi.fn().mockResolvedValue(stream),
      createRecorder: () => rec as unknown as MediaRecorder,
      onEnded,
    })
    return { recorder, track, onEnded }
  }

  it('reports a recorder that stops by itself once', async () => {
    const rec = new FakeMediaRecorder()
    const { onEnded } = await started(rec)
    rec.stop()
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('keeps the audio of a recorder that errors, and reports once', async () => {
    const rec = new FakeMediaRecorder()
    const { recorder, track, onEnded } = await started(rec)
    rec.ondataavailable?.({ data: new Blob(['abcd']) })
    rec.onerror?.()
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect((await recorder.stop())?.blob.size).toBe(7)
    expect(track.stop).toHaveBeenCalled()
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('resolves null after an error if no stop follows', async () => {
    vi.useFakeTimers()
    const rec = new FakeMediaRecorder()
    rec.stop = () => {
      rec.state = 'inactive'
    }
    const { recorder, track } = await started(rec)
    rec.onerror?.()
    const result = recorder.stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await result).toBeNull()
    expect(track.stop).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does not report anything after cancel()', async () => {
    const rec = new FakeMediaRecorder()
    const { recorder, track, onEnded } = await started(rec)
    recorder.cancel()
    track.end()
    rec.onstop?.()
    rec.onerror?.()
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('releases the stream and resolves null when recorder.stop() throws', async () => {
    const rec = new FakeMediaRecorder()
    rec.stop = () => {
      throw new Error('boom')
    }
    const { recorder, track } = await started(rec)
    expect(await recorder.stop()).toBeNull()
    expect(track.stop).toHaveBeenCalled()
  })
})
