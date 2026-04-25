'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Reservation } from '@/types'

interface Stats {
  totalRooms: number
  occupiedRooms: number
  todayRevenue: number
  todayCheckIns: number
  todayCheckOuts: number
  pendingHousekeeping: number
  availableRooms: number
  cleaningRooms: number
}

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function DashboardPage() {
  const supabase = createClient()
  const [stats, setStats] = useState<Stats>({
    totalRooms: 0, occupiedRooms: 0, todayRevenue: 0,
    todayCheckIns: 0, todayCheckOuts: 0, pendingHousekeeping: 0,
    availableRooms: 0, cleaningRooms: 0,
  })
  const [recentReservations, setRecentReservations] = useState<Reservation[]>([])
  const [weeklyData, setWeeklyData] = useState<number[]>([60, 72, 65, 80, 78, 90, 85])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    const today = new Date().toISOString().split('T')[0]

    const [roomsRes, checkInsRes, checkOutsRes, revenueRes, housekeepingRes, reservationsRes] = await Promise.all([
      supabase.from('rooms').select('status'),
      supabase.from('reservations').select('id').eq('check_in_date', today).in('status', ['confirmed', 'checked_in']),
      supabase.from('reservations').select('id').eq('check_out_date', today).eq('status', 'checked_in'),
      supabase.from('invoices').select('total').eq('status', 'paid').gte('paid_at', today + 'T00:00:00').lte('paid_at', today + 'T23:59:59'),
      supabase.from('housekeeping_tasks').select('id').in('status', ['pending', 'in_progress']),
      supabase.from('reservations').select('*, guest:guests(full_name, phone), room:rooms(room_number, room_type)').order('created_at', { ascending: false }).limit(6),
    ])

    const rooms = roomsRes.data ?? []
    const occupied = rooms.filter(r => r.status === 'occupied').length
    const available = rooms.filter(r => r.status === 'available').length
    const cleaning = rooms.filter(r => r.status === 'cleaning').length
    const revenue = (revenueRes.data ?? []).reduce((s, i) => s + Number(i.total), 0)

    setStats({
      totalRooms: rooms.length,
      occupiedRooms: occupied,
      availableRooms: available,
      cleaningRooms: cleaning,
      todayRevenue: revenue,
      todayCheckIns: checkInsRes.data?.length ?? 0,
      todayCheckOuts: checkOutsRes.data?.length ?? 0,
      pendingHousekeeping: housekeepingRes.data?.length ?? 0,
    })

    setRecentReservations((reservationsRes.data ?? []) as unknown as Reservation[])
    setLoading(false)
  }

  const occupancyRate = stats.totalRooms > 0 ? Math.round((stats.occupiedRooms / stats.totalRooms) * 100) : 0
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
            sub={`${stats.occupiedRooms} / ${stats.totalRooms} rooms`}
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
            sub={`${stats.availableRooms} rooms available`}
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

          {/* Room Status Summary */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy">Room Status</h3>
            <p className="text-xs text-hmuted mb-4">Current room availability breakdown</p>
            <div className="space-y-3">
              {[
                { label: 'Available', count: stats.availableRooms, color: '#1A7A4A', bg: '#E8F5EE' },
                { label: 'Occupied', count: stats.occupiedRooms, color: '#004AAD', bg: '#E8F0FB' },
                { label: 'Cleaning', count: stats.cleaningRooms, color: '#A05C00', bg: '#FFF3E0' },
                { label: 'Maintenance', count: stats.totalRooms - stats.availableRooms - stats.occupiedRooms - stats.cleaningRooms, color: '#B83232', bg: '#FDEAEA' },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
                  <span className="text-sm text-htext flex-1">{row.label}</span>
                  <span className="text-sm font-semibold text-dark-navy">{row.count}</span>
                  <div className="w-24 h-1.5 bg-hsurface2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: stats.totalRooms ? `${(row.count / stats.totalRooms) * 100}%` : '0%',
                        background: row.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
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
                  <th className="px-5 py-3 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Ref</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Guest</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Room</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Check-in</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Check-out</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Status</th>
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
                  <tr key={res.id} className="border-t border-hborder hover:bg-hbg/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-hmuted">{res.reservation_number}</td>
                    <td className="px-5 py-3 font-medium text-htext">{(res.guest as any)?.full_name ?? '—'}</td>
                    <td className="px-5 py-3 text-hmuted">{(res.room as any)?.room_number ?? '—'}</td>
                    <td className="px-5 py-3 text-hmuted">{formatDate(res.check_in_date)}</td>
                    <td className="px-5 py-3 text-hmuted">{formatDate(res.check_out_date)}</td>
                    <td className="px-5 py-3"><Badge status={res.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
