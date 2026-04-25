'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { group: 'Overview', items: [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  ]},
  { group: 'Operations', items: [
    { href: '/reservations', label: 'Reservations', icon: '📅' },
    { href: '/front-desk', label: 'Front Desk', icon: '🏨' },
    { href: '/rooms', label: 'Room Management', icon: '🛏' },
    { href: '/housekeeping', label: 'Housekeeping', icon: '🧹' },
  ]},
  { group: 'Finance', items: [
    { href: '/billing', label: 'Billing', icon: '💳' },
  ]},
  { group: 'Management', items: [
    { href: '/reports', label: 'Reports', icon: '📈' },
    { href: '/staff', label: 'Staff & Users', icon: '👥' },
    { href: '/settings', label: 'Settings', icon: '⚙️' },
  ]},
]

interface SidebarProps {
  userName?: string
  userRole?: string
}

export function Sidebar({ userName = 'Tann Pisey & Hong Lim', userRole = 'Owner' }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="w-60 min-h-screen bg-dark-navy flex flex-col flex-shrink-0 sticky top-0 h-screen">
      {/* Logo */}
      <div className="px-6 py-7 border-b border-white/10">
        <div className="font-serif text-white text-xl leading-tight">LPT Hotel</div>
        <div className="text-[11px] text-gold-light tracking-widest uppercase mt-1">Management System</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {navItems.map((group) => (
          <div key={group.group} className="mb-1">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest px-3 pt-4 pb-1">
              {group.group}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-normal transition-all mb-0.5',
                    active
                      ? 'bg-navy text-white font-medium'
                      : 'text-white/65 hover:bg-white/8 hover:text-white'
                  )}
                >
                  <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
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
