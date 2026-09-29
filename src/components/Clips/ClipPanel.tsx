import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Pencil, Trash2, Play, Repeat, Plus, Download, Scissors,
  Settings2, StickyNote, Tag, X,
} from 'lucide-react'
import { useClipStore } from '@/stores/clipStore'
import { useClipPrefsStore } from '@/stores/clipPrefsStore'
import { useVideoStore } from '@/stores/videoStore'
import { useShortcutKeyLabel } from '@/stores/shortcutsStore'
import { Button, IconButton, Kbd } from '@/components/ui'
import { hashTagColorClass } from '@/utils/clipTags'
import type { Clip } from '@/types/clip'

/** mm:ss.f (tenths of a second), used for clip timecodes and durations. */
function formatClipTimecode(seconds: number): string {
  const total = Math.max(0, seconds)
  const minutes = Math.floor(total / 60)
  const wholeSeconds = Math.floor(total % 60)
  const tenths = Math.floor((total - Math.floor(total)) * 10)
  return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}.${tenths}`
}

/** All tags in use across a project's clips, case-insensitively deduped (keeping the first casing seen). */
function collectAllTags(clips: Clip[]): string[] {
  const byKey = new Map<string, string>()
  for (const clip of clips) {
    for (const tag of clip.tags) {
      const key = tag.toLowerCase()
      if (!byKey.has(key)) byKey.set(key, tag)
    }
  }
  return Array.from(byKey.values())
}

interface TagChipProps {
  tag: string
  /** Renders as a toggle button (filter/sticky-tag pickers) instead of a static chip. */
  onClick?: () => void
  active?: boolean
  onRemove?: () => void
}

/** A small, subtly-colored (hashed by tag) chip; either static, removable, or a toggle button. */
function TagChip({ tag, onClick, active, onRemove }: TagChipProps) {
  const classes = `inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none transition-colors ${hashTagColorClass(tag)} ${
    active ? 'ring-1 ring-accent' : ''
  }`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={!!active} className={classes} title={tag}>
        {tag}
      </button>
    )
  }

  return (
    <span className={classes} title={tag}>
      {tag}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Remove tag ${tag}`}
          className="hover:opacity-70"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  )
}

/** Compact toggle for the pre/post-roll used by "Mark moment" (X). */
function MarkMomentSettings() {
  const preRoll = useClipPrefsStore((s) => s.preRoll)
  const postRoll = useClipPrefsStore((s) => s.postRoll)
  const setPreRoll = useClipPrefsStore((s) => s.setPreRoll)
  const setPostRoll = useClipPrefsStore((s) => s.setPostRoll)
  const shortcutLabel = useShortcutKeyLabel('clip.markMoment')
  const [open, setOpen] = useState(false)

  return (
    <div className="px-3 py-2 border-b border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Mark moment settings"
        className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary w-full"
      >
        <Settings2 className="w-3 h-3 flex-shrink-0" />
        <span>Mark: &minus;{preRoll}s / +{postRoll}s</span>
        {shortcutLabel && <Kbd className="ml-auto">{shortcutLabel}</Kbd>}
      </button>
      {open && (
        <div className="flex items-center gap-4 mt-2">
          <label className="flex items-center gap-1.5 text-xs text-text-tertiary">
            Pre-roll
            <input
              type="number"
              min={0}
              max={60}
              step={0.5}
              value={preRoll}
              onChange={(e) => setPreRoll(parseFloat(e.target.value) || 0)}
              aria-label="Pre-roll seconds"
              className="w-14 px-1.5 py-0.5 bg-surface-sunken text-text-primary text-xs rounded border border-border-subtle focus:outline-none focus:border-accent"
            />
            s
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-tertiary">
            Post-roll
            <input
              type="number"
              min={0}
              max={60}
              step={0.5}
              value={postRoll}
              onChange={(e) => setPostRoll(parseFloat(e.target.value) || 0)}
              aria-label="Post-roll seconds"
              className="w-14 px-1.5 py-0.5 bg-surface-sunken text-text-primary text-xs rounded border border-border-subtle focus:outline-none focus:border-accent"
            />
            s
          </label>
        </div>
      )}
    </div>
  )
}

