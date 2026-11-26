export interface VoiceClip {
  id: string
  startTime: number
  duration: number
  frozen: boolean
  mime: string
}

export type VoiceDuck = 'low' | 'off' | 'full'
