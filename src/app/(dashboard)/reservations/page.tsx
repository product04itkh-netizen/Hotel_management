'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { formatDate, calculateNights, generateReservationNumber, formatCurrency, capitalize } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import type { Reservation, House } from '@/types'

const STATUSES = ['all', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']
const SOURCES = ['walk_in', 'phone', 'online', 'ota', 'referral']


const PRESET_ADDONS = [
  { label: 'Car Rental (4WD)', icon: '🚙' },
  { label: 'Food & Cooking', icon: '🍳' },
  { label: 'BBQ / Grilling', icon: '🔥' },
  { label: 'Ice', icon: '🧊' },
  { label: 'Tent Rental', icon: '⛺' },
  { label: 'Bedding Set', icon: '🛏' },
  { label: 'Extra Cleaning', icon: '🧹' },
  { label: 'Transport', icon: '🚌' },
  { label: 'Kayak Rental', icon: '🚣' },
  { label: 'Bike Rental', icon: '🚲' },
]

interface LineItemForm {
  id?: string
  label: string
  amount: number | string
}

const emptyForm = {
  guest_id: '', guest_name: '', guest_email: '', guest_phone: '',
  house_id: '', check_in_date: '', check_out_date: '',
  adults: 1, children: 0, source: 'walk_in', special_requests: '', status: 'confirmed', notes: '',
}

export default function ReservationsPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [houses, setHouses] = useState<House[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [lineItems, setLineItems] = useState<LineItemForm[]>([])
  const [deposit, setDeposit] = useState<number | string>(0)
  const [paxCount, setPaxCount] = useState<number | string>('')
  const [arrivalTime, setArrivalTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })
  const [houseFilter, setHouseFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [khHolidays, setKhHolidays] = useState<Record<string, string>>({})
  const [notifyingId, setNotifyingId] = useState<string | null>(null)

  useEffect(() => {
    if (activeBranch) loadData()
  }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Cambodian public holidays from Calendarific (once per year, cached 90 days)
  useEffect(() => {
    if (viewMode !== 'calendar') return
    const yearsNeeded = new Set<number>()
    if (dateFrom || dateTo) {
      const start = new Date((dateFrom || dateTo) + 'T00:00:00').getFullYear()
      const end   = new Date((dateTo || dateFrom) + 'T00:00:00').getFullYear()
      for (let y = start; y <= end; y++) yearsNeeded.add(y)
    } else {
      yearsNeeded.add(calMonth.getFullYear())
      yearsNeeded.add(calMonth.getFullYear() + 1) // prefetch next year
    }
    yearsNeeded.forEach(async (year) => {
      try {
        const res = await fetch(`/api/holidays?year=${year}`)
        if (res.ok) {
          const data: Record<string, string> = await res.json()
          setKhHolidays(prev => ({ ...prev, ...data }))
        }
      } catch { /* silently fail — calendar still works without holidays */ }
    })
  }, [viewMode, calMonth, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    if (!activeBranch) return
    const [resRes, houseRes] = await Promise.all([
      supabase.from('reservations')
        .select('*, guest:guests(full_name, email, phone), house:houses(name, house_type, base_rate_per_night), line_items:reservation_line_items(id, label, amount, sort_order)')
        .eq('branch_id', activeBranch.id)
        .order('check_in_date', { ascending: false }),
      supabase.from('houses')
        .select('*')
        .eq('branch_id', activeBranch.id)
        .order('name'),
    ])
    setReservations((resRes.data ?? []) as unknown as Reservation[])
    setHouses((houseRes.data ?? []) as unknown as House[])
    setLoading(false)
  }

  const filtered = reservations.filter(r => {
    const guestName = (r.guest as any)?.full_name ?? ''
    const matchSearch = !search
      || guestName.toLowerCase().includes(search.toLowerCase())
      || r.reservation_number.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    const matchHouse = houseFilter === 'all' || r.house_id === houseFilter
    const matchFrom = !dateFrom || r.check_in_date >= dateFrom
    const matchTo = !dateTo || r.check_in_date <= dateTo
    return matchSearch && matchStatus && matchHouse && matchFrom && matchTo
  })

  function openCreate() {
    setEditId(null)
    setForm({ ...emptyForm })
    setLineItems([])
    setDeposit(0)
    setPaxCount('')
    setArrivalTime('')
    setModalOpen(true)
  }

  function openEdit(res: Reservation) {
    setEditId(res.id)
    setForm({
      guest_id: res.guest_id ?? '',
      guest_name: (res.guest as any)?.full_name ?? '',
      guest_email: (res.guest as any)?.email ?? '',
      guest_phone: (res.guest as any)?.phone ?? '',
      house_id: res.house_id ?? '',
      check_in_date: res.check_in_date,
      check_out_date: res.check_out_date,
      adults: res.adults,
      children: res.children,
      source: res.source,
      special_requests: res.special_requests ?? '',
      status: res.status,
      notes: res.notes ?? '',
    })
    const existing = (res.line_items ?? []) as any[]
    setLineItems(
      [...existing]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(i => ({ id: i.id, label: i.label, amount: i.amount }))
    )
    setDeposit(res.deposit ?? 0)
    setPaxCount(res.pax_count ?? '')
    setArrivalTime(res.arrival_time ?? '')
    setModalOpen(true)
  }

  function addPreset(preset: { label: string; icon: string }) {
    if (lineItems.some(i => i.label === preset.label)) {
      toast(`${preset.label} already added`, 'info'); return
    }
    setLineItems(prev => [...prev, { label: preset.label, amount: '' }])
  }

  function addCustom() {
    setLineItems(prev => [...prev, { label: '', amount: '' }])
  }

  function updateItem(idx: number, field: 'label' | 'amount', value: string | number) {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function removeItem(idx: number) {
    setLineItems(prev => prev.filter((_, i) => i !== idx))
  }

  // Cost calculations (live as user types)
  const nights = form.check_in_date && form.check_out_date
    ? calculateNights(form.check_in_date, form.check_out_date)
    : 0
  const selectedHouse = houses.find(h => h.id === form.house_id)
  const houseBase = selectedHouse && nights > 0 ? selectedHouse.base_rate_per_night * nights : 0
  const addOnsTotal = lineItems.reduce((s, i) => s + Number(i.amount || 0), 0)
  const subtotal = houseBase + addOnsTotal
  const depositNum = Number(deposit || 0)
  const balanceDue = subtotal - depositNum

  async function handleSave() {
    if (!form.guest_name || !form.check_in_date || !form.check_out_date || !form.house_id) {
      toast('Guest name, house, and dates are required', 'error'); return
    }
    if (!activeBranch) { toast('No branch selected', 'error'); return }
    setSaving(true)

    const validItems = lineItems.filter(i => i.label.trim())

    // Upsert guest
    let guestId = form.guest_id
    if (!guestId && form.guest_name) {
      const { data: newGuest } = await supabase.from('guests').insert({
        full_name: form.guest_name,
        email: form.guest_email || null,
        phone: form.guest_phone || null,
        visit_count: 1,
      }).select().single()
      guestId = newGuest?.id ?? null
    }

    let reservationId: string | null = editId

    if (editId) {
      const { error } = await supabase.from('reservations').update({
        house_id: form.house_id,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        adults: form.adults,
        children: form.children,
        pax_count: paxCount !== '' ? Number(paxCount) : null,
        arrival_time: arrivalTime || null,
        source: form.source,
        special_requests: form.special_requests || null,
        status: form.status,
        notes: form.notes || null,
        total_amount: subtotal,
        deposit: depositNum,
        updated_at: new Date().toISOString(),
      }).eq('id', editId)
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      toast('Reservation updated')
    } else {
      const { data: newRes, error } = await supabase.from('reservations').insert({
        reservation_number: generateReservationNumber(),
        guest_id: guestId,
        house_id: form.house_id,
        branch_id: activeBranch.id,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        adults: form.adults,
        children: form.children,
        pax_count: paxCount !== '' ? Number(paxCount) : null,
        arrival_time: arrivalTime || null,
        source: form.source,
        special_requests: form.special_requests || null,
        status: form.status,
        notes: form.notes || null,
        total_amount: subtotal,
        deposit: depositNum,
      }).select().single()

      if (error) { toast(error.message, 'error'); setSaving(false); return }
      reservationId = newRes?.id ?? null

      if (newRes) {
        fetch('/api/telegram/notify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'new_reservation', branch_id: activeBranch?.id,
            data: {
              guest_name: form.guest_name,
              house_name: selectedHouse?.name,
              check_in: form.check_in_date,
              check_out: form.check_out_date,
              reservation_number: newRes.reservation_number,
              pax: paxCount,
            },
          }),
        }).catch(() => {})
      }
      toast('Reservation created')
    }

    // Sync line items: full replace
    if (reservationId) {
      await supabase.from('reservation_line_items').delete().eq('reservation_id', reservationId)
      if (validItems.length > 0) {
        await supabase.from('reservation_line_items').insert(
          validItems.map((item, i) => ({
            reservation_id: reservationId,
            label: item.label.trim(),
            amount: Number(item.amount) || 0,
            sort_order: i,
          }))
        )
      }
    }

    setSaving(false)
    setModalOpen(false)
    loadData()
  }

  async function handleNotify(res: any) {
    setNotifyingId(res.id)
    const response = await fetch('/api/telegram/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'new_reservation', branch_id: activeBranch?.id,
        data: {
          guest_name: (res.guest as any)?.full_name ?? res.guest_name,
          house_name: (res.house as any)?.name,
          check_in: res.check_in_date,
          check_out: res.check_out_date,
          reservation_number: res.reservation_number,
        },
      }),
    })
    const json = await response.json()
    if (json.ok) {
      toast(`Notification sent for ${res.reservation_number}`)
    } else {
      toast(json.error ?? 'Failed to send notification', 'error')
    }
    setNotifyingId(null)
  }

  async function handleCancel(res: any) {
    if (!confirm('Cancel this reservation?')) return
    await supabase.from('reservations').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', res.id)
    fetch('/api/telegram/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'cancellation', branch_id: activeBranch?.id, data: {
        guest_name: (res.guest as any)?.full_name ?? res.guest_name,
        house_name: (res.house as any)?.name,
        reservation_number: res.reservation_number,
      }}),
    }).catch(() => {})
    toast('Reservation cancelled', 'info')
    loadData()
  }

  return (
    <>
      <TopBar title="Reservations" subtitle={`Manage bookings — ${activeBranch?.location ?? ''}`} />
      <div className="p-8 flex-1 section-enter">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Filters */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search guest or ref…"
            className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy w-48"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All Statuses' : capitalize(s.replace('_', ' '))}</option>
            ))}
          </select>
          <select
            value={houseFilter}
            onChange={e => setHouseFilter(e.target.value)}
            className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
          >
            <option value="all">All Properties</option>
            {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-hmuted whitespace-nowrap">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => {
                const v = e.target.value
                setDateFrom(v)
                if (v && viewMode === 'calendar') {
                  const d = new Date(v + 'T00:00:00')
                  d.setDate(1)
                  setCalMonth(d)
                }
              }}
              className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-hmuted whitespace-nowrap">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => {
                const v = e.target.value
                setDateTo(v)
                if (v && !dateFrom && viewMode === 'calendar') {
                  const d = new Date(v + 'T00:00:00')
                  d.setDate(1)
                  setCalMonth(d)
                }
              }}
              className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
            />
          </div>
          {(dateFrom || dateTo || houseFilter !== 'all' || statusFilter !== 'all' || search) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setHouseFilter('all'); setDateFrom(''); setDateTo('') }}
              className="text-xs text-hmuted hover:text-red-500 transition-colors px-2 py-2"
            >
              ✕ Clear
            </button>
          )}
          {/* Spacer */}
          <div className="flex-1" />
          {/* View toggle + action */}
          <div className="flex rounded-lg border border-hborder overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-navy text-white' : 'bg-white text-hmuted hover:bg-hbg'}`}
            >
              ☰ List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-2 text-xs font-medium transition-colors border-l border-hborder ${viewMode === 'calendar' ? 'bg-navy text-white' : 'bg-white text-hmuted hover:bg-hbg'}`}
            >
              ▦ Calendar
            </button>
          </div>
          <Button onClick={openCreate}>+ New Reservation</Button>
        </div>

        {/* ── LIST VIEW ── */}
        {viewMode === 'list' && (
          <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-hsurface2">
                    {['Ref', 'Guest', 'House', 'Check-in', 'Check-out', 'Pax', 'Add-ons', 'Total', 'Deposit', 'Remaining', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={12} className="px-5 py-10 text-center text-hmuted">Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={12} className="px-5 py-10 text-center text-hmuted">No reservations found</td></tr>
                  ) : filtered.map(res => {
                    const itemCount = (res.line_items ?? []).length
                    const dep = res.deposit ?? 0
                    const pax = res.pax_count
                    return (
                      <tr key={res.id} className="border-t border-hborder hover:bg-hbg/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-hmuted whitespace-nowrap">{res.reservation_number}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-htext">{(res.guest as any)?.full_name ?? '—'}</p>
                          <p className="text-xs text-hmuted">{(res.guest as any)?.phone ?? ''}</p>
                        </td>
                        <td className="px-4 py-3 text-hmuted">{(res.house as any)?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-hmuted whitespace-nowrap">{formatDate(res.check_in_date)}</td>
                        <td className="px-4 py-3 text-hmuted whitespace-nowrap">{formatDate(res.check_out_date)}</td>
                        <td className="px-4 py-3 text-hmuted">{pax != null ? `${pax} pax` : `${res.adults}A`}</td>
                        <td className="px-4 py-3">
                          {itemCount > 0 ? (
                            <span className="inline-flex items-center gap-1 bg-navy/10 text-navy text-xs px-2 py-0.5 rounded-full font-medium">
                              +{itemCount}
                            </span>
                          ) : <span className="text-hmuted text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 font-medium text-htext whitespace-nowrap">
                          {res.total_amount ? formatCurrency(res.total_amount) : '—'}
                        </td>
                        <td className="px-4 py-3 text-hmuted whitespace-nowrap">
                          {dep > 0 ? (
                            <span className="text-green-700 font-medium">{formatCurrency(dep)}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {res.total_amount != null ? (() => {
                            const remaining = (res.total_amount ?? 0) - dep
                            return remaining > 0
                              ? <span className="text-red-600 font-medium">{formatCurrency(remaining)}</span>
                              : remaining === 0
                                ? <span className="text-green-700 font-medium">Paid</span>
                                : '—'
                          })() : '—'}
                        </td>
                        <td className="px-4 py-3"><Badge status={res.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 items-center">
                            <button onClick={() => openEdit(res)} className="text-xs text-navy hover:underline">Edit</button>
                            {!['cancelled', 'checked_out', 'no_show'].includes(res.status) && (
                              <button onClick={() => handleCancel(res)} className="text-xs text-red-500 hover:underline">Cancel</button>
                            )}
                            <button
                              onClick={() => handleNotify(res)}
                              disabled={notifyingId === res.id}
                              title="Resend Telegram notification"
                              className="text-hmuted hover:text-[#229ED9] disabled:opacity-40 transition-colors"
                            >
                              {notifyingId === res.id ? (
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                              ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z"/>
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CALENDAR / GRID VIEW ── */}
        {viewMode === 'calendar' && (() => {
          const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
          const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
          const todayStr = new Date().toISOString().slice(0, 10)

          const statusColor: Record<string, { bg: string; text: string; border: string }> = {
            confirmed:   { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
            checked_in:  { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
            pending:     { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
            checked_out: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
            cancelled:   { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
            no_show:     { bg: '#fdf4ff', text: '#7e22ce', border: '#d8b4fe' },
          }

          function toDStr(d: Date) {
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          }

          const visibleHouses = houseFilter === 'all' ? houses : houses.filter(h => h.id === houseFilter)

          // Determine which months to display
          const monthsToShow: Date[] = []
          if (dateFrom || dateTo) {
            const start = new Date((dateFrom || dateTo)! + 'T00:00:00')
            start.setDate(1)
            const end = new Date((dateTo || dateFrom)! + 'T00:00:00')
            const cur = new Date(start)
            while (cur <= end) {
              monthsToShow.push(new Date(cur))
              cur.setMonth(cur.getMonth() + 1)
            }
          } else {
            monthsToShow.push(new Date(calMonth))
          }

          // Reservations for a specific day (optionally filtered by status)
          function getDayRes(dayStr: string) {
            return visibleHouses.flatMap(house =>
              reservations
                .filter(r =>
                  r.house_id === house.id &&
                  r.check_in_date <= dayStr &&
                  r.check_out_date > dayStr &&
                  (statusFilter === 'all' || r.status === statusFilter)
                )
                .map(r => ({ house, r }))
            )
          }

          function renderMonth(mStart: Date) {
            const yr = mStart.getFullYear()
            const mo = mStart.getMonth()
            const dim = new Date(yr, mo + 1, 0).getDate()

            // ISO week: Mon=0 … Sun=6
            const firstDow = (new Date(yr, mo, 1).getDay() + 6) % 7
            const cells: (Date | null)[] = [
              ...Array(firstDow).fill(null),
              ...Array.from({ length: dim }, (_, i) => new Date(yr, mo, i + 1)),
            ]
            while (cells.length % 7 !== 0) cells.push(null)

            const weeks: (Date | null)[][] = []
            for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

            return (
              <div key={`${yr}-${mo}`} className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden mb-6">
                {/* Month title */}
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
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Week rows */}
                {weeks.map((week, wi) => (
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
                          {/* Date number */}
                          <div className="flex justify-end mb-1">
                            <span
                              className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                                isToday ? 'bg-blue-600 text-white' : isWeekend ? 'text-amber-600' : 'text-hmuted'
                              }`}
                            >
                              {day.getDate()}
                            </span>
                          </div>

                          {/* Cambodian public holiday tag */}
                          {holiday && (
                            <div
                              title={holiday}
                              className="w-full mb-[3px] px-1 py-[2px] rounded-[3px] text-[9px] font-semibold leading-tight truncate bg-red-50 text-red-700 border border-red-200"
                            >
                              🇰🇭 {holiday}
                            </div>
                          )}

                          {/* Reservation chips */}
                          <div className="space-y-[3px]">
                            {entries.map(({ house, r }) => {
                              const sc = statusColor[r.status] ?? statusColor.confirmed
                              const guestName = (r.guest as any)?.full_name ?? 'Guest'
                              const isCI = r.check_in_date === ds
                              const isCO = r.check_out_date === ds
                              return (
                                <button
                                  key={r.id}
                                  onClick={() => openEdit(r)}
                                  title={`${guestName} · ${formatDate(r.check_in_date)} → ${formatDate(r.check_out_date)}`}
                                  className="w-full text-left rounded-[4px] px-1.5 py-[3px] text-[10px] font-semibold leading-tight truncate block hover:opacity-80 transition-opacity"
                                  style={{ background: sc.bg, color: sc.text, border: `1.5px solid ${sc.border}` }}
                                >
                                  {isCI && <span className="mr-0.5 opacity-60">▶</span>}
                                  {isCO && <span className="mr-0.5 opacity-60">◀</span>}
                                  {guestName}
                                  {visibleHouses.length > 1 && (
                                    <span className="opacity-60 ml-1">· {house.name}</span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )
          }

          return (
            <div>
              {/* Nav bar — only when no date range set */}
              {!dateFrom && !dateTo && (
                <div className="flex items-center gap-2 mb-5">
                  <button
                    onClick={() => { const d = new Date(calMonth); d.setMonth(d.getMonth()-1); setCalMonth(d) }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-hborder bg-white text-hmuted hover:bg-hbg transition-colors"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setCalMonth(d) }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-hborder bg-white text-navy font-semibold hover:bg-hbg transition-colors"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => { const d = new Date(calMonth); d.setMonth(d.getMonth()+1); setCalMonth(d) }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-hborder bg-white text-hmuted hover:bg-hbg transition-colors"
                  >
                    Next →
                  </button>
                  <span className="text-xs text-hmuted ml-2">{MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}</span>
                </div>
              )}
              {dateFrom && dateTo && (
                <p className="text-xs text-hmuted mb-5">
                  Showing {monthsToShow.length} month{monthsToShow.length > 1 ? 's' : ''} · {formatDate(dateFrom)} → {formatDate(dateTo)}
                </p>
              )}

              {loading ? (
                <div className="bg-white border border-hborder rounded-2xl p-12 text-center text-hmuted text-sm">Loading…</div>
              ) : (
                monthsToShow.map(m => renderMonth(m))
              )}
            </div>
          )
        })()}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Edit Reservation' : 'New Reservation'}
        subtitle="Fill in guest details, booking dates, and any add-on services"
        size="xl"
      >
        <div className="space-y-4">

          {/* ── Guest ── */}
          <div className="border border-hborder rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Guest Information</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-hmuted mb-1">Full Name *</label>
                <input
                  value={form.guest_name}
                  onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))}
                  placeholder="Guest full name"
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Phone</label>
                <input
                  value={form.guest_phone}
                  onChange={e => setForm(f => ({ ...f, guest_phone: e.target.value }))}
                  placeholder="+855 12 345 678"
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-hmuted mb-1">Email</label>
                <input
                  type="email"
                  value={form.guest_email}
                  onChange={e => setForm(f => ({ ...f, guest_email: e.target.value }))}
                  placeholder="guest@email.com"
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
            </div>
          </div>

          {/* ── Booking Details ── */}
          <div className="border border-hborder rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Booking Details</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-hmuted mb-1">House *</label>
                <select
                  value={form.house_id}
                  onChange={e => setForm(f => ({ ...f, house_id: e.target.value }))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                >
                  <option value="">Select house…</option>
                  {houses.map(h => (
                    <option key={h.id} value={h.id}>
                      {h.name} — {capitalize(h.house_type)} · {h.capacity} pax ({formatCurrency(h.base_rate_per_night)}/night)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Pax Count</label>
                <input
                  type="number" min={1}
                  value={paxCount}
                  onChange={e => setPaxCount(e.target.value)}
                  placeholder="Total guests"
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Source</label>
                <select
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                >
                  {SOURCES.map(s => <option key={s} value={s}>{capitalize(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Check-in Date *</label>
                <input
                  type="date"
                  value={form.check_in_date}
                  onChange={e => setForm(f => ({ ...f, check_in_date: e.target.value }))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Check-out Date *</label>
                <input
                  type="date"
                  value={form.check_out_date}
                  onChange={e => setForm(f => ({ ...f, check_out_date: e.target.value }))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Arrival Time</label>
                <input
                  type="time"
                  value={arrivalTime}
                  onChange={e => setArrivalTime(e.target.value)}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Adults</label>
                <input
                  type="number" min={1} max={30}
                  value={form.adults}
                  onChange={e => setForm(f => ({ ...f, adults: Number(e.target.value) }))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Children</label>
                <input
                  type="number" min={0} max={20}
                  value={form.children}
                  onChange={e => setForm(f => ({ ...f, children: Number(e.target.value) }))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              {editId && (
                <div>
                  <label className="block text-xs text-hmuted mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  >
                    {['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'].map(s => (
                      <option key={s} value={s}>{capitalize(s)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Special Requests / Notes</label>
              <textarea
                value={form.special_requests}
                onChange={e => setForm(f => ({ ...f, special_requests: e.target.value }))}
                rows={2}
                placeholder="Any special requests or notes…"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg resize-none"
              />
            </div>
          </div>

          {/* ── Add-ons ── */}
          <div className="border border-hborder rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Add-ons & Services</p>
              {lineItems.length > 0 && (
                <span className="text-xs text-navy font-medium">{lineItems.length} item{lineItems.length !== 1 ? 's' : ''} added</span>
              )}
            </div>

            {/* Quick-add preset chips */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ADDONS.map(p => {
                const added = lineItems.some(i => i.label === p.label)
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => addPreset(p)}
                    className={[
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all',
                      added
                        ? 'border-navy/40 bg-navy/8 text-navy cursor-default'
                        : 'border-hborder bg-hsurface2 text-htext hover:bg-white hover:border-navy/50',
                    ].join(' ')}
                  >
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                    {added && <span className="text-navy/60">✓</span>}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={addCustom}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-navy/50 text-navy text-xs hover:bg-navy/5 transition-colors font-medium"
              >
                + Custom Item
              </button>
            </div>

            {/* Line items list */}
            {lineItems.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-hborder">
                <div className="flex items-center gap-2 px-1">
                  <span className="flex-1 text-[10px] font-semibold text-hmuted uppercase tracking-wide">Description</span>
                  <span className="w-32 text-[10px] font-semibold text-hmuted uppercase tracking-wide text-right">Amount ($)</span>
                  <span className="w-6" />
                </div>
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={item.label}
                      onChange={e => updateItem(idx, 'label', e.target.value)}
                      placeholder="Service description…"
                      className="flex-1 border border-hborder rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                    />
                    <div className="relative w-32 flex-shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-hmuted text-sm pointer-events-none">$</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.amount}
                        onChange={e => updateItem(idx, 'amount', e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-6 pr-3 py-1.5 border border-hborder rounded-lg text-sm focus:outline-none focus:border-navy bg-hbg text-right"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="w-6 h-6 flex items-center justify-center text-hmuted hover:text-red-500 transition-colors rounded flex-shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Cost Summary ── */}
          {(selectedHouse || lineItems.length > 0) && (
            <div className="rounded-xl border border-hborder overflow-hidden">
              <div className="px-4 py-2.5 bg-hsurface2 border-b border-hborder">
                <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Cost Summary</p>
              </div>
              <div className="px-4 py-3 space-y-1.5 bg-white">
                {selectedHouse && nights > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-hmuted">
                      House — {nights} night{nights !== 1 ? 's' : ''} × {formatCurrency(selectedHouse.base_rate_per_night)}
                    </span>
                    <span className="font-medium text-htext">{formatCurrency(houseBase)}</span>
                  </div>
                )}
                {lineItems.filter(i => i.label.trim()).map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-hmuted">{item.label}</span>
                    <span className="font-medium text-htext">{formatCurrency(Number(item.amount) || 0)}</span>
                  </div>
                ))}

                <div className="flex justify-between text-sm border-t border-hborder pt-2 mt-1">
                  <span className="text-hmuted">Subtotal</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(subtotal)}</span>
                </div>

                {/* Deposit inline input */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-hmuted">Deposit Paid</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-hmuted text-xs">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={deposit}
                      onChange={e => setDeposit(e.target.value)}
                      placeholder="0"
                      className="w-24 text-right border border-hborder rounded-md px-2 py-0.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                    />
                  </div>
                </div>

                <div className="flex justify-between text-[15px] font-bold text-dark-navy border-t-2 border-hborder pt-2 mt-1">
                  <span>Balance Due</span>
                  <span className={balanceDue <= 0 ? 'text-green-600' : ''}>
                    {formatCurrency(Math.max(0, balanceDue))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editId ? 'Update Reservation' : 'Create Reservation'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
