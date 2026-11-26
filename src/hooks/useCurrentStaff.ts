'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface CurrentStaff {
  authUserId: string
  fullName: string
  role: string
}

// Who is signed in, and their staff record. Re-reads whenever the auth session
// changes (sign-in, sign-out, a different account, token refresh) instead of
// only once on mount: a one-shot read could keep reporting the previous or an
// empty session, so admin-only features (Audit Log) vanished for an admin.
export function useCurrentStaff() {
  const [staff, setStaff] = useState<CurrentStaff | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lookupError, setLookupError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!active) return
      if (!user) { setStaff(null); setEmail(null); setLookupError(null); setLoading(false); return }
      setEmail(user.email ?? null)
      const { data, error } = await supabase.from('staff')
        .select('full_name, role').eq('auth_user_id', user.id).maybeSingle()
      if (!active) return
      setLookupError(error ? error.message : null)
      setStaff(data ? { authUserId: user.id, fullName: data.full_name, role: data.role } : null)
      setLoading(false)
    }

    load()
    const { data: sub } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') load()
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  return { staff, email, lookupError, isAdmin: staff?.role === 'admin', loading }
}
