'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface CurrentStaff {
  authUserId: string
  fullName: string
  role: string
}

export function useCurrentStaff() {
  const [staff, setStaff] = useState<CurrentStaff | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (active) setLoading(false); return }
      const { data } = await supabase.from('staff').select('full_name, role').eq('auth_user_id', user.id).maybeSingle()
      if (!active) return
      setStaff(data ? { authUserId: user.id, fullName: data.full_name, role: data.role } : null)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])

  return { staff, isAdmin: staff?.role === 'admin', loading }
}
