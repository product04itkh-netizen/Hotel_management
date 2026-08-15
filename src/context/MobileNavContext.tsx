'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'

interface MobileNavContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const MobileNavContext = createContext<MobileNavContextValue>({
  open: false, setOpen: () => {}, toggle: () => {},
})

// Shared between Sidebar (renders the drawer) and TopBar (renders the
// hamburger trigger), which are siblings in the dashboard layout — avoids
// prop-drilling through every page that renders <TopBar>.
export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <MobileNavContext.Provider value={{ open, setOpen, toggle: () => setOpen(v => !v) }}>
      {children}
    </MobileNavContext.Provider>
  )
}

export function useMobileNav() {
  return useContext(MobileNavContext)
}
