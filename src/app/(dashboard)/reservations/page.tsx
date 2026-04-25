'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { formatDate, calculateNights, generateReservationNumber, formatCurrency, capitalize } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import type { Reservation, Room, Guest } from '@/types'

const STATUSES = ['all', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']
const SOURCES = ['walk_in', 'phone', 'online', 'ota', 'referral']

const emptyForm = {
  guest_id: '', guest_name: '', guest_email: '', guest_phone: '',
  room_id: '', check_in_date: '', check_out_date: '',
  adults: 1, children: 0, source: 'walk_in', special_requests: '', status: 'confirmed', notes: '',
}

export default function ReservationsPage() {
  const supabase = createClient()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [resRes, roomRes, guestRes] = await Promise.all([
      supabase.from('reservations').select('*, guest:guests(full_name, email, phone), room:rooms(room_number, room_type, price_per_night)').order('created_at', { ascending: false }),
      supabase.from('rooms').select('*').in('status', ['available', 'occupied']).order('room_number'),
      supabase.from('guests').select('id, full_name, email, phone').order('full_name'),
    ])
    setReservations((resRes.data ?? []) as unknown as Reservation[])
    setRooms(roomRes.data ?? [])
    setGuests(guestRes.data ?? [])
    setLoading(false)
  }

  const filtered = reservations.filter(r => {
    const guestName = (r.guest as any)?.full_name ?? ''
    const matchSearch = !search || guestName.toLowerCase().includes(search.toLowerCase()) || r.reservation_number.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  function openCreate() {
    setEditId(null)
    setForm({ ...emptyForm })
    setModalOpen(true)
  }

  function openEdit(res: Reservation) {
    setEditId(res.id)
    setForm({
      guest_id: res.guest_id ?? '',
      guest_name: (res.guest as any)?.full_name ?? '',
      guest_email: (res.guest as any)?.email ?? '',
      guest_phone: (res.guest as any)?.phone ?? '',
      room_id: res.room_id ?? '',
      check_in_date: res.check_in_date,
      check_out_date: res.check_out_date,
      adults: res.adults,
      children: res.children,
      source: res.source,
      special_requests: res.special_requests ?? '',
      status: res.status,
      notes: res.notes ?? '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.check_in_date || !form.check_out_date || !form.room_id) {
      toast('Please fill in all required fields', 'error'); return
    }
    setSaving(true)

    const selectedRoom = rooms.find(r => r.id === form.room_id)
    const nights = calculateNights(form.check_in_date, form.check_out_date)
    const totalAmount = selectedRoom ? selectedRoom.price_per_night * nights : 0

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

    if (editId) {
      const { error } = await supabase.from('reservations').update({
        room_id: form.room_id,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        adults: form.adults,
        children: form.children,
        source: form.source,
        special_requests: form.special_requests || null,
        status: form.status,
        notes: form.notes || null,
        total_amount: totalAmount,
        updated_at: new Date().toISOString(),
      }).eq('id', editId)
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      toast('Reservation updated')
    } else {
      const { data: newRes, error } = await supabase.from('reservations').insert({
        reservation_number: generateReservationNumber(),
        guest_id: guestId,
        room_id: form.room_id,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        adults: form.adults,
        children: form.children,
        source: form.source,
        special_requests: form.special_requests || null,
        status: form.status,
        notes: form.notes || null,
        total_amount: totalAmount,
      }).select().single()

      if (error) { toast(error.message, 'error'); setSaving(false); return }

      // Telegram notification
      if (newRes) {
        fetch('/api/telegram/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'new_reservation',
            data: {
              guest_name: form.guest_name,
              room_number: selectedRoom?.room_number,
              room_type: selectedRoom?.room_type,
              check_in: form.check_in_date,
              check_out: form.check_out_date,
              reservation_number: newRes.reservation_number,
            }
          })
        }).catch(() => {})
      }
      toast('Reservation created')
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

  const nights = form.check_in_date && form.check_out_date ? calculateNights(form.check_in_date, form.check_out_date) : 0
  const selectedRoom = rooms.find(r => r.id === form.room_id)
  const estimatedTotal = selectedRoom ? selectedRoom.price_per_night * nights : 0

  return (
    <>
      <TopBar title="Reservations" subtitle="Manage bookings & availability" />
      <div className="p-8 flex-1 section-enter">
        {/* Header */}
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
              {STATUSES.map(s => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : capitalize(s)}</option>)}
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
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Ref</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Guest</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Room</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Check-in</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Check-out</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Nights</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Total</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="px-5 py-10 text-center text-hmuted">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-5 py-10 text-center text-hmuted">No reservations found</td></tr>
                ) : filtered.map(res => {
                  const nights = calculateNights(res.check_in_date, res.check_out_date)
                  return (
                    <tr key={res.id} className="border-t border-hborder hover:bg-hbg/40 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-hmuted">{res.reservation_number}</td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-htext">{(res.guest as any)?.full_name ?? '—'}</p>
                        <p className="text-xs text-hmuted">{(res.guest as any)?.phone ?? ''}</p>
                      </td>
                      <td className="px-5 py-3 text-hmuted">{(res.room as any)?.room_number ?? '—'}</td>
                      <td className="px-5 py-3 text-hmuted">{formatDate(res.check_in_date)}</td>
                      <td className="px-5 py-3 text-hmuted">{formatDate(res.check_out_date)}</td>
                      <td className="px-5 py-3 text-hmuted">{nights}</td>
                      <td className="px-5 py-3 font-medium text-htext">{res.total_amount ? formatCurrency(res.total_amount) : '—'}</td>
                      <td className="px-5 py-3"><Badge status={res.status} /></td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1.5">
                          <button onClick={() => openEdit(res)} className="text-xs text-navy hover:underline">Edit</button>
                          {!['cancelled','checked_out','no_show'].includes(res.status) && (
                            <button onClick={() => handleCancel(res.id)} className="text-xs text-red-600 hover:underline">Cancel</button>
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

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Edit Reservation' : 'New Reservation'}
        subtitle="Fill in the booking details"
        size="lg"
      >
        <div className="space-y-4">
          {/* Guest */}
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
                  placeholder="+1 234 567 8900"
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

          {/* Booking Details */}
          <div className="border border-hborder rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Booking Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-hmuted mb-1">Room *</label>
                <select
                  value={form.room_id}
                  onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                >
                  <option value="">Select room…</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.room_number} — {capitalize(r.room_type)} ({formatCurrency(r.price_per_night)}/night)
                    </option>
                  ))}
                </select>
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
                <label className="block text-xs text-hmuted mb-1">Adults</label>
                <input
                  type="number" min={1} max={6}
                  value={form.adults}
                  onChange={e => setForm(f => ({ ...f, adults: Number(e.target.value) }))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Children</label>
                <input
                  type="number" min={0} max={6}
                  value={form.children}
                  onChange={e => setForm(f => ({ ...f, children: Number(e.target.value) }))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
            </div>
            {editId && (
              <div>
                <label className="block text-xs text-hmuted mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                >
                  {['pending','confirmed','checked_in','checked_out','cancelled','no_show'].map(s => (
                    <option key={s} value={s}>{capitalize(s)}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-hmuted mb-1">Special Requests</label>
              <textarea
                value={form.special_requests}
                onChange={e => setForm(f => ({ ...f, special_requests: e.target.value }))}
                rows={2}
                placeholder="Any special requests or notes…"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg resize-none"
              />
            </div>
          </div>

          {/* Estimate */}
          {nights > 0 && selectedRoom && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-blue-700">{nights} night{nights > 1 ? 's' : ''} × {formatCurrency(selectedRoom.price_per_night)}</span>
              <span className="font-semibold text-dark-navy">{formatCurrency(estimatedTotal)}</span>
            </div>
          )}

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
