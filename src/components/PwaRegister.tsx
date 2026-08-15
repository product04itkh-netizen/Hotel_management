'use client'
import { useEffect } from 'react'

// Registers the service worker in production only — never in dev, so it can
// never interfere with webpack's hot-reload pipeline.
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
