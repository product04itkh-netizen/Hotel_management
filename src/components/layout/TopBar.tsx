'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useBranch } from '@/context/BranchContext'
import { useMobileNav } from '@/context/MobileNavContext'
import { branchLogo, branchBrand } from '@/lib/utils'

interface TopBarProps {
  title: string
  subtitle?: string
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const router = useRouter()
  const supabase = createClient()
  const { activeBranch } = useBranch()
  const { toggle } = useMobileNav()

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Display label: "OnlyOne Private Villa · Kampot" or fall back while loading
  const branchLabel = activeBranch
    ? `${branchBrand(activeBranch.location)} · ${activeBranch.location}`
    : 'OnlyOne Homestay'

  return (
    <header className="bg-white border-b border-hborder px-4 sm:px-6 lg:px-8 min-h-[60px] py-2.5 sm:py-0 sm:h-[60px] flex items-center justify-between sticky top-0 z-10 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — mobile/tablet only, opens the Sidebar drawer */}
        <button
          onClick={toggle}
          className="lg:hidden flex-shrink-0 w-9 h-9 -ml-1 rounded-lg text-hmuted hover:text-htext hover:bg-hsurface2 flex items-center justify-center transition-colors"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="min-w-0">
          <h1 className="font-serif text-lg sm:text-xl text-dark-navy leading-none truncate">{title}</h1>
          {subtitle && <p className="text-xs text-hmuted mt-0.5 sm:truncate">{subtitle}</p>}
          {!subtitle && <p className="text-xs text-hmuted mt-0.5 truncate">{today}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          System Online
        </span>
        {/* Dynamic branch label */}
        <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#E8F0FB] text-navy rounded-full text-xs font-medium">
          <span className="text-[10px]">📍</span>
          {branchLabel}
        </span>
        <img src={branchLogo(activeBranch?.location)} alt={activeBranch?.location ?? 'OnlyOne Homestay'} className="hidden sm:block h-7 w-auto object-contain rounded-md" />
        <button
          onClick={handleLogout}
          className="text-xs text-hmuted hover:text-htext border border-hborder px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-hsurface2 transition-colors flex-shrink-0"
        >
          Sign Out
        </button>
      </div>
    </header>
  )
}
