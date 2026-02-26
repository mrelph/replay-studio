import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />,
  error: <AlertCircle className="w-4 h-4 text-error flex-shrink-0" />,
  info: <Info className="w-4 h-4 text-info flex-shrink-0" />,
}

const bgClasses: Record<ToastType, string> = {
  success: 'border-success/30 bg-success-subtle',
  error: 'border-error/30 bg-error-subtle',
  info: 'border-info/30 bg-info-subtle',
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setVisible(true))

    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(toast.id), 200)
    }, 3000)

    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-lg backdrop-blur-sm transition-all duration-200 ${bgClasses[toast.type]} ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {icons[toast.type]}
      <span className="text-sm text-text-primary">{toast.message}</span>
      <button
        onClick={() => {
          setVisible(false)
          setTimeout(() => onDismiss(toast.id), 200)
        }}
        className="ml-2 p-0.5 text-text-tertiary hover:text-text-primary rounded transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// Global toast state
let toastListeners: Array<(toasts: ToastMessage[]) => void> = []
let currentToasts: ToastMessage[] = []

function notifyListeners() {
  toastListeners.forEach((fn) => fn([...currentToasts]))
}

export function toast(type: ToastType, message: string) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  currentToasts = [...currentToasts, { id, type, message }]
  notifyListeners()
}

export function dismissToast(id: string) {
  currentToasts = currentToasts.filter((t) => t.id !== id)
  notifyListeners()
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    toastListeners.push(setToasts)
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== setToasts)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>
  )
}
