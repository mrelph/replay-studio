export interface VoiceRecorder {
  stop(): Promise<{ blob: Blob; mime: string } | null>
  cancel(): void
}

export interface VoiceRecorderDeps {
  getUserMedia?: typeof navigator.mediaDevices.getUserMedia
  createRecorder?: (stream: MediaStream) => MediaRecorder
}

export async function startVoiceRecorder(deps: VoiceRecorderDeps = {}): Promise<VoiceRecorder> {
  const getUserMedia = deps.getUserMedia ?? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
  if (!getUserMedia) throw new Error('Microphone not available')
  const stream = await getUserMedia({ audio: true })
  const release = () => stream.getTracks().forEach((track) => track.stop())

  let recorder: MediaRecorder
  try {
    recorder = deps.createRecorder ? deps.createRecorder(stream) : new MediaRecorder(stream)
    recorder.start()
  } catch (err) {
    release()
    throw err
  }

  const chunks: Blob[] = []
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) chunks.push(event.data)
  }
  let finished = false

  return {
    stop: () =>
      new Promise((resolve) => {
        if (finished) {
          resolve(null)
          return
        }
        finished = true
        recorder.onstop = () => {
          release()
          const mime = recorder.mimeType || chunks[0]?.type || 'audio/webm'
          resolve(chunks.length > 0 ? { blob: new Blob(chunks, { type: mime }), mime } : null)
        }
        recorder.onerror = () => {
          release()
          resolve(null)
        }
        try {
          if (recorder.state === 'inactive') recorder.onstop?.(new Event('stop'))
          else recorder.stop()
        } catch {
          release()
          resolve(null)
        }
      }),
    cancel: () => {
      if (finished) return
      finished = true
      recorder.ondataavailable = null
      recorder.onstop = null
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        /* already stopped */
      }
      release()
    },
  }
}
