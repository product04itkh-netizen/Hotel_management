'use client'
import { useEffect, useId } from 'react'
import { Icon } from './Icon'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  variant = 'default', onConfirm, onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  const isDanger = variant === 'danger'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1A1714]/45 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-[0_24px_64px_-16px_rgba(26,23,20,0.4)] w-full max-w-sm p-6 space-y-4 animate-slide-up"
      >
        <div className="flex items-start gap-3">
          <div className={`flex-none w-9 h-9 rounded-full flex items-center justify-center ${isDanger ? 'bg-red-100 text-red-600' : 'bg-navy/10 text-navy'}`}>
            <Icon name={isDanger ? 'alert' : 'help'} className="w-5 h-5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h3 id={titleId} className="font-semibold text-dark-navy">{title}</h3>
            {message && <p className="text-sm text-hmuted mt-1 whitespace-pre-line">{message}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-hborder text-htext hover:bg-hsurface2 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-navy hover:bg-dark-navy text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
