const blobs = new Map<string, Blob>()
const urls = new Map<string, string>()

export function setVoiceAudio(id: string, blob: Blob): void {
  const url = urls.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    urls.delete(id)
  }
  blobs.set(id, blob)
}

export function getVoiceAudio(id: string): Blob | undefined {
  return blobs.get(id)
}

export function voiceAudioUrl(id: string): string | undefined {
  const cached = urls.get(id)
  if (cached) return cached
  const blob = blobs.get(id)
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  urls.set(id, url)
  return url
}

export function clearVoiceAudio(): void {
  urls.forEach((url) => URL.revokeObjectURL(url))
  urls.clear()
  blobs.clear()
}
