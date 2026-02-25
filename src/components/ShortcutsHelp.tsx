import { Modal, Kbd } from './ui'

interface ShortcutsHelpProps {
  onClose: () => void
  onOpenEditor?: () => void
}

interface ShortcutGroup {
  title: string
  shortcuts: { key: string; description: string }[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Tools',
    shortcuts: [
      { key: 'V', description: 'Select tool' },
      { key: 'P', description: 'Pen (freehand draw)' },
      { key: 'Shift+L', description: 'Line tool' },
      { key: 'A', description: 'Arrow tool' },
      { key: 'R', description: 'Rectangle tool' },
      { key: 'C', description: 'Circle/Ellipse tool' },
      { key: 'T', description: 'Text tool' },
      { key: 'S', description: 'Spotlight tool' },
      { key: 'Shift+M', description: 'Magnifier tool' },
      { key: 'Shift+K', description: 'Player tracker' },
    ],
  },
  {
    title: 'Video Playback',
    shortcuts: [
      { key: 'Space', description: 'Play / Pause' },
      { key: '\u2190', description: 'Previous frame' },
      { key: '\u2192', description: 'Next frame' },
      { key: 'J', description: 'Skip backward 10s' },
      { key: 'K', description: 'Pause' },
      { key: 'L', description: 'Skip forward 10s' },
      { key: 'Home', description: 'Go to start' },
      { key: 'End', description: 'Go to end' },
    ],
  },
  {
    title: 'In/Out Points',
    shortcuts: [
      { key: 'I', description: 'Set In point' },
      { key: 'O', description: 'Set Out point' },
      { key: '[', description: 'Jump to In point' },
      { key: ']', description: 'Jump to Out point' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { key: 'Ctrl+Z', description: 'Undo' },
      { key: 'Ctrl+Y', description: 'Redo' },
      { key: 'Ctrl+A', description: 'Select all' },
      { key: 'Delete', description: 'Delete selected' },
      { key: 'Escape', description: 'Deselect / Select tool' },
    ],
  },
  {
    title: 'Colors',
    shortcuts: [
      { key: '1-9', description: 'Quick color presets' },
    ],
  },
]

export default function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Keyboard Shortcuts"
      maxWidth="max-w-3xl"
      footer={
        <div className="text-center">
          <span className="text-text-tertiary text-sm">
            Press <Kbd>?</Kbd> or <Kbd>Esc</Kbd> to close
          </span>
        </div>
      }
    >
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-accent uppercase tracking-wide mb-3">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.key} className="flex items-center justify-between">
                    <span className="text-text-secondary text-sm">{shortcut.description}</span>
                    <Kbd>{shortcut.key}</Kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
