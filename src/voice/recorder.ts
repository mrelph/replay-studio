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
  const stopRecorder = () => {
    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } catch {
      /* already stopped */
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
    release()
    const mime = recorder.mimeType || chunks[0]?.type || 'audio/webm'
    resolveDone(chunks.length > 0 ? { blob: new Blob(chunks, { type: mime }), mime } : null)
    notifyEnded()
  }
  recorder.onerror = () => {
    release()
    resolveDone(null)
    notifyEnded()
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
      stopRecorder()
      release()
    },
  }
}
