'use client'
import { useId, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ open, onClose, title, subtitle, children, size = 'md' }: ModalProps) {
  const titleId = useId()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1714]/45 p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'bg-white rounded-2xl shadow-[0_24px_64px_-16px_rgba(26,23,20,0.4)] w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto animate-slide-up',
          {
            'max-w-sm': size === 'sm',
            'max-w-lg': size === 'md',
            'max-w-2xl': size === 'lg',
            'max-w-4xl': size === 'xl',
          }
        )}
      >
        <div className="flex items-start justify-between p-6 pb-4 border-b border-hborder">
          <div className="min-w-0">
            <h2 id={titleId} className="font-serif text-lg text-dark-navy">{title}</h2>
            {subtitle && <p className="text-sm text-hmuted mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-4 -mr-1.5 -mt-0.5 text-hmuted hover:text-htext hover:bg-hsurface2 rounded-lg p-1.5 transition-colors"
          >
            <Icon name="x" className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
