import { forwardRef } from 'react'

type IconButtonVariant = 'ghost' | 'subtle' | 'active'
type IconButtonSize = 'sm' | 'md' | 'lg'

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant
  size?: IconButtonSize
}

const variantClasses: Record<IconButtonVariant, string> = {
  ghost: 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated',
  subtle: 'text-text-tertiary hover:text-text-secondary hover:bg-surface-sunken',
  active: 'bg-accent text-accent-text shadow-md',
}

const sizeClasses: Record<IconButtonSize, string> = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-10 h-10',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'ghost', size = 'md', className = '', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center rounded-lg
          transition-colors duration-150
          disabled:opacity-25 disabled:cursor-not-allowed disabled:pointer-events-none
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `.trim()}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    )
  }
)

IconButton.displayName = 'IconButton'
