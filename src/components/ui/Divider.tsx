interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function Divider({ orientation = 'horizontal', className = '' }: DividerProps) {
  return orientation === 'horizontal' ? (
    <div className={`h-px bg-border-subtle ${className}`} />
  ) : (
    <div className={`w-px bg-border-subtle self-stretch ${className}`} />
  )
}
