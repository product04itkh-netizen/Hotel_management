'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useBranch } from '@/context/BranchContext'
import type { Reservation } from '@/types'

interface Stats {
  totalHouses: number
  occupiedHouses: number
  todayRevenue: number
  todayCheckIns: number
  todayCheckOuts: number
  pendingHousekeeping: number
  availableHouses: number
  maintenanceHouses: number
}

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Whole days from today (local) to a YYYY-MM-DD date. 0 = today, 1 = tomorrow.
function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}
function arrivalBadge(n: number): { label: string; cls: string } {
  if (n <= 0) return { label: 'Today', cls: 'bg-emerald-100 text-emerald-700' }
  if (n === 1) return { label: 'Tomorrow', cls: 'bg-amber-100 text-amber-700' }
  if (n <= 7) return { label: `in ${n} days`, cls: 'bg-blue-50 text-blue-700' }
  return { label: `in ${n} days`, cls: 'bg-hsurface2 text-hmuted' }
}

export default function DashboardPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()
  const [stats, setStats] = useState<Stats>({
    totalHouses: 0, occupiedHouses: 0, todayRevenue: 0,
    todayCheckIns: 0, todayCheckOuts: 0, pendingHousekeeping: 0,
    availableHouses: 0, maintenanceHouses: 0,
  })
  const [recentReservations, setRecentReservations] = useState<Reservation[]>([])
  const [upcomingCheckIns, setUpcomingCheckIns] = useState<Reservation[]>([])
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null)
  const [weeklyData, setWeeklyData] = useState<number[]>([60, 72, 65, 80, 78, 90, 85])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (activeBranch) loadDashboard()
  }, [activeBranch?.id])

  async function loadDashboard() {
    if (!activeBranch) return
    const today = new Date().toISOString().split('T')[0]

    const [housesRes, checkInsRes, checkOutsRes, revenueRes, housekeepingRes, reservationsRes, upcomingRes] = await Promise.all([
      supabase.from('houses').select('status').eq('branch_id', activeBranch.id),
      supabase.from('reservations').select('id').eq('branch_id', activeBranch.id).eq('check_in_date', today).in('status', ['confirmed', 'checked_in']),
      supabase.from('reservations').select('id').eq('branch_id', activeBranch.id).eq('check_out_date', today).eq('status', 'checked_in'),
      supabase.from('invoices').select('total').eq('branch_id', activeBranch.id).eq('status', 'paid').gte('paid_at', today + 'T00:00:00').lte('paid_at', today + 'T23:59:59'),
      supabase.from('housekeeping_tasks').select('id').eq('branch_id', activeBranch.id).in('status', ['pending', 'in_progress']),
      supabase.from('reservations').select('*, guest:guests(full_name, phone), house:houses(name, code, house_type), line_items:reservation_line_items(id, label, qty, unit_price, amount, discount, revenue_account_code, sort_order)').eq('branch_id', activeBranch.id).order('created_at', { ascending: false }).limit(6),
      // Upcoming arrivals: not-yet-arrived reservations from today onward, soonest first
      supabase.from('reservations').select('*, guest:guests(full_name, phone), house:houses(name, code, house_type), line_items:reservation_line_items(id, label, qty, unit_price, amount, discount, revenue_account_code, sort_order)').eq('branch_id', activeBranch.id).in('status', ['confirmed', 'pending']).gte('check_in_date', today).order('check_in_date', { ascending: true }).limit(10),
    ])

    const houseRows = housesRes.data ?? []
    const occupied = houseRows.filter(h => h.status === 'occupied').length
    const available = houseRows.filter(h => h.status === 'available').length
    const maintenance = houseRows.filter(h => h.status === 'maintenance').length
    const revenue = (revenueRes.data ?? []).reduce((s, i) => s + Number(i.total), 0)

    setStats({
      totalHouses: houseRows.length,
      occupiedHouses: occupied,
      availableHouses: available,
      maintenanceHouses: maintenance,
      todayRevenue: revenue,
      todayCheckIns: checkInsRes.data?.length ?? 0,
      todayCheckOuts: checkOutsRes.data?.length ?? 0,
      pendingHousekeeping: housekeepingRes.data?.length ?? 0,
    })

    setRecentReservations((reservationsRes.data ?? []) as unknown as Reservation[])
    setUpcomingCheckIns((upcomingRes.data ?? []) as unknown as Reservation[])
    setLoading(false)
  }

  const occupancyRate = stats.totalHouses > 0 ? Math.round((stats.occupiedHouses / stats.totalHouses) * 100) : 0
  const maxBar = Math.max(...weeklyData, 1)

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="p-8 flex-1 section-enter">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Occupancy Rate"
            value={`${occupancyRate}%`}
            sub={`${stats.occupiedHouses} / ${stats.totalHouses} houses`}
            accent="#004AAD"
            progress={occupancyRate}
          />
          <StatCard
            label="Today's Revenue"
            value={formatCurrency(stats.todayRevenue)}
            sub="Payments received today"
            accent="#C89B3C"
          />
          <StatCard
            label="Check-ins Today"
            value={stats.todayCheckIns}
            sub={`${stats.availableHouses} houses available`}
            accent="#1A7A4A"
          />
          <StatCard
            label="Check-outs Today"
            value={stats.todayCheckOuts}
            sub={`${stats.pendingHousekeeping} housekeeping tasks`}
            accent="#B83232"
          />
        </div>

        <div className="grid grid-cols-2 gap-5 mb-5">
          {/* Weekly Occupancy Chart */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy">Weekly Occupancy</h3>
            <p className="text-xs text-hmuted mb-4">Room occupancy % — current week</p>
            <div className="flex items-end gap-2 h-24 px-1">
              {weeklyData.map((val, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-sm transition-all duration-500"
                    style={{
                      height: `${(val / maxBar) * 88}px`,
                      background: i >= 4 ? '#C89B3C' : '#004AAD',
                    }}
                  />
                  <span className="text-[10px] text-hmuted">{WEEK_DAYS[i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* House Status Summary */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy">House Status</h3>
            <p className="text-xs text-hmuted mb-4">Current house availability breakdown</p>
            <div className="space-y-3">
              {[
                { label: 'Available',   count: stats.availableHouses,   color: '#1A7A4A' },
                { label: 'Occupied',    count: stats.occupiedHouses,    color: '#004AAD' },
                { label: 'Maintenance', count: stats.maintenanceHouses, color: '#B83232' },
                { label: 'Closed',      count: stats.totalHouses - stats.availableHouses - stats.occupiedHouses - stats.maintenanceHouses, color: '#6B7280' },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
                  <span className="text-sm text-htext flex-1">{row.label}</span>
                  <span className="text-sm font-semibold text-dark-navy">{row.count}</span>
                  <div className="w-24 h-1.5 bg-hsurface2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: stats.totalHouses ? `${(row.count / stats.totalHouses) * 100}%` : '0%',
                        background: row.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Upcoming Check-ins */}
        <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-hborder flex items-center justify-between">
            <div>
              <h3 className="font-serif text-[17px] text-dark-navy">Upcoming Check-ins</h3>
              <p className="text-xs text-hmuted">Arrivals ahead — prep rooms &amp; guests accordingly</p>
            </div>
            {upcomingCheckIns.length > 0 && (
              <span className="text-[11px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
                {upcomingCheckIns.length} arriving
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-hsurface2 text-left">
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Arrives</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Check-in</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Guest</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">House</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Check-out</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-hmuted text-sm">Loading…</td>
                  </tr>
                ) : upcomingCheckIns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-hmuted text-sm">No upcoming check-ins</td>
                  </tr>
                ) : upcomingCheckIns.map(res => {
                  const badge = arrivalBadge(daysUntil(res.check_in_date))
                  return (
                    <tr key={res.id} onClick={() => setSelectedRes(res)} className="border-t border-hborder hover:bg-hbg/50 transition-colors cursor-pointer">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-3 py-2 text-htext text-xs whitespace-nowrap">{formatDate(res.check_in_date)}</td>
                      <td className="px-3 py-2 font-medium text-htext max-w-[160px] truncate" title={(res.guest as any)?.full_name ?? undefined}>{(res.guest as any)?.full_name ?? '—'}</td>
                      <td className="px-3 py-2 text-hmuted font-mono text-xs whitespace-nowrap" title={(res.house as any)?.name ?? undefined}>{(res.house as any)?.code || (res.house as any)?.name || '—'}</td>
                      <td className="px-3 py-2 text-hmuted text-xs whitespace-nowrap">{formatDate(res.check_out_date)}</td>
                      <td className="px-3 py-2"><Badge status={res.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Reservations */}
        <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-hborder">
            <h3 className="font-serif text-[17px] text-dark-navy">Recent Reservations</h3>
            <p className="text-xs text-hmuted">Latest bookings across all channels</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-hsurface2 text-left">
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Ref</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Guest</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">House</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Check-in</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Check-out</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-hmuted text-sm">Loading…</td>
                  </tr>
                ) : recentReservations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-hmuted text-sm">No reservations yet</td>
                  </tr>
                ) : recentReservations.map(res => (
                  <tr key={res.id} onClick={() => setSelectedRes(res)} className="border-t border-hborder hover:bg-hbg/50 transition-colors cursor-pointer">
                    <td className="px-3 py-2 font-mono text-xs text-hmuted whitespace-nowrap">{res.reservation_number}</td>
                    <td className="px-3 py-2 font-medium text-htext max-w-[160px] truncate" title={(res.guest as any)?.full_name ?? undefined}>{(res.guest as any)?.full_name ?? '—'}</td>
                    <td className="px-3 py-2 text-hmuted font-mono text-xs whitespace-nowrap" title={(res.house as any)?.name ?? undefined}>{(res.house as any)?.code || (res.house as any)?.name || '—'}</td>
                    <td className="px-3 py-2 text-hmuted text-xs whitespace-nowrap">{formatDate(res.check_in_date)}</td>
                    <td className="px-3 py-2 text-hmuted text-xs whitespace-nowrap">{formatDate(res.check_out_date)}</td>
                    <td className="px-3 py-2"><Badge status={res.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reservation details */}
      <Modal open={!!selectedRes} onClose={() => setSelectedRes(null)} title={selectedRes?.reservation_number ?? 'Reservation'} size="md">
        {selectedRes && (() => {
          const g = selectedRes.guest as any
          const h = selectedRes.house as any
          const r = selectedRes as any
          const nights = selectedRes.check_in_date && selectedRes.check_out_date
            ? Math.max(0, Math.round((new Date(selectedRes.check_out_date).getTime() - new Date(selectedRes.check_in_date).getTime()) / 86400000))
            : 0
          const badge = arrivalBadge(daysUntil(selectedRes.check_in_date))
          const Row = ({ label, value }: { label: string; value: ReactNode }) => (
            <div className="flex justify-between gap-4 py-2 border-b border-hborder/50 last:border-0">
              <span className="text-xs text-hmuted uppercase tracking-wide">{label}</span>
              <span className="text-sm text-htext text-right">{value}</span>
            </div>
          )
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge status={selectedRes.status} />
                <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
              </div>
              <div className="bg-hsurface2 rounded-xl px-4 py-3">
                <Row label="Guest" value={g?.full_name ?? '—'} />
                {g?.phone && <Row label="Phone" value={g.phone} />}
                <Row label="House" value={`${h?.code ? h.code + ' — ' : ''}${h?.name ?? '—'}${h?.house_type ? ` (${h.house_type})` : ''}`} />
              </div>
              <div className="bg-hsurface2 rounded-xl px-4 py-3">
                <Row label="Check-in" value={formatDate(selectedRes.check_in_date)} />
                <Row label="Check-out" value={formatDate(selectedRes.check_out_date)} />
                <Row label="Nights" value={nights} />
                {r.arrival_time && <Row label="Arrival Time" value={r.arrival_time} />}
                <Row label="Guests" value={`${r.adults ?? 0} adult${(r.adults ?? 0) === 1 ? '' : 's'}${r.children ? `, ${r.children} child${r.children === 1 ? '' : 'ren'}` : ''}`} />
                {r.source && <Row label="Source" value={String(r.source).replace(/_/g, ' ')} />}
              </div>
              {(() => {
                const items: any[] = ((r.line_items as any[]) ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                if (items.length === 0) return null
                const fnb = items.filter(i => i.revenue_account_code === '4100')
                const activities = items.filter(i => i.revenue_account_code !== '4100')
                const group = (title: string, list: any[]) => list.length === 0 ? null : (
                  <div>
                    <p className="text-xs text-hmuted uppercase tracking-wide mb-1">{title}</p>
                    <div className="bg-hsurface2 rounded-xl px-4 py-2">
                      {list.map(it => (
                        <div key={it.id} className="flex justify-between gap-4 py-1.5 border-b border-hborder/50 last:border-0 text-sm">
                          <span className="text-htext">
                            {it.label}
                            {it.qty > 1 && <span className="text-hmuted"> ×{it.qty}</span>}
                            {Number(it.discount) > 0 && <span className="text-[10px] text-emerald-700 ml-1.5">−{formatCurrency(Number(it.discount))}</span>}
                          </span>
                          <span className="text-htext tabular-nums whitespace-nowrap">{formatCurrency(Number(it.amount))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
                return (
                  <div className="space-y-3">
                    {group('Activities & Services', activities)}
                    {group('Food & Beverage', fnb)}
                  </div>
                )
              })()}
              <div className="bg-hsurface2 rounded-xl px-4 py-3">
                {r.deposit > 0 && <Row label="Deposit" value={formatCurrency(Number(r.deposit))} />}
                {r.total_amount != null && <Row label="Total" value={formatCurrency(Number(r.total_amount))} />}
              </div>
              {r.special_requests && (
                <div>
                  <p className="text-xs text-hmuted uppercase tracking-wide mb-1">Special Requests</p>
                  <p className="text-sm text-htext">{r.special_requests}</p>
                </div>
              )}
              {r.notes && (
                <div>
                  <p className="text-xs text-hmuted uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm text-htext">{r.notes}</p>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>
    </>
  )
}
