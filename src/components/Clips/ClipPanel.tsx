import { useState, useRef, useCallback, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Pencil, Trash2, Play, Repeat, Plus, Download, Scissors,
} from 'lucide-react'
import { useClipStore } from '@/stores/clipStore'
import { useVideoStore } from '@/stores/videoStore'
import { Button, IconButton, Kbd } from '@/components/ui'
import type { Clip } from '@/types/clip'

/** mm:ss.f (tenths of a second), used for clip timecodes and durations. */
function formatClipTimecode(seconds: number): string {
  const total = Math.max(0, seconds)
  const minutes = Math.floor(total / 60)
  const wholeSeconds = Math.floor(total % 60)
  const tenths = Math.floor((total - Math.floor(total)) * 10)
  return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}.${tenths}`
}

interface ClipRowProps {
  clip: Clip
  index: number
  isSelected: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onSetLoop: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}

function ClipRow({
  clip,
  index,
  isSelected,
  onSelect,
  onRename,
  onSetLoop,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: ClipRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(clip.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const commitRename = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== clip.name) {
      onRename(trimmed)
    } else {
      setEditName(clip.name)
    }
    setIsEditing(false)
  }

  const cancelRename = () => {
    setEditName(clip.name)
    setIsEditing(false)
  }

  const duration = clip.end - clip.start

  return (
    <li
      role="listitem"
      className={`group border-l-2 ${
        isSelected ? 'border-accent bg-accent-subtle' : 'border-transparent hover:bg-surface-sunken/50'
      }`}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: clip.color }}
          aria-hidden="true"
        />
        <span className="text-xs text-text-disabled w-4 flex-shrink-0 text-right">{index + 1}</span>

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') cancelRename()
            }}
            aria-label={`Rename clip ${index + 1}`}
            className="flex-1 min-w-0 px-1 py-0.5 bg-surface-sunken rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        ) : (
          <button
            onClick={onSelect}
            onDoubleClick={() => setIsEditing(true)}
            className="flex-1 min-w-0 text-left text-sm truncate text-text-secondary"
            title={clip.name}
          >
            {clip.name}
          </button>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <IconButton
            onClick={() => setIsEditing(true)}
            title="Rename clip"
            aria-label={`Rename clip ${index + 1}`}
            size="sm"
          >
            <Pencil className="w-3 h-3" />
          </IconButton>
          <IconButton
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move up"
            aria-label={`Move clip ${index + 1} up`}
            size="sm"
          >
            <ChevronUp className="w-3 h-3" />
          </IconButton>
          <IconButton
            onClick={onMoveDown}
            disabled={isLast}
            title="Move down"
            aria-label={`Move clip ${index + 1} down`}
            size="sm"
          >
            <ChevronDown className="w-3 h-3" />
          </IconButton>
          <IconButton
            onClick={onDelete}
            title="Delete clip"
            aria-label={`Delete clip ${index + 1}`}
            size="sm"
            className="hover:text-error"
          >
            <Trash2 className="w-3 h-3" />
          </IconButton>
        </div>
      </div>

      <div className="flex items-center gap-2 px-2 pb-1.5 pl-9 text-xs text-text-tertiary">
        <button
          onClick={onSelect}
          title="Jump to start"
          aria-label={`Jump to start of clip ${index + 1}`}
          className="hover:text-text-primary flex-shrink-0"
        >
          <Play className="w-3 h-3" />
        </button>
        <span className="truncate">
          {formatClipTimecode(clip.start)}&ndash;{formatClipTimecode(clip.end)}
        </span>
        <span className="text-text-disabled flex-shrink-0">({formatClipTimecode(duration)})</span>
        <button
          onClick={onSetLoop}
          title="Set In/Out to this clip's range"
          aria-label={`Set loop to clip ${index + 1}`}
          className="ml-auto flex items-center gap-1 hover:text-accent flex-shrink-0"
        >
          <Repeat className="w-3 h-3" />
          Loop
        </button>
      </div>
    </li>
  )
}

interface ClipPanelProps {
  isOpen: boolean
  onToggle: () => void
  onExportClips: () => void
}

export default function ClipPanel({ isOpen, onToggle, onExportClips }: ClipPanelProps) {
  const { clips, selectedClipId, addClip, updateClip, removeClip, moveClip, selectClip } = useClipStore()
  const { inPoint, outPoint, seek, setInPoint, setOutPoint } = useVideoStore()

  const hasInOut = inPoint !== null && outPoint !== null && outPoint > inPoint
  const totalDuration = clips.reduce((sum, clip) => sum + (clip.end - clip.start), 0)

  const handleAddClip = useCallback(() => {
    if (inPoint === null || outPoint === null) return
    const clip = addClip(inPoint, outPoint)
    if (clip) {
      setInPoint(null)
      setOutPoint(null)
    }
  }, [inPoint, outPoint, addClip, setInPoint, setOutPoint])

  const handleSelect = useCallback((clip: Clip) => {
    selectClip(clip.id)
    seek(clip.start)
  }, [selectClip, seek])

  const handleSetLoop = useCallback((clip: Clip) => {
    setInPoint(clip.start)
    setOutPoint(clip.end)
  }, [setInPoint, setOutPoint])

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        // Offset from LayerPanel's own collapsed toggle (top-1/2) so the two
        // floating buttons don't stack exactly on top of each other when
        // both panels are closed at once.
        className="absolute right-0 top-[38%] -translate-y-1/2 bg-surface-elevated hover:bg-surface-sunken p-2 rounded-l-lg text-text-secondary hover:text-text-primary transition-colors z-20 border border-r-0 border-border-subtle"
        title="Open Clips Panel"
        aria-label="Open clips panel"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
    )
  }

  return (
    <div className="w-72 bg-surface-elevated border-l border-border-subtle flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <h3 className="text-sm font-medium text-text-secondary">
          Clips ({clips.length})
        </h3>
        <div className="flex items-center gap-2">
          {clips.length > 0 && (
            <span className="text-xs text-text-disabled">{formatClipTimecode(totalDuration)}</span>
          )}
          <IconButton onClick={onToggle} title="Close panel" aria-label="Close clips panel" size="sm">
            <ChevronRight className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      {/* Clip list */}
      {clips.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-tertiary text-center leading-relaxed">
            <Scissors className="w-5 h-5 mx-auto mb-2 text-text-disabled" />
            Set In (<Kbd>I</Kbd>) and Out (<Kbd>O</Kbd>), then press <Kbd>Shift</Kbd>+<Kbd>C</Kbd> to
            add a clip.
          </p>
        </div>
      ) : (
        <ul role="list" aria-label="Clips" className="flex-1 overflow-y-auto">
          {clips.map((clip, index) => (
            <ClipRow
              key={clip.id}
              clip={clip}
              index={index}
              isSelected={selectedClipId === clip.id}
              onSelect={() => handleSelect(clip)}
              onRename={(name) => updateClip(clip.id, { name })}
              onSetLoop={() => handleSetLoop(clip)}
              onDelete={() => removeClip(clip.id)}
              onMoveUp={() => moveClip(clip.id, index - 1)}
              onMoveDown={() => moveClip(clip.id, index + 1)}
              isFirst={index === 0}
              isLast={index === clips.length - 1}
            />
          ))}
        </ul>
      )}

      {/* Footer actions */}
      <div className="px-3 py-2 border-t border-border-subtle flex flex-col gap-2">
        <Button
          onClick={handleAddClip}
          disabled={!hasInOut}
          variant="secondary"
          size="sm"
          title={hasInOut ? 'Add clip from In/Out (Shift+C)' : 'Set In (I) and Out (O) first'}
          aria-label="Add clip from current in/out points"
        >
          <Plus className="w-3.5 h-3.5" />
          Add clip
        </Button>
        <Button
          onClick={onExportClips}
          disabled={clips.length === 0}
          size="sm"
          title={clips.length === 0 ? 'Add at least one clip first' : 'Export clips'}
          aria-label="Export clips"
        >
          <Download className="w-3.5 h-3.5" />
          Export clips&hellip;
        </Button>
      </div>
    </div>
  )
}
