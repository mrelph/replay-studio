interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'accent' | 'success' | 'error'
  className?: string
}

const variantClasses = {
  default: 'bg-surface-sunken text-text-tertiary',
  accent: 'bg-accent-subtle text-accent',
  success: 'bg-success-subtle text-success',
  error: 'bg-error-subtle text-error',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center justify-center
        px-1.5 py-0.5 min-w-[1.25rem]
        rounded-full text-[10px] font-medium
        ${variantClasses[variant]}
        ${className}
      `.trim()}
    >
      {children}
    </span>
  )
}
