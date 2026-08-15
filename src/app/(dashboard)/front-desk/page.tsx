'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CheckInModal } from '@/components/ui/CheckInModal'
import type { CheckInForm } from '@/components/ui/CheckInModal'
import { CheckOutModal } from '@/components/ui/CheckOutModal'
import type { CheckOutForm } from '@/components/ui/CheckOutModal'
import { createClient } from '@/lib/supabase/client'
import { formatDate, generateReservationNumber, formatCurrency, calculateNights, capitalize, generateJournalEntryNumber } from '@/lib/utils'
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

  // Calendar state
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })
  const [khHolidays, setKhHolidays] = useState<Record<string, string>>({})
  const [calDetailRes, setCalDetailRes] = useState<Reservation | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message?: string; confirmLabel?: string; variant?: 'default' | 'danger'; onConfirm: () => void } | null>(null)
  const [checkInTarget, setCheckInTarget] = useState<Reservation | null>(null)
  const [checkOutTarget, setCheckOutTarget] = useState<Reservation | null>(null)

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
        .select('*, guest:guests(full_name, email, phone), house:houses(name, code, house_type, capacity)')
        .eq('branch_id', activeBranch.id)
        .eq('check_in_date', today)
        .in('status', ['confirmed', 'pending'])
        .order('created_at'),
      supabase.from('reservations')
        .select('*, guest:guests(full_name, email, phone), house:houses(name, code, house_type, capacity)')
        .eq('branch_id', activeBranch.id)
        .eq('check_out_date', today)
        .in('status', ['confirmed', 'checked_in'])
        .order('created_at'),
      supabase.from('houses')
        .select('*')
        .eq('branch_id', activeBranch.id)
        .eq('status', 'available')
        .order('name'),
      supabase.from('reservations')
        .select('*, guest:guests(full_name, email, phone), house:houses(name, code, house_type, capacity)')
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
    setCheckInTarget(res)
    setCalDetailRes(null)
  }

  async function confirmCheckIn(form: CheckInForm) {
    const res = checkInTarget
    if (!res) return

    const now = new Date().toISOString()

    // 1. Update reservation status
    await supabase.from('reservations').update({
      status: 'checked_in',
      actual_check_in: now,
      updated_at: now,
    }).eq('id', res.id)

    // 2. Mark house occupied
    if (res.house_id) {
      await supabase.from('houses').update({ status: 'occupied', updated_at: now }).eq('id', res.house_id)
    }

    // 3. Update guest ID info
    if (res.guest_id) {
      await supabase.from('guests').update({
        id_type: form.id_type || null,
        id_number: form.id_number || null,
        id_expiry: form.id_expiry || null,
        nationality: form.nationality || null,
        updated_at: now,
      }).eq('id', res.guest_id)
    }

    // 4. Save check-in record
    let jeId: string | null = null
    const totalAmount = Number((res as any).total_amount ?? 0)

    // 5. Post revenue recognition JE (DR AR 1100 / CR House Rental Revenue 4000)
    if (totalAmount > 0 && activeBranch) {
      const [{ data: arAcct }, { data: revAcct }] = await Promise.all([
        supabase.from('chart_of_accounts').select('id').eq('branch_id', activeBranch.id).eq('code', '1100').maybeSingle(),
        supabase.from('chart_of_accounts').select('id').eq('branch_id', activeBranch.id).eq('code', '4000').maybeSingle(),
      ])
      if (arAcct && revAcct) {
        const { data: je } = await supabase.from('journal_entries').insert({
          entry_number: generateJournalEntryNumber(),
          entry_date: now.split('T')[0],
          reference: res.reservation_number,
          reference_type: 'check_in',
          description: `Check-in — ${(res.guest as any)?.full_name ?? 'Guest'} · ${(res.house as any)?.name ?? ''}`,
          branch_id: activeBranch.id,
        }).select().single()
        if (je) {
          jeId = je.id
          await supabase.from('journal_entry_lines').insert([
            { entry_id: je.id, account_id: arAcct.id,  description: `AR — ${res.reservation_number}`, debit: totalAmount, credit: 0 },
            { entry_id: je.id, account_id: revAcct.id, description: `Revenue — ${res.reservation_number}`, debit: 0, credit: totalAmount },
          ])
        }
      }
    }

    // 6. Save check-in record
    await supabase.from('check_in_records').insert({
      reservation_id: res.id,
      branch_id: activeBranch?.id ?? null,
      id_type: form.id_type || null,
      id_number: form.id_number || null,
      id_expiry: form.id_expiry || null,
      nationality: form.nationality || null,
      vehicle_plate: form.vehicle_plate || null,
      notes: form.notes || null,
      checked_in_at: now,
      journal_entry_id: jeId,
    })

    // 7. Telegram notify
    fetch('/api/telegram/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'checkin', branch_id: activeBranch?.id, data: {
        guest_name: (res.guest as any)?.full_name,
        house_name: (res.house as any)?.name,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        reservation_number: res.reservation_number,
      }}),
    }).catch(() => {})

    toast(`${(res.guest as any)?.full_name ?? 'Guest'} checked in — revenue recognized`)
    setCheckInTarget(null)
    loadData()
  }

  function handleCheckOut(res: Reservation) {
    setCheckOutTarget(res)
    setCalDetailRes(null)
  }

  async function confirmCheckOut(form: CheckOutForm) {
    const res = checkOutTarget
    if (!res) return

    const now = new Date().toISOString()
    const today = now.split('T')[0]
    const guestName = (res.guest as any)?.full_name ?? 'Guest'
    const houseName = (res.house as any)?.name ?? 'house'

    // 1. Update reservation status
    await supabase.from('reservations').update({
      status: 'checked_out',
      actual_check_out: now,
      updated_at: now,
    }).eq('id', res.id)

    // 2. Mark house available, rooms cleaning
    if (res.house_id) {
      await supabase.from('houses').update({ status: 'available', updated_at: now }).eq('id', res.house_id)
      const { data: houseRooms } = await supabase.from('rooms').select('id').eq('house_id', res.house_id)
      const taskType = form.condition !== 'good' ? 'inspection' : 'cleaning'
      const taskPriority = form.condition === 'major_damage' ? 'urgent' : form.condition === 'minor_damage' ? 'high' : 'high'
      if (houseRooms && houseRooms.length > 0) {
        await supabase.from('rooms').update({ status: 'cleaning', updated_at: now }).eq('house_id', res.house_id)
        await supabase.from('housekeeping_tasks').insert(
          houseRooms.map(room => ({
            room_id: room.id,
            task_type: taskType,
            status: 'pending',
            priority: taskPriority,
            branch_id: activeBranch?.id ?? null,
            due_date: today,
            notes: form.condition !== 'good'
              ? `Post-checkout ${taskType} — ${form.inspection_notes || 'Damage reported'} — ${res.reservation_number}`
              : `Post-checkout cleaning — ${res.reservation_number}`,
          }))
        )
      } else {
        await supabase.from('housekeeping_tasks').insert({
          room_id: null,
          house_id: res.house_id,
          task_type: taskType,
          status: 'pending',
          priority: taskPriority,
          branch_id: activeBranch?.id ?? null,
          due_date: today,
          notes: form.condition !== 'good'
            ? `Post-checkout ${taskType} — ${form.inspection_notes || 'Damage reported'} — ${res.reservation_number}`
            : `Post-checkout cleaning — ${houseName} — ${res.reservation_number}`,
        })
      }
    }

    // 3. Save inspection record
    const validCharges = form.extra_charges.filter(c => c.description && Number(c.amount) > 0)
    const totalExtra = validCharges.reduce((s, c) => s + Number(c.amount), 0)
    await supabase.from('checkout_inspections').insert({
      reservation_id: res.id,
      branch_id: activeBranch?.id ?? null,
      condition: form.condition,
      inspection_notes: form.inspection_notes || null,
      extra_charges: validCharges,
      total_extra: totalExtra,
      inspected_at: now,
    })

    // 4. Telegram notify
    fetch('/api/telegram/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'checkout', branch_id: activeBranch?.id, data: {
        guest_name: guestName,
        house_name: houseName,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        reservation_number: res.reservation_number,
      }}),
    }).catch(() => {})

    const msg = totalExtra > 0
      ? `${guestName} checked out — $${totalExtra.toFixed(2)} extra charges saved`
      : `${guestName} checked out`
    toast(msg)
    setCheckOutTarget(null)
    loadData()
  }

  async function confirmWalkIn(form: CheckInForm) {
    const now = new Date().toISOString()
    const today = now.split('T')[0]
    const selectedHouse = houses.find(h => h.id === form.house_id)
    const nights = calculateNights(today, form.check_out_date ?? '')
    const total = selectedHouse ? selectedHouse.base_rate_per_night * nights : 0

    // 1. Create guest record with ID info
    const { data: guest, error: guestErr } = await supabase.from('guests').insert({
      full_name: form.guest_name ?? '',
      phone: form.guest_phone || null,
      email: form.guest_email || null,
      id_type: form.id_type || null,
      id_number: form.id_number || null,
      id_expiry: form.id_expiry || null,
      nationality: form.nationality || null,
      visit_count: 1,
    }).select().single()
    if (guestErr) { toast(guestErr.message, 'error'); return }

    // 2. Create reservation
    const resNumber = generateReservationNumber()
    const { data: reservation, error: resErr } = await supabase.from('reservations').insert({
      reservation_number: resNumber,
      guest_id: guest?.id,
      house_id: form.house_id ?? null,
      branch_id: activeBranch?.id ?? null,
      check_in_date: today,
      check_out_date: form.check_out_date ?? today,
      adults: form.adults ?? 1,
      children: form.children ?? 0,
      source: 'walk_in',
      status: 'checked_in',
      actual_check_in: now,
      total_amount: total,
    }).select().single()
    if (resErr) { toast(resErr.message, 'error'); return }

    // 3. Mark house occupied
    if (form.house_id) {
      await supabase.from('houses').update({ status: 'occupied', updated_at: now }).eq('id', form.house_id)
    }

    // 4. Post revenue JE (DR AR 1100 / CR House Rental Revenue 4000)
    let jeId: string | null = null
    if (total > 0 && activeBranch) {
      const [{ data: arAcct }, { data: revAcct }] = await Promise.all([
        supabase.from('chart_of_accounts').select('id').eq('branch_id', activeBranch.id).eq('code', '1100').maybeSingle(),
        supabase.from('chart_of_accounts').select('id').eq('branch_id', activeBranch.id).eq('code', '4000').maybeSingle(),
      ])
      if (arAcct && revAcct) {
        const { data: je } = await supabase.from('journal_entries').insert({
          entry_number: generateJournalEntryNumber(),
          entry_date: today,
          reference: resNumber,
          reference_type: 'check_in',
          description: `Check-in (walk-in) — ${form.guest_name ?? 'Guest'} · ${selectedHouse?.name ?? ''}`,
          branch_id: activeBranch.id,
        }).select().single()
        if (je) {
          jeId = je.id
          await supabase.from('journal_entry_lines').insert([
            { entry_id: je.id, account_id: arAcct.id,  description: `AR — ${resNumber}`, debit: total, credit: 0 },
            { entry_id: je.id, account_id: revAcct.id, description: `Revenue — ${resNumber}`, debit: 0, credit: total },
          ])
        }
      }
    }

    // 5. Save check-in record
    if (reservation) {
      await supabase.from('check_in_records').insert({
        reservation_id: reservation.id,
        branch_id: activeBranch?.id ?? null,
        id_type: form.id_type || null,
        id_number: form.id_number || null,
        id_expiry: form.id_expiry || null,
        nationality: form.nationality || null,
        vehicle_plate: form.vehicle_plate || null,
        notes: form.notes || null,
        checked_in_at: now,
        journal_entry_id: jeId,
      })
    }

    toast(`${form.guest_name ?? 'Guest'} checked in — revenue recognized`)
    setWalkInOpen(false)
    loadData()
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

          {/* Calendar grid — horizontal scroll below ~640px; a 7-column month
              view can't compress further and stay usable, same pattern every
              mobile calendar app uses. */}
          <div className="overflow-x-auto">
          <div className="min-w-[640px]">
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
      <div className="p-4 sm:p-6 lg:p-8 flex-1 section-enter">

        {/* Header row */}
        <div className="flex justify-end mb-6">
          <Button onClick={() => setWalkInOpen(true)}>+ Walk-in Check-in</Button>
        </div>

        {/* ── TODAY VIEW ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Arrivals */}
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-hborder flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-lg text-dark-navy">Today's Arrivals</h3>
                  <p className="text-xs text-hmuted">{arrivals.length} guests expected</p>
                </div>
                <span className="bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
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
                            {(res.house as any)?.code || (res.house as any)?.name || '?'} · {(res.guest as any)?.phone ?? 'No phone'}
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
                <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
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
                          {(res.house as any)?.code || (res.house as any)?.name || '?'} · {(res.guest as any)?.phone ?? 'No phone'}
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

      {/* Walk-in Check-in — unified modal */}
      <CheckInModal
        mode="walkin"
        open={walkInOpen}
        availableHouses={houses}
        onConfirm={confirmWalkIn}
        onClose={() => setWalkInOpen(false)}
      />

      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message}
        confirmLabel={confirmDialog?.confirmLabel}
        variant={confirmDialog?.variant}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />

      {/* Check-In Modal */}
      {checkInTarget && (
        <CheckInModal
          mode="reservation"
          open={!!checkInTarget}
          guestName={(checkInTarget.guest as any)?.full_name ?? 'Guest'}
          reservationNumber={checkInTarget.reservation_number}
          houseName={(checkInTarget.house as any)?.name ?? ''}
          checkInDate={checkInTarget.check_in_date}
          checkOutDate={checkInTarget.check_out_date}
          nights={calculateNights(checkInTarget.check_in_date, checkInTarget.check_out_date)}
          totalAmount={Number((checkInTarget as any).total_amount ?? 0)}
          defaultIdType={(checkInTarget.guest as any)?.id_type ?? ''}
          defaultIdNumber={(checkInTarget.guest as any)?.id_number ?? ''}
          defaultNationality={(checkInTarget.guest as any)?.nationality ?? ''}
          onConfirm={confirmCheckIn}
          onClose={() => setCheckInTarget(null)}
        />
      )}

      {/* Check-Out Inspection Modal */}
      {checkOutTarget && (
        <CheckOutModal
          open={!!checkOutTarget}
          guestName={(checkOutTarget.guest as any)?.full_name ?? 'Guest'}
          reservationNumber={checkOutTarget.reservation_number}
          houseName={(checkOutTarget.house as any)?.name ?? ''}
          checkOutDate={checkOutTarget.check_out_date}
          onConfirm={confirmCheckOut}
          onClose={() => setCheckOutTarget(null)}
        />
      )}

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
                    <span className="text-xs text-green-700 font-medium bg-green-50 px-2 py-0.5 rounded-full whitespace-nowrap">Arriving today</span>
                  )}
                  {canCheckOut && (
                    <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full whitespace-nowrap">Departing today</span>
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
