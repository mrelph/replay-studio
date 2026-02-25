import { useState, useEffect, useCallback } from 'react'
import { Check, X, Pencil } from 'lucide-react'
import { useShortcutsStore, bindingToString, type ShortcutAction, type ShortcutBinding } from '@/stores/shortcutsStore'
import { Modal, Button, Kbd, IconButton } from './ui'

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
    <Modal
      open={true}
      onClose={onClose}
      title="Customize Keyboard Shortcuts"
      maxWidth="max-w-4xl"
      footer={
        <div className="flex items-center justify-between">
          <Button onClick={handleReset} variant="ghost" size="sm">
            Reset to Defaults
          </Button>
          <span className="text-text-tertiary text-sm">
            Click the edit button next to a shortcut to change it. Press <Kbd>Esc</Kbd> to close.
          </span>
        </div>
      }
    >
      <div className="p-6">
        <div className="space-y-8">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-accent uppercase tracking-wide mb-3">
                {category}
              </h3>
              <div className="bg-surface-sunken/50 rounded-lg overflow-hidden">
                {categoryShortcuts.map((shortcut, index) => (
                  <div
                    key={shortcut.action}
                    className={`flex items-center justify-between px-4 py-3 ${
                      index > 0 ? 'border-t border-border-subtle' : ''
                    }`}
                  >
                    <span className="text-text-secondary">{shortcut.label}</span>
                    <div className="flex items-center gap-2">
                      {editingAction === shortcut.action ? (
                        <>
                          <kbd className="px-3 py-1.5 bg-accent rounded text-accent-text text-sm font-mono min-w-[4rem] text-center">
                            {pendingBinding
                              ? bindingToString(pendingBinding)
                              : 'Press key...'}
                          </kbd>
                          <IconButton
                            onClick={confirmEdit}
                            disabled={!pendingBinding}
                            size="sm"
                            className="text-success hover:text-green-300"
                          >
                            <Check className="w-4 h-4" />
                          </IconButton>
                          <IconButton onClick={cancelEdit} size="sm" className="text-error hover:text-red-300">
                            <X className="w-4 h-4" />
                          </IconButton>
                        </>
                      ) : (
                        <>
                          <Kbd>{bindingToString(shortcut.binding)}</Kbd>
                          <IconButton
                            onClick={() => startEditing(shortcut.action)}
                            title="Click to edit"
                            size="sm"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </IconButton>
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
    </Modal>
  )
}