/** Tags that auto-apply to every newly marked/added clip (Shift+C and X). */
function StickyTagsControl() {
  const stickyTags = useClipPrefsStore((s) => s.stickyTags)
  const toggleStickyTag = useClipPrefsStore((s) => s.toggleStickyTag)
  const [draft, setDraft] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const trimmed = draft.trim()
      if (trimmed) {
        toggleStickyTag(trimmed)
        setDraft('')
      }
    }
  }

  return (
    <div className="px-3 py-2 border-b border-border-subtle">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Tag className="w-3 h-3 text-text-tertiary" />
        <span className="text-xs text-text-tertiary">Sticky tags</span>
      </div>
      <div className="flex items-center gap-1 flex-wrap px-1.5 py-1 bg-surface-sunken rounded border border-border-subtle focus-within:ring-1 focus-within:ring-accent">
        {stickyTags.map((tag) => (
          <TagChip key={tag} tag={tag} onRemove={() => toggleStickyTag(tag)} />
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add sticky tag…"
          aria-label="Add sticky tag"
          className="flex-1 min-w-[5rem] bg-transparent text-xs text-text-primary focus:outline-none placeholder:text-text-disabled"
        />
      </div>
      {stickyTags.length > 0 && (
        <p className="text-[11px] text-text-disabled mt-1">New clips get: {stickyTags.join(', ')}</p>
      )}
    </div>
  )
}

interface FilterBarProps {
  allTags: string[]
  filterTags: Set<string>
  onToggle: (tag: string) => void
  filteredCount: number
  totalCount: number
}

/** Tag chips that filter the clip list below (ANY of the active tags matches). */
function FilterBar({ allTags, filterTags, onToggle, filteredCount, totalCount }: FilterBarProps) {
  if (allTags.length === 0) return null
  return (
    <div className="px-3 py-2 border-b border-border-subtle">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-tertiary">Filter by tag</span>
        {filterTags.size > 0 && (
          <span className="text-xs text-text-disabled">{filteredCount} of {totalCount}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {allTags.map((tag) => (
          <TagChip key={tag} tag={tag} active={filterTags.has(tag.toLowerCase())} onClick={() => onToggle(tag)} />
        ))}
      </div>
    </div>
  )
}

interface ClipRowProps {
  clip: Clip
  index: number
  isSelected: boolean
  allTags: string[]
  onSelect: () => void
  onRename: (name: string) => void
  onSetLoop: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  onSetNotes: (notes: string) => void
  isFirst: boolean
  isLast: boolean
}

function ClipRow({
  clip,
  index,
  isSelected,
  allTags,
  onSelect,
  onRename,
  onSetLoop,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddTag,
  onRemoveTag,
  onSetNotes,
  isFirst,
  isLast,
}: ClipRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(clip.name)
  const [tagDraft, setTagDraft] = useState('')
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

  const tagSuggestions = useMemo(() => {
    const query = tagDraft.trim().toLowerCase()
    if (!query) return []
    const existing = new Set(clip.tags.map((t) => t.toLowerCase()))
    return allTags.filter((t) => !existing.has(t.toLowerCase()) && t.toLowerCase().startsWith(query)).slice(0, 5)
  }, [tagDraft, allTags, clip.tags])

  const commitTagDraft = () => {
    const trimmed = tagDraft.trim()
    if (trimmed) {
      onAddTag(trimmed)
      setTagDraft('')
    }
  }

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitTagDraft()
    } else if (e.key === 'Backspace' && tagDraft === '' && clip.tags.length > 0) {
      onRemoveTag(clip.tags[clip.tags.length - 1])
    }
  }

  const notesPreview = clip.notes.length > 140 ? `${clip.notes.slice(0, 140)}…` : clip.notes

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

      {/* Tag chips + notes indicator, always visible when present. */}
      {(clip.tags.length > 0 || clip.notes.length > 0) && (
        <div className="flex items-center gap-1 px-2 pb-1.5 pl-9 flex-wrap">
          {clip.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
          {clip.notes.length > 0 && (
            <span title={notesPreview} aria-label="Has notes" className="flex-shrink-0">
              <StickyNote className="w-3 h-3 text-text-disabled" />
            </span>
          )}
        </div>
      )}

      {/* Tag/notes editor, only for the selected clip. */}
      {isSelected && (
        <div className="px-2 pb-2 pl-9 space-y-1.5">
          <div className="relative">
            <div className="flex items-center gap-1 flex-wrap px-1.5 py-1 bg-surface-sunken rounded border border-border-subtle focus-within:ring-1 focus-within:ring-accent">
              {clip.tags.map((tag) => (
                <TagChip key={tag} tag={tag} onRemove={() => onRemoveTag(tag)} />
              ))}
              <input
                type="text"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                onBlur={commitTagDraft}
                placeholder={clip.tags.length === 0 ? 'Add tag…' : ''}
                aria-label={`Add tag to clip ${index + 1}`}
                className="flex-1 min-w-[3.5rem] bg-transparent text-xs text-text-primary focus:outline-none placeholder:text-text-disabled"
              />
            </div>
            {tagSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {tagSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onAddTag(suggestion)
                      setTagDraft('')
                    }}
                    className={`px-1.5 py-0.5 rounded-full text-[10px] leading-none opacity-80 hover:opacity-100 ${hashTagColorClass(suggestion)}`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            value={clip.notes}
            onChange={(e) => onSetNotes(e.target.value)}
            placeholder="Notes…"
            rows={2}
            aria-label={`Notes for clip ${index + 1}`}
            className="w-full px-2 py-1 bg-surface-sunken text-text-primary text-xs rounded border border-border-subtle focus:outline-none focus:border-accent resize-none placeholder:text-text-disabled"
          />
        </div>
      )}
    </li>
  )
}

interface ClipPanelProps {
  isOpen: boolean
  onToggle: () => void
  onExportClips: () => void
}

export default function ClipPanel({ isOpen, onToggle, onExportClips }: ClipPanelProps) {
  const {
    clips, selectedClipId, addClip, updateClip, removeClip, moveClip, selectClip,
    addClipTag, removeClipTag, setClipNotes,
  } = useClipStore()
  const { inPoint, outPoint, seek, setInPoint, setOutPoint } = useVideoStore()
  const stickyTags = useClipPrefsStore((s) => s.stickyTags)

  const [filterTags, setFilterTags] = useState<Set<string>>(new Set())

  const hasInOut = inPoint !== null && outPoint !== null && outPoint > inPoint
  const totalDuration = clips.reduce((sum, clip) => sum + (clip.end - clip.start), 0)

  const allTags = useMemo(() => collectAllTags(clips), [clips])

  const filteredClips = useMemo(() => {
    if (filterTags.size === 0) return clips
    return clips.filter((clip) => clip.tags.some((tag) => filterTags.has(tag.toLowerCase())))
  }, [clips, filterTags])

  const toggleFilterTag = useCallback((tag: string) => {
    setFilterTags((prev) => {
      const key = tag.toLowerCase()
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleAddClip = useCallback(() => {
    if (inPoint === null || outPoint === null) return
    const clip = addClip(inPoint, outPoint, undefined, stickyTags)
    if (clip) {
      setInPoint(null)
      setOutPoint(null)
    }
  }, [inPoint, outPoint, addClip, setInPoint, setOutPoint, stickyTags])

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

      <MarkMomentSettings />
      <StickyTagsControl />
      <FilterBar
        allTags={allTags}
        filterTags={filterTags}
        onToggle={toggleFilterTag}
        filteredCount={filteredClips.length}
        totalCount={clips.length}
      />

      {/* Clip list */}
      {clips.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-tertiary text-center leading-relaxed">
            <Scissors className="w-5 h-5 mx-auto mb-2 text-text-disabled" />
            Set In (<Kbd>I</Kbd>) and Out (<Kbd>O</Kbd>), then press <Kbd>Shift</Kbd>+<Kbd>C</Kbd> to
            add a clip, or press <Kbd>X</Kbd> to mark a moment around the playhead.
          </p>
        </div>
      ) : (
        <ul role="list" aria-label="Clips" className="flex-1 overflow-y-auto">
          {filteredClips.map((clip) => {
            const index = clips.findIndex((c) => c.id === clip.id)
            return (
              <ClipRow
                key={clip.id}
                clip={clip}
                index={index}
                isSelected={selectedClipId === clip.id}
                allTags={allTags}
                onSelect={() => handleSelect(clip)}
                onRename={(name) => updateClip(clip.id, { name })}
                onSetLoop={() => handleSetLoop(clip)}
                onDelete={() => removeClip(clip.id)}
                onMoveUp={() => moveClip(clip.id, index - 1)}
                onMoveDown={() => moveClip(clip.id, index + 1)}
                onAddTag={(tag) => addClipTag(clip.id, tag)}
                onRemoveTag={(tag) => removeClipTag(clip.id, tag)}
                onSetNotes={(notes) => setClipNotes(clip.id, notes)}
                isFirst={index === 0}
                isLast={index === clips.length - 1}
              />
            )
          })}
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

