'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'

interface MonthlyData {
  month: string
  revenue: number
  reservations: number
  occupancyRate: number
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function ReportsPage() {
  const supabase = createClient()
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [roomTypeStats, setRoomTypeStats] = useState<{ type: string; count: number }[]>([])
  const [sourceStats, setSourceStats] = useState<{ source: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({ totalRevenue: 0, totalGuests: 0, avgStay: 0, adr: 0, revpar: 0 })

  useEffect(() => { loadReports() }, [])

  async function loadReports() {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
    const startDate = sixMonthsAgo.toISOString().split('T')[0]

    const [invRes, resRes, roomRes] = await Promise.all([
      supabase.from('invoices').select('total, paid_at').eq('status', 'paid').gte('paid_at', startDate),
      supabase.from('reservations').select('source, check_in_date, check_out_date, status, room:rooms(room_type)').gte('created_at', startDate),
      supabase.from('rooms').select('room_type, status'),
    ])

    const invoices = invRes.data ?? []
    const reservations = resRes.data ?? []
    const allRooms = roomRes.data ?? []

    // Monthly breakdown
    const months: MonthlyData[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      const monthRevenue = invoices
        .filter(inv => inv.paid_at?.startsWith(monthKey))
        .reduce((s, inv) => s + Number(inv.total), 0)
      const monthReservations = reservations.filter(r => r.check_in_date?.startsWith(monthKey)).length
      months.push({ month: label, revenue: monthRevenue, reservations: monthReservations, occupancyRate: Math.min(95, 40 + monthReservations * 3) })
    }
    setMonthlyData(months)

    // Room type distribution
    const typeMap: Record<string, number> = {}
    reservations.forEach(r => {
      const type = (r.room as any)?.room_type ?? 'unknown'
      typeMap[type] = (typeMap[type] ?? 0) + 1
    })
    setRoomTypeStats(Object.entries(typeMap).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count))

    // Booking source
    const srcMap: Record<string, number> = {}
    reservations.forEach(r => { srcMap[r.source] = (srcMap[r.source] ?? 0) + 1 })
    setSourceStats(Object.entries(srcMap).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count))

    // KPIs
    const totalRevenue = invoices.reduce((s, i) => s + Number(i.total), 0)
    const totalGuests = reservations.filter(r => r.status !== 'cancelled').length
    const stays = reservations.filter(r => r.check_in_date && r.check_out_date)
    const avgStay = stays.length > 0
      ? stays.reduce((s, r) => {
          const diff = new Date(r.check_out_date).getTime() - new Date(r.check_in_date).getTime()
          return s + diff / (1000 * 60 * 60 * 24)
        }, 0) / stays.length
      : 0
    const adr = totalGuests > 0 ? totalRevenue / totalGuests : 0
    const revpar = allRooms.length > 0 ? totalRevenue / (allRooms.length * 180) : 0

    setKpis({ totalRevenue, totalGuests, avgStay: Math.round(avgStay * 10) / 10, adr, revpar })
    setLoading(false)
  }

  const maxRevenue = Math.max(...monthlyData.map(m => m.revenue), 1)
  const maxRes = Math.max(...monthlyData.map(m => m.reservations), 1)
  const totalRoomType = roomTypeStats.reduce((s, r) => s + r.count, 0)
  const totalSource = sourceStats.reduce((s, r) => s + r.count, 0)

  const TYPE_COLORS: Record<string, string> = {
    standard: '#004AAD', deluxe: '#C89B3C', suite: '#1A7A4A', presidential: '#B83232',
  }

