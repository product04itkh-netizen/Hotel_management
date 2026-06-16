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

  useEffect(() => {
    if (activeBranch) loadData()
  }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

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
    return matchSearch && matchStatus
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

  async function handleCancel(id: string) {
    if (!confirm('Cancel this reservation?')) return
    await supabase.from('reservations').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id)
    toast('Reservation cancelled', 'info')
    loadData()
  }

  return (
    <>
      <TopBar title="Reservations" subtitle={`Manage bookings — ${activeBranch?.location ?? ''}`} />
      <div className="p-8 flex-1 section-enter">

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by guest or ref…"
              className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy w-60"
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Statuses' : capitalize(s)}</option>
              ))}
            </select>
          </div>
          <Button onClick={openCreate}>+ New Reservation</Button>
        </div>

        {/* Table */}
        <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-hsurface2">
                  {['Ref', 'Guest', 'House', 'Check-in', 'Check-out', 'Pax', 'Add-ons', 'Total', 'Deposit', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="px-5 py-10 text-center text-hmuted">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={11} className="px-5 py-10 text-center text-hmuted">No reservations found</td></tr>
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
                      <td className="px-4 py-3"><Badge status={res.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(res)} className="text-xs text-navy hover:underline">Edit</button>
                          {!['cancelled', 'checked_out', 'no_show'].includes(res.status) && (
                            <button onClick={() => handleCancel(res.id)} className="text-xs text-red-500 hover:underline">Cancel</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
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
