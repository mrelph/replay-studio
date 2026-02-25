interface KbdProps {
  children: React.ReactNode
  className?: string
}

export function Kbd({ children, className = '' }: KbdProps) {
  return (
    <kbd
      className={`
        inline-flex items-center justify-center
        px-1.5 py-0.5 min-w-[1.5rem]
        bg-surface-sunken border border-border
        rounded text-[11px] font-mono text-text-secondary
        ${className}
      `.trim()}
    >
      {children}
    </kbd>
  )
}
