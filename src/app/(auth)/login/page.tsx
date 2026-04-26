'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-hbg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-dark-navy rounded-2xl mb-4">
            <span className="font-serif text-white text-lg">LPT</span>
          </div>
          <h1 className="font-serif text-2xl text-dark-navy">Hotel Management</h1>
          <p className="text-sm text-hmuted mt-1">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-hborder rounded-2xl p-8 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-hmuted uppercase tracking-wide mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="admin@hotel.com"
                className="w-full border border-hborder rounded-lg px-3 py-2.5 text-sm text-htext bg-hbg focus:outline-none focus:border-navy focus:bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-hmuted uppercase tracking-wide mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full border border-hborder rounded-lg px-3 py-2.5 text-sm text-htext bg-hbg focus:outline-none focus:border-navy focus:bg-white transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-navy text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-dark-navy disabled:opacity-60 transition-colors mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-hlight mt-6">
          LPT Hotel Management System © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
