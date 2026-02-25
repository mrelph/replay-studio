import { forwardRef } from 'react'

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  trackClass?: string
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ className = '', trackClass, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="range"
        className={`
          slider w-full h-1 rounded-full appearance-none cursor-pointer
          bg-surface-sunken
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-accent
          [&::-webkit-slider-thumb]:hover:bg-accent-hover
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:shadow-md
          [&::-webkit-slider-thumb]:transition-colors
          ${trackClass || ''}
          ${className}
        `.trim()}
        {...props}
      />
    )
  }
)

Slider.displayName = 'Slider'
