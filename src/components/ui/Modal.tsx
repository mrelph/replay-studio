import { useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: string
  disableClose?: boolean
}

export function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-lg', disableClose }: ModalProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !disableClose) {
      onClose()
    }
  }, [onClose, disableClose])

  useEffect(() => {
    if (open) {
      window.addEventListener('keydown', handleEscape)
      return () => window.removeEventListener('keydown', handleEscape)
    }
  }, [open, handleEscape])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-surface-overlay backdrop-blur-sm flex items-center justify-center z-50"
      onClick={disableClose ? undefined : onClose}
    >
      <div
        className={`bg-surface-elevated rounded-xl shadow-xl w-full ${maxWidth} mx-4 max-h-[85vh] overflow-hidden border border-border-subtle`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          {!disableClose && (
            <IconButton onClick={onClose} variant="ghost" size="sm">
              <X className="w-5 h-5" />
            </IconButton>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto max-h-[calc(85vh-130px)]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-border-subtle">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
