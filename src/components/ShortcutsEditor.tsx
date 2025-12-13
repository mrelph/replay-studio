import { useState, useEffect, useCallback } from 'react'
import { useShortcutsStore, bindingToString, type ShortcutAction, type ShortcutBinding } from '@/stores/shortcutsStore'

interface ShortcutsEditorProps {
  onClose: () => void
}

export default function ShortcutsEditor({ onClose }: ShortcutsEditorProps) {
  const { shortcuts, updateShortcut, resetToDefaults } = useShortcutsStore()
  const [editingAction, setEditingAction] = useState<ShortcutAction | null>(null)
  const [pendingBinding, setPendingBinding] = useState<ShortcutBinding | null>(null)

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = []
    }
    acc[shortcut.category].push(shortcut)
    return acc
  }, {} as Record<string, typeof shortcuts>)

  const handleKeyCapture = useCallback((e: KeyboardEvent) => {
    if (!editingAction) return

    e.preventDefault()
    e.stopPropagation()

    // Ignore modifier-only keys
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return
    }

    const binding: ShortcutBinding = {
      key: e.key.toLowerCase(),
      ctrl: e.ctrlKey || e.metaKey || undefined,
      shift: e.shiftKey || undefined,
      alt: e.altKey || undefined,
    }

    // Clean up undefined modifiers
    if (!binding.ctrl) delete binding.ctrl
    if (!binding.shift) delete binding.shift
    if (!binding.alt) delete binding.alt

    setPendingBinding(binding)
  }, [editingAction])

  useEffect(() => {
    if (editingAction) {
      window.addEventListener('keydown', handleKeyCapture, true)
      return () => window.removeEventListener('keydown', handleKeyCapture, true)
    }
  }, [editingAction, handleKeyCapture])

  const startEditing = (action: ShortcutAction) => {
    setEditingAction(action)
    setPendingBinding(null)
  }

  const confirmEdit = () => {
    if (editingAction && pendingBinding) {
      updateShortcut(editingAction, pendingBinding)
    }
    setEditingAction(null)
    setPendingBinding(null)
  }

  const cancelEdit = () => {
    setEditingAction(null)
    setPendingBinding(null)
  }

  const handleReset = () => {
    if (confirm('Reset all shortcuts to defaults?')) {
      resetToDefaults()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Customize Keyboard Shortcuts</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            >
              Reset to Defaults
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-8">
            {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wide mb-3">
                  {category}
                </h3>
                <div className="bg-gray-900/50 rounded-lg overflow-hidden">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div
                      key={shortcut.action}
                      className={`flex items-center justify-between px-4 py-3 ${
                        index > 0 ? 'border-t border-gray-700/50' : ''
                      }`}
                    >
                      <span className="text-gray-300">{shortcut.label}</span>
                      <div className="flex items-center gap-2">
                        {editingAction === shortcut.action ? (
                          <>
                            <kbd className="px-3 py-1.5 bg-blue-600 rounded text-white text-sm font-mono min-w-[4rem] text-center">
                              {pendingBinding
                                ? bindingToString(pendingBinding)
                                : 'Press key...'}
                            </kbd>
                            <button
                              onClick={confirmEdit}
                              disabled={!pendingBinding}
                              className="px-2 py-1 text-green-400 hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-2 py-1 text-red-400 hover:text-red-300"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </>
                        ) : (
                          <>
                            <kbd className="px-3 py-1.5 bg-gray-700 rounded text-gray-200 text-sm font-mono min-w-[4rem] text-center">
                              {bindingToString(shortcut.binding)}
                            </kbd>
                            <button
                              onClick={() => startEditing(shortcut.action)}
                              className="px-2 py-1 text-gray-400 hover:text-white transition-colors"
                              title="Click to edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
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
            Click the edit button next to a shortcut to change it. Press{' '}
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 text-xs">Esc</kbd> to close.
          </span>
        </div>
      </div>
    </div>
  )
}
