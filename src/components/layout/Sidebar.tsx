'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useBranch } from '@/context/BranchContext'
import type { Branch } from '@/types'

// ─── Navigation items ─────────────────────────────────────────────────────────

const navItems = [
  { group: 'Overview', items: [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  ]},
  { group: 'Operations', items: [
    { href: '/reservations', label: 'Reservations', icon: '📅' },
    { href: '/front-desk', label: 'Front Desk', icon: '🏨' },
    { href: '/rooms', label: 'Properties', icon: '🏡' },
    { href: '/housekeeping', label: 'Housekeeping', icon: '🧹' },
  ]},
  { group: 'Finance', items: [
    { href: '/billing', label: 'Billing', icon: '💳' },
    { href: '/accounting', label: 'Accounting', icon: '📒' },
    { href: '/assets', label: 'Fixed Assets', icon: '🏗️' },
  ]},
  { group: 'Management', items: [
    { href: '/reports', label: 'Reports', icon: '📈' },
    { href: '/staff', label: 'Staff & Users', icon: '👥' },
    { href: '/settings', label: 'Settings', icon: '⚙️' },
  ]},
]

// ─── Branch Switcher ──────────────────────────────────────────────────────────

function BranchSwitcher() {
  const { branches, activeBranch, setActiveBranch, loading } = useBranch()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (loading) {
    return (
      <div className="mx-3 my-3 px-3 py-2.5 rounded-xl bg-white/5 animate-pulse h-[56px]" />
    )
  }

  if (!activeBranch) return null

  function handleSelect(branch: Branch) {
    setActiveBranch(branch)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative mx-3 my-3">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-150 text-left group',
          open
            ? 'bg-white/12 ring-1 ring-white/20'
            : 'bg-white/6 hover:bg-white/10'
        )}
      >
        {/* Branch icon */}
        <div className="w-7 h-7 rounded-lg bg-gold/20 flex items-center justify-center flex-shrink-0">
          <span className="text-gold text-[13px]">📍</span>
        </div>

        {/* Branch info */}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-white/90 leading-none truncate">
            {activeBranch.location}
          </p>
          <p className="text-[10px] text-white/40 mt-0.5 truncate">
            {activeBranch.name}
          </p>
        </div>

        {/* Chevron */}
        <svg
          className={cn(
            'w-3.5 h-3.5 text-white/40 flex-shrink-0 transition-transform duration-200',
            open && 'rotate-180'
          )}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#0A1628] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden animate-slide-up">
          <p className="px-3 pt-2.5 pb-1.5 text-[9px] font-bold text-white/30 uppercase tracking-widest">
            Switch Branch
          </p>
          {branches.map(branch => {
            const isActive = branch.id === activeBranch.id
            return (
              <button
                key={branch.id}
                onClick={() => handleSelect(branch)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors duration-100 text-left',
                  isActive
                    ? 'bg-navy/60 text-white'
                    : 'text-white/65 hover:bg-white/6 hover:text-white'
                )}
              >
                {/* Check indicator */}
                <span className={cn(
                  'w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors',
                  isActive
                    ? 'border-gold bg-gold/20'
                    : 'border-white/20'
                )}>
                  {isActive && (
                    <svg className="w-2.5 h-2.5 text-gold" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </span>

                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium leading-none">{branch.location}</p>
                  <p className="text-[10px] text-white/35 mt-0.5">{branch.address ?? branch.name}</p>
                </div>
              </button>
            )
          })}

          {/* Divider + label */}
          <div className="px-3 py-2 border-t border-white/8 mt-0.5">
            <p className="text-[9px] text-white/20 text-center">
              Data is scoped to the selected branch
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  userName?: string
  userRole?: string
}

export function Sidebar({ userName = 'Tann Pisey & Hong Lim', userRole = 'Owner' }: SidebarProps) {
  const pathname = usePathname()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  return (
    <aside className="w-60 min-h-screen bg-dark-navy flex flex-col flex-shrink-0 sticky top-0 h-screen">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-center">
        <img
          src="/logo.jpg"
          alt="OnlyOne Homestay"
          className="h-16 w-auto object-contain rounded-xl bg-white px-2 py-1.5 shadow-sm"
        />
      </div>

      {/* Branch Switcher */}
      <BranchSwitcher />

      {/* Divider */}
      <div className="mx-3 h-px bg-white/8" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {navItems.map((group) => (
          <div key={group.group} className="mb-1">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest px-3 pt-4 pb-1">
              {group.group}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href
              const pending = pendingHref === item.href && !active
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => { if (!active) setPendingHref(item.href) }}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-normal transition-all duration-150 mb-0.5',
                    active
                      ? 'bg-navy text-white font-medium'
                      : pending
                        ? 'bg-navy/60 text-white/90'
                        : 'text-white/65 hover:bg-white/8 hover:text-white'
                  )}
                >
                  <span className={cn('text-base w-5 text-center flex-shrink-0 transition-transform duration-150', pending && 'scale-110')}>
                    {item.icon}
                  </span>
                  {item.label}
                  {pending && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-gold animate-pulse flex-shrink-0" />
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer — user info */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center text-dark-navy text-xs font-bold flex-shrink-0">
            {userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] text-white/80 font-medium truncate">{userName}</p>
            <p className="text-[11px] text-white/40">{userRole}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
