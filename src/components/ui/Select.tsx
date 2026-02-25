import { forwardRef } from 'react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  fullWidth?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', fullWidth, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`
          bg-surface-sunken text-text-primary text-sm rounded-md
          px-3 py-1.5 border border-border
          hover:border-border-strong
          focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent
          cursor-pointer transition-colors
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {children}
      </select>
    )
  }
)

Select.displayName = 'Select'
