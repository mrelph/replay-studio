import { Mic } from 'lucide-react'
import { useVoiceStore } from '@/stores/voiceStore'
import { useSpeedStore } from '@/stores/speedStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { Button, Select } from '@/components/ui'
import { playVoice, stopVoice } from '@/voice/voicePlayback'
import type { VoiceClip, VoiceDuck } from '@/types/voice'

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}

function voiceTitle(clip: VoiceClip): string {
  return `Voice, ${formatSeconds(clip.duration)}, ${clip.frozen ? 'on a frozen frame' : 'over the video'}`
}

function selectVoiceClip(id: string) {
  useDrawingStore.getState().selectAnnotation(null)
  useSpeedStore.getState().select(null)
  useVoiceStore.getState().select(id)
}

export default function VoiceLane({ duration, topClass }: { duration: number; topClass: string }) {
  const clips = useVoiceStore((s) => s.clips)
  const selectedId = useVoiceStore((s) => s.selectedId)
  if (clips.length === 0) return null

  return (
    <div
      className={`absolute inset-x-0 ${topClass} h-4 bg-surface-elevated border-b border-border-subtle`}
      aria-label="Voice lane"
      onClick={() => {
        useVoiceStore.getState().select(null)
        stopVoice()
      }}
    >
      {clips.map((clip) => {
        const isSelected = selectedId === clip.id
        const style = clip.frozen
          ? { left: `${(clip.startTime / duration) * 100}%`, width: 14 }
          : { left: `${(clip.startTime / duration) * 100}%`, width: `${(clip.duration / duration) * 100}%`, minWidth: 10 }
        return (
          <div
            key={clip.id}
            role="button"
            tabIndex={0}
            aria-label={voiceTitle(clip)}
            aria-pressed={isSelected}
            title={voiceTitle(clip)}
            className={`absolute top-0.5 bottom-0.5 rounded-sm cursor-pointer bg-accent overflow-hidden flex items-center justify-center ${
              isSelected ? 'ring-2 ring-accent-hover z-10' : 'opacity-85 hover:opacity-100'
            }`}
            style={style}
            onClick={(e) => {
              e.stopPropagation()
              selectVoiceClip(clip.id)
              playVoice(clip.id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                selectVoiceClip(clip.id)
                playVoice(clip.id)
              }
            }}
          >
            {clip.frozen ? (
              <Mic className="w-2.5 h-2.5 text-accent-text pointer-events-none" aria-hidden="true" />
            ) : (
              <span className="text-[10px] font-medium text-accent-text leading-none truncate px-1 pointer-events-none">
                {formatSeconds(clip.duration)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function VoiceDuckSelect() {
  const duck = useVoiceStore((s) => s.duck)
  const setDuck = useVoiceStore((s) => s.setDuck)
  return (
    <label className="flex items-center gap-1 text-xs text-text-tertiary">
      Game sound under voice
      <Select
        value={duck}
        onChange={(e) => {
          setDuck(e.target.value as VoiceDuck)
          e.currentTarget.blur()
        }}
        aria-label="Game sound under voice"
        className="!text-xs !py-0.5 !px-2"
      >
        <option value="low">Low</option>
        <option value="off">Off</option>
        <option value="full">Full</option>
      </Select>
    </label>
  )
}

export function VoiceClipDetails({ clip }: { clip: VoiceClip }) {
  const remove = useVoiceStore((s) => s.remove)
  return (
    <div className="mt-2 p-3 bg-surface-sunken rounded-lg flex items-center gap-4 flex-wrap">
      <span className="text-xs text-text-tertiary">{voiceTitle(clip)}</span>
      <div className="flex-1" />
      <Button
        onClick={() => {
          stopVoice()
          remove(clip.id)
        }}
        variant="danger"
        size="sm"
      >
        Delete
      </Button>
    </div>
  )
}
