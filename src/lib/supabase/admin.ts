import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Server-only. Uses the service-role key, which bypasses RLS and can manage
// auth.users directly. Never import this from a 'use client' file or expose
// SUPABASE_SERVICE_ROLE_KEY via NEXT_PUBLIC_*.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — add it to .env.local from Supabase Project Settings → API → service_role key.')
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
