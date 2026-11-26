export interface VoiceRecorder {
  stop(): Promise<{ blob: Blob; mime: string } | null>
  cancel(): void
}

export interface VoiceRecorderDeps {
  getUserMedia?: typeof navigator.mediaDevices.getUserMedia
  createRecorder?: (stream: MediaStream) => MediaRecorder
  /** Fires once when the recorder stops or errors by itself, or a microphone track ends, before stop()/cancel() was called. */
  onEnded?: () => void
}

export async function startVoiceRecorder(deps: VoiceRecorderDeps = {}): Promise<VoiceRecorder> {
  const getUserMedia = deps.getUserMedia ?? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
  if (!getUserMedia) throw new Error('Microphone not available')
  const stream = await getUserMedia({ audio: true })
  const tracks = stream.getTracks()
  const release = () => tracks.forEach((track) => track.stop())

  let recorder: MediaRecorder
  try {
    recorder = deps.createRecorder ? deps.createRecorder(stream) : new MediaRecorder(stream)
  } catch (err) {
    release()
    throw err
  }

  const chunks: Blob[] = []
  let requested = false
  let notified = false
  const notifyEnded = () => {
    if (requested || notified) return
    notified = true
    deps.onEnded?.()
  }
  let errorTimer: ReturnType<typeof setTimeout> | null = null
  const stopRecorder = () => {
    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } catch {
      release()
      resolveDone(null)
    }
  }

  let resolveDone: (value: { blob: Blob; mime: string } | null) => void = () => {}
  const done = new Promise<{ blob: Blob; mime: string } | null>((resolve) => {
    resolveDone = resolve
  })

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) chunks.push(event.data)
  }
  recorder.onstop = () => {
    if (errorTimer !== null) clearTimeout(errorTimer)
    release()
    const mime = recorder.mimeType || chunks[0]?.type || 'audio/webm'
    resolveDone(chunks.length > 0 ? { blob: new Blob(chunks, { type: mime }), mime } : null)
    notifyEnded()
  }
  recorder.onerror = () => {
    notifyEnded()
    stopRecorder()
    if (errorTimer === null) {
      errorTimer = setTimeout(() => {
        release()
        resolveDone(null)
      }, 1000)
    }
  }
  tracks.forEach((track) =>
    track.addEventListener?.('ended', () => {
      if (requested) return
      notifyEnded()
      stopRecorder()
    }),
  )

  try {
    recorder.start()
  } catch (err) {
    release()
    throw err
  }

  return {
    stop: () => {
      requested = true
      stopRecorder()
      return done
    },
    cancel: () => {
      requested = true
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.onerror = null
      if (errorTimer !== null) clearTimeout(errorTimer)
      stopRecorder()
      release()
    },
  }
}
