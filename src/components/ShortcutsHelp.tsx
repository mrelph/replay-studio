import { Modal, Kbd, Button } from './ui'
import { useShortcutsStore, bindingToString } from '@/stores/shortcutsStore'

interface ShortcutsHelpProps {
  onClose: () => void
  onOpenEditor?: () => void
}

// Display order for categories (matches the groupings used in ShortcutsEditor)
const CATEGORY_ORDER = ['Tools', 'Video Playback', 'In/Out Points', 'Editing', 'Colors']

export default function ShortcutsHelp({ onClose, onOpenEditor }: ShortcutsHelpProps) {
  const shortcuts = useShortcutsStore((state) => state.shortcuts)

  const groups = CATEGORY_ORDER.map((title) => ({
    title,
    shortcuts: shortcuts.filter((s) => s.category === title),
  })).filter((group) => group.shortcuts.length > 0)

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Keyboard Shortcuts"
      maxWidth="max-w-3xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-text-tertiary text-sm">
            Press <Kbd>?</Kbd> or <Kbd>Esc</Kbd> to close
          </span>
          {onOpenEditor && (
            <Button variant="secondary" size="sm" onClick={onOpenEditor}>
              Edit shortcuts…
            </Button>
          )}
        </div>
      }
    >
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-accent uppercase tracking-wide mb-3">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.action} className="flex items-center justify-between gap-4">
                    <span className="text-text-secondary text-sm">{shortcut.label}</span>
                    <Kbd>{bindingToString(shortcut.binding)}</Kbd>
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
