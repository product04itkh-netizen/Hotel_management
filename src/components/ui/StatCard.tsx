import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: string
  progress?: number
  icon?: ReactNode
}

export function StatCard({ label, value, sub, accent = '#004AAD', progress, icon }: StatCardProps) {
  return (
    <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card relative overflow-hidden">
      <div
        className="absolute top-0 left-0 w-1 h-full rounded-l-2xl"
        style={{ background: accent }}
      />
      <div className="pl-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">{label}</p>
          {icon && <span className="text-xl">{icon}</span>}
        </div>
        <p className="font-serif text-3xl text-dark-navy mt-1.5 leading-none">{value}</p>
        {progress !== undefined && (
          <div className="mt-2 h-1.5 bg-hsurface2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: accent }}
            />
          </div>
        )}
        {sub && <p className="text-xs text-hmuted mt-1.5">{sub}</p>}
      </div>
    </div>
  )
}
