'use client'
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Branch } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BranchContextValue {
  /** All active branches loaded from the database */
  branches: Branch[]
  /** Currently selected branch (null only while loading) */
  activeBranch: Branch | null
  /** Switch to a different branch — persists to localStorage */
  setActiveBranch: (branch: Branch) => void
  /** True while branches are being fetched */
  loading: boolean
}

// ─── Context ─────────────────────────────────────────────────────────────────

const BranchContext = createContext<BranchContextValue>({
  branches: [],
  activeBranch: null,
  setActiveBranch: () => {},
  loading: true,
})

// ─── Provider ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'onlyone_active_branch_id'

export function BranchProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [branches, setBranches] = useState<Branch[]>([])
  const [activeBranch, setActiveBranchState] = useState<Branch | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadBranches() {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('location')

      const list = (data ?? []) as Branch[]
      setBranches(list)

      // Restore last-selected branch from localStorage, fall back to first
      const savedId = typeof window !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY)
        : null
      const restored = savedId ? list.find(b => b.id === savedId) : null
      setActiveBranchState(restored ?? list[0] ?? null)
      setLoading(false)
    }

    loadBranches()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveBranch = useCallback((branch: Branch) => {
    setActiveBranchState(branch)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, branch.id)
    }
  }, [])

  return (
    <BranchContext.Provider value={{ branches, activeBranch, setActiveBranch, loading }}>
      {children}
    </BranchContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Access the current branch selection and switcher from any dashboard component.
 *
 * @example
 * const { activeBranch, branches, setActiveBranch } = useBranch()
 * // Filter Supabase queries:
 * supabase.from('rooms').select('*').eq('branch_id', activeBranch?.id)
 */
export function useBranch() {
  return useContext(BranchContext)
}
