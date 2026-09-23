import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Server-only. Uses the service-role key, which bypasses RLS and can manage
// auth.users directly. Never import this from a 'use client' file or expose
// SUPABASE_SERVICE_ROLE_KEY via NEXT_PUBLIC_*.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    // Name the place that actually needs fixing: on a deployment the fix is a
    // Vercel environment variable plus a redeploy, not .env.local.
    const missing = !serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : 'NEXT_PUBLIC_SUPABASE_URL'
    throw new Error(
      process.env.VERCEL
        ? `${missing} is not set on this deployment. Add it in Vercel → Project Settings → Environment Variables (Production and Preview), then redeploy — env vars only apply to new deployments. The value is in Supabase → Project Settings → API keys.`
        : `${missing} is not set. Add it to .env.local from Supabase → Project Settings → API keys, then restart the dev server.`
    )
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
