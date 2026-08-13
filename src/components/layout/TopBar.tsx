'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useBranch } from '@/context/BranchContext'
import { branchLogo } from '@/lib/utils'

interface TopBarProps {
  title: string
  subtitle?: string
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const router = useRouter()
  const supabase = createClient()
  const { activeBranch } = useBranch()

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Display label: "OnlyOne Homestay · Kampot" or fall back while loading
  const branchLabel = activeBranch
    ? `${activeBranch.name} · ${activeBranch.location}`
    : 'OnlyOne Homestay'

  return (
    <header className="bg-white border-b border-hborder px-8 h-[60px] flex items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="font-serif text-xl text-dark-navy leading-none">{title}</h1>
        {subtitle && <p className="text-xs text-hmuted mt-0.5">{subtitle}</p>}
        {!subtitle && <p className="text-xs text-hmuted mt-0.5">{today}</p>}
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          System Online
        </span>
        {/* Dynamic branch label */}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#E8F0FB] text-navy rounded-full text-xs font-medium">
          <span className="text-[10px]">📍</span>
          {branchLabel}
        </span>
        <img src={branchLogo(activeBranch?.location)} alt={activeBranch?.location ?? 'OnlyOne Homestay'} className="h-7 w-auto object-contain rounded-md" />
        <button
          onClick={handleLogout}
          className="text-xs text-hmuted hover:text-htext border border-hborder px-3 py-1.5 rounded-lg hover:bg-hsurface2 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </header>
  )
}
