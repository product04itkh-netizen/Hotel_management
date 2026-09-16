import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'primary', size = 'md', className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-150 focus:outline-none select-none disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-navy text-white hover:bg-dark-navy active:bg-dark-navy': variant === 'primary',
          'bg-transparent text-navy border border-hborder hover:bg-hsurface2 active:bg-hborder/60': variant === 'ghost',
          'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 active:bg-red-200/70': variant === 'danger',
          'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 active:bg-green-200/70': variant === 'success',
        },
        {
          'px-3 py-1.5 text-xs': size === 'sm',
          'px-4 py-2 text-sm': size === 'md',
          'px-6 py-2.5 text-base': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
