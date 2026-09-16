'use client'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'

export type ToastType = 'success' | 'error' | 'info'

interface ToastMessage {
  id: number
  message: string
  type: ToastType
}

let toastListeners: Array<(msg: ToastMessage) => void> = []
let toastCounter = 0

export function toast(message: string, type: ToastType = 'success') {
  const id = ++toastCounter
  toastListeners.forEach(fn => fn({ id, message, type }))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const listener = (msg: ToastMessage) => {
      setToasts(prev => [...prev, msg])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== msg.id))
      }, 3500)
    }
    toastListeners.push(listener)
    return () => { toastListeners = toastListeners.filter(l => l !== listener) }
  }, [])

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:bottom-6 sm:right-6 z-[9999] flex flex-col sm:items-end gap-2 pointer-events-none"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex items-start gap-3 pl-3 pr-4 py-3 rounded-xl bg-[#241A0F] text-white text-sm shadow-[0_12px_32px_-8px_rgba(26,23,20,0.5)] sm:min-w-[280px] sm:max-w-[420px] animate-slide-up"
        >
          <span
            className={cn(
              'mt-px w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
              t.type === 'success' && 'bg-emerald-400/20 text-emerald-300',
              t.type === 'error' && 'bg-red-400/20 text-red-300',
              t.type === 'info' && 'bg-white/10 text-gold-light',
            )}
          >
            <Icon name={t.type === 'success' ? 'check' : t.type === 'error' ? 'x' : 'info'} className="w-3 h-3" strokeWidth={2.75} />
          </span>
          <span className="leading-5">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
