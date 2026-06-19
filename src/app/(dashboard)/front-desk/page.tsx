'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import { formatDate, generateReservationNumber, formatCurrency, calculateNights, capitalize } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import type { Reservation, House } from '@/types'

export default function FrontDeskPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()
  const [arrivals, setArrivals] = useState<Reservation[]>([])
  const [departures, setDepartures] = useState<Reservation[]>([])
  const [houses, setHouses] = useState<House[]>([])
  const [allReservations, setAllReservations] = useState<Reservation[]>([])
  const [allHouses, setAllHouses] = useState<House[]>([])
  const [loading, setLoading] = useState(true)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [walkIn, setWalkIn] = useState({
    guest_name: '', guest_phone: '', guest_email: '',
    house_id: '', check_out_date: '', adults: 1, children: 0,
  })

  // Calendar state
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })
  const [khHolidays, setKhHolidays] = useState<Record<string, string>>({})
  const [calDetailRes, setCalDetailRes] = useState<Reservation | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message?: string; confirmLabel?: string; variant?: 'default' | 'danger'; onConfirm: () => void } | null>(null)

  useEffect(() => { if (activeBranch) loadData() }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const year = calMonth.getFullYear()
    const years = new Set([year, year + 1])
    years.forEach(async (y) => {
      try {
        const res = await fetch(`/api/holidays?year=${y}`)
        if (res.ok) {
          const data: Record<string, string> = await res.json()
          setKhHolidays(prev => ({ ...prev, ...data }))
        }
      } catch { /* calendar still works without holidays */ }
    })
  }, [calMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    if (!activeBranch) return
    const today = new Date().toISOString().split('T')[0]
    const [arrRes, depRes, houseRes, allResRes, allHouseRes] = await Promise.all([
      supabase.from('reservations')
        .select('*, guest:guests(full_name, email, phone), house:houses(name, house_type, capacity)')
        .eq('branch_id', activeBranch.id)
        .eq('check_in_date', today)
        .in('status', ['confirmed', 'pending'])
        .order('created_at'),
      supabase.from('reservations')
        .select('*, guest:guests(full_name, email, phone), house:houses(name, house_type, capacity)')
        .eq('branch_id', activeBranch.id)
        .eq('check_out_date', today)
        .eq('status', 'checked_in')
        .order('created_at'),
      supabase.from('houses')
        .select('*')
        .eq('branch_id', activeBranch.id)
        .eq('status', 'available')
        .order('name'),
      supabase.from('reservations')
        .select('*, guest:guests(full_name, email, phone), house:houses(name, house_type, capacity)')
        .eq('branch_id', activeBranch.id)
        .not('status', 'in', '("cancelled","no_show")')
        .order('check_in_date'),
      supabase.from('houses')
        .select('*')
        .eq('branch_id', activeBranch.id)
        .order('name'),
    ])
    setArrivals((arrRes.data ?? []) as unknown as Reservation[])
    setDepartures((depRes.data ?? []) as unknown as Reservation[])
    setHouses((houseRes.data ?? []) as unknown as House[])
    setAllReservations((allResRes.data ?? []) as unknown as Reservation[])
    setAllHouses((allHouseRes.data ?? []) as unknown as House[])
    setLoading(false)
  }

  function handleCheckIn(res: Reservation) {
    setConfirmDialog({
      title: `Check in ${(res.guest as any)?.full_name ?? 'guest'}?`,
      message: `${(res.house as any)?.name ?? ''} · ${res.reservation_number}`,
      confirmLabel: 'Check In',
      onConfirm: async () => {
        setConfirmDialog(null)
        await supabase.from('reservations').update({
          status: 'checked_in',
          actual_check_in: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', res.id)
        if (res.house_id) {
          await supabase.from('houses').update({ status: 'occupied', updated_at: new Date().toISOString() }).eq('id', res.house_id)
        }
        fetch('/api/telegram/notify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'checkin', branch_id: activeBranch?.id, data: {
            guest_name: (res.guest as any)?.full_name,
            house_name: (res.house as any)?.name,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            reservation_number: res.reservation_number,
          }})
        }).catch(() => {})
        toast(`${(res.guest as any)?.full_name} checked in`)
        setCalDetailRes(null)
        loadData()
      },
    })
  }

  function handleCheckOut(res: Reservation) {
    setConfirmDialog({
      title: `Check out ${(res.guest as any)?.full_name ?? 'guest'}?`,
      message: `${(res.house as any)?.name ?? ''} · ${res.reservation_number}`,
      confirmLabel: 'Check Out',
      onConfirm: async () => {
        setConfirmDialog(null)
        await supabase.from('reservations').update({
          status: 'checked_out',
          actual_check_out: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', res.id)
        if (res.house_id) {
          await supabase.from('houses').update({ status: 'available', updated_at: new Date().toISOString() }).eq('id', res.house_id)
          const { data: houseRooms } = await supabase.from('rooms').select('id').eq('house_id', res.house_id)
          if (houseRooms && houseRooms.length > 0) {
            await supabase.from('rooms').update({ status: 'cleaning', updated_at: new Date().toISOString() }).eq('house_id', res.house_id)
            await supabase.from('housekeeping_tasks').insert(
              houseRooms.map(room => ({
                room_id: room.id,
                task_type: 'cleaning',
                status: 'pending',
                priority: 'high',
                branch_id: activeBranch?.id ?? null,
                due_date: new Date().toISOString().split('T')[0],
                notes: `Post-checkout cleaning for reservation ${res.reservation_number}`,
              }))
            )
          } else {
            await supabase.from('housekeeping_tasks').insert({
              room_id: null,
              task_type: 'cleaning',
              status: 'pending',
              priority: 'high',
              branch_id: activeBranch?.id ?? null,
              due_date: new Date().toISOString().split('T')[0],
              notes: `Post-checkout cleaning — ${(res.house as any)?.name ?? 'house'} — reservation ${res.reservation_number}`,
            })
          }
        }
        fetch('/api/telegram/notify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'checkout', branch_id: activeBranch?.id, data: {
            guest_name: (res.guest as any)?.full_name,
            house_name: (res.house as any)?.name,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            reservation_number: res.reservation_number,
          }})
        }).catch(() => {})
        toast(`${(res.guest as any)?.full_name} checked out`)
        setCalDetailRes(null)
        loadData()
      },
    })
  }

  async function handleWalkIn() {
    if (!walkIn.guest_name || !walkIn.house_id || !walkIn.check_out_date) {
      toast('Please fill required fields', 'error'); return
    }
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const selectedHouse = houses.find(h => h.id === walkIn.house_id)
    const nights = calculateNights(today, walkIn.check_out_date)
    const total = selectedHouse ? selectedHouse.base_rate_per_night * nights : 0

    const { data: guest } = await supabase.from('guests').insert({
      full_name: walkIn.guest_name,
      phone: walkIn.guest_phone || null,
      email: walkIn.guest_email || null,
      visit_count: 1,
    }).select().single()

    const { error } = await supabase.from('reservations').insert({
      reservation_number: generateReservationNumber(),
      guest_id: guest?.id,
      house_id: walkIn.house_id,
      branch_id: activeBranch?.id ?? null,
      check_in_date: today,
      check_out_date: walkIn.check_out_date,
      adults: walkIn.adults,
      children: walkIn.children,
      source: 'walk_in',
      status: 'checked_in',
      actual_check_in: new Date().toISOString(),
      total_amount: total,
    })

    if (!error) {
      await supabase.from('houses').update({ status: 'occupied', updated_at: new Date().toISOString() }).eq('id', walkIn.house_id)
      toast('Walk-in guest checked in')
      setWalkInOpen(false)
      setWalkIn({ guest_name: '', guest_phone: '', guest_email: '', house_id: '', check_out_date: '', adults: 1, children: 0 })
      loadData()
    } else {
      toast(error.message, 'error')
    }
    setSaving(false)
  }

  // ── Calendar rendering ──────────────────────────────────────────────────────

  function renderCalendar() {
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    const todayStr = new Date().toISOString().slice(0, 10)

    const statusColor: Record<string, { bg: string; text: string; border: string }> = {
      confirmed:   { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
      checked_in:  { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
      pending:     { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
      checked_out: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
    }

    function toDStr(d: Date) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }

    function getDayRes(dayStr: string) {
      return allReservations.filter(r =>
        r.check_in_date <= dayStr && r.check_out_date > dayStr
      )
    }

    const yr = calMonth.getFullYear()
    const mo = calMonth.getMonth()
    const dim = new Date(yr, mo + 1, 0).getDate()
    const firstDow = (new Date(yr, mo, 1).getDay() + 6) % 7
    const cells: (Date | null)[] = [
      ...Array(firstDow).fill(null),
      ...Array.from({ length: dim }, (_, i) => new Date(yr, mo, i + 1)),
    ]
    while (cells.length % 7 !== 0) cells.push(null)
    const weeks: (Date | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

    return (
      <div>
        {/* Nav */}
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => { const d = new Date(calMonth); d.setMonth(d.getMonth()-1); setCalMonth(d) }}
            className="px-3 py-1.5 text-xs rounded-lg border border-hborder bg-white text-hmuted hover:bg-hbg transition-colors"
          >← Prev</button>
          <button
            onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setCalMonth(d) }}
            className="px-3 py-1.5 text-xs rounded-lg border border-hborder bg-white text-navy font-semibold hover:bg-hbg transition-colors"
          >Today</button>
          <button
            onClick={() => { const d = new Date(calMonth); d.setMonth(d.getMonth()+1); setCalMonth(d) }}
            className="px-3 py-1.5 text-xs rounded-lg border border-hborder bg-white text-hmuted hover:bg-hbg transition-colors"
          >Next →</button>
          <span className="text-xs text-hmuted ml-2">{MONTH_NAMES[mo]} {yr}</span>
        </div>

        <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
          {/* Month title + legend */}
          <div className="px-5 py-3 border-b border-hborder bg-hsurface2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-htext">{MONTH_NAMES[mo]} {yr}</h3>
            <div className="flex items-center gap-3">
              {Object.entries(statusColor).map(([s, c]) => (
                <span key={s} className="flex items-center gap-1 text-[10px] font-medium whitespace-nowrap" style={{ color: c.text }}>
                  <span className="w-2 h-2 rounded-sm inline-block flex-none" style={{ background: c.bg, border: `1px solid ${c.border}` }} />
                  {capitalize(s.replace('_', ' '))}
                </span>
              ))}
            </div>
          </div>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b border-hborder">
            {DAY_LABELS.map(d => (
              <div
                key={d}
                className={`py-2 text-center text-[11px] font-semibold uppercase tracking-wide border-r border-hborder last:border-r-0 ${
                  d === 'Sat' || d === 'Sun' ? 'text-amber-600 bg-amber-50/50' : 'text-hmuted bg-hsurface2'
                }`}
              >{d}</div>
            ))}
          </div>

          {/* Week rows */}
          {loading ? (
            <div className="p-12 text-center text-sm text-hmuted">Loading…</div>
          ) : (
            weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-hborder last:border-b-0">
                {week.map((day, di) => {
                  const isWeekend = di >= 5
                  if (!day) {
                    return (
                      <div
                        key={di}
                        className={`border-r border-hborder last:border-r-0 min-h-[90px] ${isWeekend ? 'bg-amber-50/20' : 'bg-hbg/30'}`}
                      />
                    )
                  }
                  const ds = toDStr(day)
                  const isToday = ds === todayStr
                  const entries = getDayRes(ds)
                  const holiday = khHolidays[ds] ?? null
                  return (
                    <div
                      key={di}
                      className={`border-r border-hborder last:border-r-0 min-h-[90px] p-1.5 ${
                        isToday
                          ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-300'
                          : isWeekend
                            ? 'bg-amber-50/30'
                            : 'bg-white'
                      }`}
                    >
                      <div className="flex justify-end mb-1">
                        <span className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                          isToday ? 'bg-blue-600 text-white' : isWeekend ? 'text-amber-600' : 'text-hmuted'
                        }`}>
                          {day.getDate()}
                        </span>
                      </div>

                      {holiday && (
                        <div
                          title={holiday}
                          className="w-full mb-[3px] px-1 py-[2px] rounded-[3px] text-[9px] font-semibold leading-tight truncate bg-red-50 text-red-700 border border-red-200"
                        >
                          🇰🇭 {holiday}
                        </div>
                      )}

                      <div className="space-y-[3px]">
                        {entries.map(r => {
                          const sc = statusColor[r.status] ?? statusColor.confirmed
                          const guestName = (r.guest as any)?.full_name ?? 'Guest'
                          const houseName = (r.house as any)?.name ?? ''
                          const isCI = r.check_in_date === ds
                          const isCO = r.check_out_date === ds
                          return (
                            <button
                              key={r.id}
                              onClick={() => setCalDetailRes(r)}
                              title={`${guestName} · ${(r.house as any)?.name ?? ''} · ${formatDate(r.check_in_date)} → ${formatDate(r.check_out_date)}`}
                              className="w-full text-left rounded-[4px] px-1.5 py-[3px] text-[10px] font-semibold leading-tight truncate block hover:opacity-80 transition-opacity"
                              style={{ background: sc.bg, color: sc.text, border: `1.5px solid ${sc.border}` }}
                            >
                              {isCI && <span className="mr-0.5 opacity-60">▶</span>}
                              {isCO && <span className="mr-0.5 opacity-60">◀</span>}
                              {guestName}
                              {houseName && <span className="opacity-60 ml-1">· {houseName}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // ── Calendar detail modal helpers ───────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0]
  const calRes = calDetailRes
  const canCheckIn  = calRes && (calRes.status === 'confirmed' || calRes.status === 'pending') && calRes.check_in_date === todayStr
  const canCheckOut = calRes && calRes.status === 'checked_in' && calRes.check_out_date === todayStr

  return (
    <>
      <TopBar title="Front Desk" subtitle={`Check-in & check-out — ${activeBranch?.location ?? ''}`} />
      <div className="p-8 flex-1 section-enter">

        {/* Header row */}
        <div className="flex justify-end mb-6">
          <Button onClick={() => setWalkInOpen(true)}>+ Walk-in Check-in</Button>
        </div>

        {/* ── TODAY VIEW ── */}
        <div className="grid grid-cols-2 gap-6">
            {/* Arrivals */}
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-hborder flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-lg text-dark-navy">Today's Arrivals</h3>
                  <p className="text-xs text-hmuted">{arrivals.length} guests expected</p>
                </div>
                <span className="bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                  {arrivals.length} pending
                </span>
              </div>
              {loading ? (
                <p className="px-5 py-8 text-sm text-hmuted text-center">Loading…</p>
              ) : arrivals.length === 0 ? (
                <p className="px-5 py-8 text-sm text-hmuted text-center">No arrivals today</p>
              ) : (
                <div className="divide-y divide-hborder">
                  {arrivals.map(res => {
                    const pax = res.pax_count ?? (res.adults + res.children)
                    return (
                      <div key={res.id} className="px-5 py-4 flex items-center justify-between hover:bg-hbg/50">
                        <div className="min-w-0 mr-3">
                          <p className="font-medium text-htext truncate">{(res.guest as any)?.full_name ?? '—'}</p>
                          <p className="text-xs text-hmuted">
                            {(res.house as any)?.name ?? '?'} · {(res.guest as any)?.phone ?? 'No phone'}
                          </p>
                          <p className="text-xs text-hmuted mt-0.5">
                            Until {formatDate(res.check_out_date)} · {pax} pax
                            {res.arrival_time ? ` · ETA ${res.arrival_time}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge status={res.status} />
                          <Button size="sm" variant="success" onClick={() => handleCheckIn(res)}>Check In</Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Departures */}
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-hborder flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-lg text-dark-navy">Today's Departures</h3>
                  <p className="text-xs text-hmuted">{departures.length} guests checking out</p>
                </div>
                <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                  {departures.length} active
                </span>
              </div>
              {loading ? (
                <p className="px-5 py-8 text-sm text-hmuted text-center">Loading…</p>
              ) : departures.length === 0 ? (
                <p className="px-5 py-8 text-sm text-hmuted text-center">No departures today</p>
              ) : (
                <div className="divide-y divide-hborder">
                  {departures.map(res => (
                    <div key={res.id} className="px-5 py-4 flex items-center justify-between hover:bg-hbg/50">
                      <div className="min-w-0 mr-3">
                        <p className="font-medium text-htext truncate">{(res.guest as any)?.full_name ?? '—'}</p>
                        <p className="text-xs text-hmuted">
                          {(res.house as any)?.name ?? '?'} · {(res.guest as any)?.phone ?? 'No phone'}
                        </p>
                        <p className="text-xs text-hmuted mt-0.5">
                          Checked in: {res.actual_check_in ? formatDate(res.actual_check_in) : 'Unknown'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge status="checked_in" />
                        <Button size="sm" variant="ghost" onClick={() => handleCheckOut(res)}>Check Out</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        {/* ── CALENDAR ── */}
        <div className="mt-6">{renderCalendar()}</div>
      </div>

      {/* Walk-in Modal */}
      <Modal open={walkInOpen} onClose={() => setWalkInOpen(false)} title="Walk-in Check-in" subtitle="Register and check in a guest immediately">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-hmuted mb-1">Guest Full Name *</label>
              <input
                value={walkIn.guest_name}
                onChange={e => setWalkIn(f => ({ ...f, guest_name: e.target.value }))}
                placeholder="Full name"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Phone</label>
              <input
                value={walkIn.guest_phone}
                onChange={e => setWalkIn(f => ({ ...f, guest_phone: e.target.value }))}
                placeholder="+855 12 345 678"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Email</label>
              <input
                type="email"
                value={walkIn.guest_email}
                onChange={e => setWalkIn(f => ({ ...f, guest_email: e.target.value }))}
                placeholder="email@example.com"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">House *</label>
              <select
                value={walkIn.house_id}
                onChange={e => setWalkIn(f => ({ ...f, house_id: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                <option value="">Select available house…</option>
                {houses.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.name} — {capitalize(h.house_type)} · {h.capacity} pax ({formatCurrency(h.base_rate_per_night)}/night)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Check-out Date *</label>
              <input
                type="date"
                value={walkIn.check_out_date}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setWalkIn(f => ({ ...f, check_out_date: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Adults</label>
              <input
                type="number" min={1} max={30}
                value={walkIn.adults}
                onChange={e => setWalkIn(f => ({ ...f, adults: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Children</label>
              <input
                type="number" min={0} max={20}
                value={walkIn.children}
                onChange={e => setWalkIn(f => ({ ...f, children: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>
          {walkIn.house_id && walkIn.check_out_date && (() => {
            const h = houses.find(x => x.id === walkIn.house_id)
            const nights = calculateNights(new Date().toISOString().split('T')[0], walkIn.check_out_date)
            if (!h || nights <= 0) return null
            return (
              <div className="bg-hsurface2 rounded-xl px-4 py-3 text-sm">
                <div className="flex justify-between text-hmuted">
                  <span>{h.name} — {nights} night{nights !== 1 ? 's' : ''} × {formatCurrency(h.base_rate_per_night)}</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(h.base_rate_per_night * nights)}</span>
                </div>
              </div>
            )
          })()}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setWalkInOpen(false)}>Cancel</Button>
            <Button onClick={handleWalkIn} disabled={saving}>{saving ? 'Checking in…' : 'Check In Now'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message}
        confirmLabel={confirmDialog?.confirmLabel}
        variant={confirmDialog?.variant}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />

      {/* Calendar Reservation Detail Modal */}
      {calDetailRes && (
        <Modal
          open={!!calDetailRes}
          onClose={() => setCalDetailRes(null)}
          title={(calDetailRes.guest as any)?.full_name ?? 'Reservation'}
          subtitle={`${calDetailRes.reservation_number} · ${(calDetailRes.house as any)?.name ?? '—'}`}
        >
          {(() => {
            const res = calDetailRes
            const nights = calculateNights(res.check_in_date, res.check_out_date)
            const pax = res.pax_count ?? (res.adults + res.children)
            const dep = Number(res.deposit ?? 0)
            const total = Number(res.total_amount ?? 0)
            const balance = total - dep
            return (
              <div className="space-y-4">
                {/* Status */}
                <div className="flex items-center gap-2">
                  <Badge status={res.status} />
                  {canCheckIn && (
                    <span className="text-xs text-green-700 font-medium bg-green-50 px-2 py-0.5 rounded-full">Arriving today</span>
                  )}
                  {canCheckOut && (
                    <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full">Departing today</span>
                  )}
                </div>

                {/* Info grid */}
                <div className="bg-hsurface2 rounded-xl px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-hmuted">Check-in</span>
                    <span className="font-medium text-htext">{formatDate(res.check_in_date)}{res.arrival_time ? ` · ETA ${res.arrival_time}` : ''}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-hmuted">Check-out</span>
                    <span className="font-medium text-htext">{formatDate(res.check_out_date)} · {nights} night{nights !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-hmuted">Guests</span>
                    <span className="font-medium text-htext">{pax} pax ({res.adults} adult{res.adults !== 1 ? 's' : ''}{res.children > 0 ? `, ${res.children} child${res.children !== 1 ? 'ren' : ''}` : ''})</span>
                  </div>
                  {(res.guest as any)?.phone && (
                    <div className="flex justify-between">
                      <span className="text-hmuted">Phone</span>
                      <span className="font-medium text-htext">{(res.guest as any).phone}</span>
                    </div>
                  )}
                </div>

                {/* Financials */}
                <div className="bg-hsurface2 rounded-xl px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-hmuted">Total</span>
                    <span className="font-semibold text-dark-navy">{formatCurrency(total)}</span>
                  </div>
                  {dep > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-hmuted">Deposit paid</span>
                        <span className="text-green-700 font-medium">{formatCurrency(dep)}</span>
                      </div>
                      <div className="flex justify-between border-t border-hborder pt-2">
                        <span className="text-hmuted">Balance due</span>
                        <span className={`font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-700'}`}>{formatCurrency(balance)}</span>
                      </div>
                    </>
                  )}
                </div>

                {res.special_requests && (
                  <div className="text-xs text-hmuted bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span className="font-semibold text-amber-700">Special request:</span> {res.special_requests}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-1">
                  <Button variant="ghost" onClick={() => setCalDetailRes(null)}>Close</Button>
                  {canCheckIn && (
                    <Button variant="success" onClick={() => handleCheckIn(res)}>Check In</Button>
                  )}
                  {canCheckOut && (
                    <Button variant="ghost" onClick={() => handleCheckOut(res)}>Check Out</Button>
                  )}
                </div>
              </div>
            )
          })()}
        </Modal>
      )}
    </>
  )
}
