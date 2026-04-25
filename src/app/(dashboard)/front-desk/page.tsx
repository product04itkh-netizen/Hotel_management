'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { formatDate, generateReservationNumber, formatCurrency, calculateNights } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import type { Reservation, Room } from '@/types'

export default function FrontDeskPage() {
  const supabase = createClient()
  const [arrivals, setArrivals] = useState<Reservation[]>([])
  const [departures, setDepartures] = useState<Reservation[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [walkIn, setWalkIn] = useState({
    guest_name: '', guest_phone: '', guest_email: '',
    room_id: '', check_out_date: '', adults: 1, children: 0,
  })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const today = new Date().toISOString().split('T')[0]
    const [arrRes, depRes, roomRes] = await Promise.all([
      supabase.from('reservations')
        .select('*, guest:guests(full_name, email, phone), room:rooms(room_number, room_type, floor)')
        .eq('check_in_date', today)
        .in('status', ['confirmed', 'pending'])
        .order('created_at'),
      supabase.from('reservations')
        .select('*, guest:guests(full_name, email, phone), room:rooms(room_number, room_type, floor)')
        .eq('check_out_date', today)
        .eq('status', 'checked_in')
        .order('created_at'),
      supabase.from('rooms').select('*').eq('status', 'available').order('room_number'),
    ])
    setArrivals((arrRes.data ?? []) as unknown as Reservation[])
    setDepartures((depRes.data ?? []) as unknown as Reservation[])
    setRooms(roomRes.data ?? [])
    setLoading(false)
  }

  async function handleCheckIn(res: Reservation) {
    if (!confirm(`Check in ${(res.guest as any)?.full_name}?`)) return
    await supabase.from('reservations').update({
      status: 'checked_in',
      actual_check_in: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', res.id)
    if (res.room_id) {
      await supabase.from('rooms').update({ status: 'occupied', updated_at: new Date().toISOString() }).eq('id', res.room_id)
    }
    fetch('/api/telegram/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'checkin', data: {
        guest_name: (res.guest as any)?.full_name,
        room_number: (res.room as any)?.room_number,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        reservation_number: res.reservation_number,
      }})
    }).catch(() => {})
    toast(`${(res.guest as any)?.full_name} checked in`)
    loadData()
  }

  async function handleCheckOut(res: Reservation) {
    if (!confirm(`Check out ${(res.guest as any)?.full_name}?`)) return
    await supabase.from('reservations').update({
      status: 'checked_out',
      actual_check_out: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', res.id)
    if (res.room_id) {
      await supabase.from('rooms').update({ status: 'cleaning', updated_at: new Date().toISOString() }).eq('id', res.room_id)
      // Create housekeeping task
      await supabase.from('housekeeping_tasks').insert({
        room_id: res.room_id,
        task_type: 'cleaning',
        status: 'pending',
        priority: 'high',
        due_date: new Date().toISOString().split('T')[0],
        notes: `Post-checkout cleaning for reservation ${res.reservation_number}`,
      })
    }
    fetch('/api/telegram/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'checkout', data: {
        guest_name: (res.guest as any)?.full_name,
        room_number: (res.room as any)?.room_number,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        reservation_number: res.reservation_number,
      }})
    }).catch(() => {})
    toast(`${(res.guest as any)?.full_name} checked out`)
    loadData()
  }

  async function handleWalkIn() {
    if (!walkIn.guest_name || !walkIn.room_id || !walkIn.check_out_date) {
      toast('Please fill required fields', 'error'); return
    }
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const selectedRoom = rooms.find(r => r.id === walkIn.room_id)
    const nights = calculateNights(today, walkIn.check_out_date)
    const total = selectedRoom ? selectedRoom.price_per_night * nights : 0

    const { data: guest } = await supabase.from('guests').insert({
      full_name: walkIn.guest_name,
      phone: walkIn.guest_phone || null,
      email: walkIn.guest_email || null,
      visit_count: 1,
    }).select().single()

    const { error } = await supabase.from('reservations').insert({
      reservation_number: generateReservationNumber(),
      guest_id: guest?.id,
      room_id: walkIn.room_id,
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
      await supabase.from('rooms').update({ status: 'occupied', updated_at: new Date().toISOString() }).eq('id', walkIn.room_id)
      toast('Walk-in guest checked in')
      setWalkInOpen(false)
      setWalkIn({ guest_name: '', guest_phone: '', guest_email: '', room_id: '', check_out_date: '', adults: 1, children: 0 })
      loadData()
    } else {
      toast(error.message, 'error')
    }
    setSaving(false)
  }

  return (
    <>
      <TopBar title="Front Desk" subtitle="Check-in & check-out operations" />
      <div className="p-8 flex-1 section-enter">
        <div className="flex justify-end mb-6">
          <Button onClick={() => setWalkInOpen(true)}>+ Walk-in Check-in</Button>
        </div>

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
                {arrivals.map(res => (
                  <div key={res.id} className="px-5 py-4 flex items-center justify-between hover:bg-hbg/50">
                    <div className="min-w-0 mr-3">
                      <p className="font-medium text-htext truncate">{(res.guest as any)?.full_name ?? '—'}</p>
                      <p className="text-xs text-hmuted">
                        Room {(res.room as any)?.room_number ?? '?'} · {(res.guest as any)?.phone ?? 'No phone'}
                      </p>
                      <p className="text-xs text-hmuted mt-0.5">
                        Until {formatDate(res.check_out_date)} · {res.adults} adult{res.adults > 1 ? 's' : ''}
                        {res.children > 0 ? `, ${res.children} child` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge status={res.status} />
                      <Button size="sm" variant="success" onClick={() => handleCheckIn(res)}>Check In</Button>
                    </div>
                  </div>
                ))}
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
                        Room {(res.room as any)?.room_number ?? '?'} · {(res.guest as any)?.phone ?? 'No phone'}
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
                placeholder="+1 234 567 8900"
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
              <label className="block text-xs text-hmuted mb-1">Room *</label>
              <select
                value={walkIn.room_id}
                onChange={e => setWalkIn(f => ({ ...f, room_id: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                <option value="">Select available room…</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.room_number} — {r.room_type} ({formatCurrency(r.price_per_night)}/night)
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
                type="number" min={1} max={6}
                value={walkIn.adults}
                onChange={e => setWalkIn(f => ({ ...f, adults: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Children</label>
              <input
                type="number" min={0} max={6}
                value={walkIn.children}
                onChange={e => setWalkIn(f => ({ ...f, children: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setWalkInOpen(false)}>Cancel</Button>
            <Button onClick={handleWalkIn} disabled={saving}>{saving ? 'Checking in…' : 'Check In Now'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