  return (
    <>
      <TopBar title="Reports & Analytics" subtitle="Occupancy, revenue & KPIs" />
      <div className="p-8 flex-1 section-enter">
        {/* KPIs */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total Revenue', value: formatCurrency(kpis.totalRevenue), accent: '#C89B3C' },
            { label: 'Total Guests', value: kpis.totalGuests, accent: '#004AAD' },
            { label: 'Avg Stay (nights)', value: kpis.avgStay, accent: '#1A7A4A' },
            { label: 'Avg Daily Rate', value: formatCurrency(kpis.adr), accent: '#7C3AED' },
            { label: 'RevPAR (6mo)', value: formatCurrency(kpis.revpar), accent: '#B83232' },
          ].map(k => (
            <div key={k.label} className="bg-white border border-hborder rounded-2xl p-4 shadow-card relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: k.accent }} />
              <p className="text-[11px] text-hmuted uppercase tracking-wide pl-2">{k.label}</p>
              <p className="font-serif text-2xl text-dark-navy mt-1 pl-2">{k.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-5 mb-5">
          {/* Revenue chart */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy mb-1">Monthly Revenue</h3>
            <p className="text-xs text-hmuted mb-4">Last 6 months — paid invoices</p>
            {loading ? <div className="h-28 flex items-center justify-center text-hmuted text-sm">Loading…</div> : (
              <div className="flex items-end gap-3 h-28">
                {monthlyData.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-hmuted">{formatCurrency(m.revenue, 'USD').replace('$', '$').replace(/\.00$/, '')}</span>
                    <div
                      className="w-full rounded-t-sm bg-navy transition-all duration-500"
                      style={{ height: `${(m.revenue / maxRevenue) * 80}px`, minHeight: 4 }}
                    />
                    <span className="text-[10px] text-hmuted whitespace-nowrap">{m.month.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reservations chart */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy mb-1">Monthly Reservations</h3>
            <p className="text-xs text-hmuted mb-4">Last 6 months — confirmed bookings</p>
            {loading ? <div className="h-28 flex items-center justify-center text-hmuted text-sm">Loading…</div> : (
              <div className="flex items-end gap-3 h-28">
                {monthlyData.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-hmuted">{m.reservations}</span>
                    <div
                      className="w-full rounded-t-sm bg-gold transition-all duration-500"
                      style={{ height: `${(m.reservations / maxRes) * 80}px`, minHeight: 4 }}
                    />
                    <span className="text-[10px] text-hmuted">{m.month.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* Room type distribution */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy mb-1">Room Type Popularity</h3>
            <p className="text-xs text-hmuted mb-4">Bookings by room type (last 6 months)</p>
            {roomTypeStats.length === 0 ? (
              <p className="text-hmuted text-sm text-center py-6">No data yet</p>
            ) : (
              <div className="space-y-3">
                {roomTypeStats.map(r => (
                  <div key={r.type} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TYPE_COLORS[r.type] ?? '#888' }} />
                    <span className="text-sm text-htext flex-1 capitalize">{r.type}</span>
                    <span className="text-sm font-semibold text-dark-navy">{r.count}</span>
                    <div className="w-28 h-1.5 bg-hsurface2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(r.count / totalRoomType) * 100}%`, background: TYPE_COLORS[r.type] ?? '#888' }}
                      />
                    </div>
                    <span className="text-xs text-hmuted w-8 text-right">{Math.round((r.count / totalRoomType) * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Booking source */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy mb-1">Booking Sources</h3>
            <p className="text-xs text-hmuted mb-4">Where reservations come from</p>
            {sourceStats.length === 0 ? (
              <p className="text-hmuted text-sm text-center py-6">No data yet</p>
            ) : (
              <div className="space-y-3">
                {sourceStats.map((s, i) => {
                  const colors = ['#004AAD','#C89B3C','#1A7A4A','#B83232','#7C3AED']
                  return (
                    <div key={s.source} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors[i % colors.length] }} />
                      <span className="text-sm text-htext flex-1 capitalize">{s.source.replace('_', ' ')}</span>
                      <span className="text-sm font-semibold text-dark-navy">{s.count}</span>
                      <div className="w-28 h-1.5 bg-hsurface2 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.count / totalSource) * 100}%`, background: colors[i % colors.length] }} />
                      </div>
                      <span className="text-xs text-hmuted w-8 text-right">{Math.round((s.count / totalSource) * 100)}%</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
