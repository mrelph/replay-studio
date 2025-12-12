interface ShortcutsHelpProps {
  onClose: () => void
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
      { key: 'L', description: 'Line tool' },
      { key: 'A', description: 'Arrow tool' },
      { key: 'R', description: 'Rectangle tool' },
      { key: 'C', description: 'Circle/Ellipse tool' },
      { key: 'T', description: 'Text tool' },
      { key: 'S', description: 'Spotlight tool' },
      { key: 'M', description: 'Magnifier tool' },
      { key: 'K', description: 'Player tracker' },
    ],
  },
  {
    title: 'Video Playback',
    shortcuts: [
      { key: 'Space', description: 'Play / Pause' },
      { key: '←', description: 'Previous frame' },
      { key: '→', description: 'Next frame' },
      { key: 'J', description: 'Step backward' },
      { key: 'K', description: 'Pause' },
      { key: 'L', description: 'Step forward' },
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {shortcutGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wide mb-3">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut) => (
                    <div key={shortcut.key} className="flex items-center justify-between">
                      <span className="text-gray-300 text-sm">{shortcut.description}</span>
                      <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-200 text-xs font-mono min-w-[2rem] text-center">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-700 text-center">
          <span className="text-gray-500 text-sm">
            Press <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 text-xs">?</kbd> or{' '}
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 text-xs">Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  )
}
