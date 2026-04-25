'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, capitalize } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import type { Room, RoomStatus, RoomType } from '@/types'

const ROOM_TYPES: RoomType[] = ['standard', 'deluxe', 'suite', 'presidential']
const STATUSES: RoomStatus[] = ['available', 'occupied', 'cleaning', 'maintenance', 'out_of_order']

const STATUS_COLORS: Record<RoomStatus, { bg: string; border: string; text: string }> = {
  available:    { bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-700' },
  occupied:     { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-700'  },
  cleaning:     { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700'},
  maintenance:  { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-700'   },
  out_of_order: { bg: 'bg-gray-50',   border: 'border-gray-300',   text: 'text-gray-500'  },
}

const emptyRoom = { room_number: '', room_type: 'standard' as RoomType, floor: 1, price_per_night: 0, max_adults: 2, max_children: 1, description: '', amenities: '' }

export default function RoomsPage() {
  const supabase = createClient()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ ...emptyRoom })
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => { loadRooms() }, [])

  async function loadRooms() {
    const { data } = await supabase.from('rooms').select('*').order('floor').order('room_number')
    setRooms((data ?? []) as unknown as Room[])
    setLoading(false)
  }

  const floors = [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b)
  const filteredRooms = rooms.filter(r => filterStatus === 'all' || r.status === filterStatus)
  const roomsByFloor = floors.map(f => ({ floor: f, rooms: filteredRooms.filter(r => r.floor === f) }))

  function openAdd() {
    setEditId(null)
    setForm({ ...emptyRoom })
    setAddOpen(true)
  }

  function openEdit(room: Room) {
    setEditId(room.id)
    setForm({
      room_number: room.room_number,
      room_type: room.room_type,
      floor: room.floor,
      price_per_night: room.price_per_night,
      max_adults: room.max_adults,
      max_children: room.max_children,
      description: room.description ?? '',
      amenities: room.amenities?.join(', ') ?? '',
    })
    setSelectedRoom(null)
    setAddOpen(true)
  }

  async function handleSave() {
    if (!form.room_number || form.price_per_night <= 0) {
      toast('Room number and price are required', 'error'); return
    }
    setSaving(true)
    const payload = {
      room_number: form.room_number,
      room_type: form.room_type,
      floor: form.floor,
      price_per_night: form.price_per_night,
      max_adults: form.max_adults,
      max_children: form.max_children,
      description: form.description || null,
      amenities: form.amenities ? form.amenities.split(',').map(a => a.trim()).filter(Boolean) : [],
      updated_at: new Date().toISOString(),
    }
    if (editId) {
      const { error } = await supabase.from('rooms').update(payload).eq('id', editId)
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      toast('Room updated')
    } else {
      const { error } = await supabase.from('rooms').insert({ ...payload, status: 'available' })
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      toast('Room added')
    }
    setSaving(false)
    setAddOpen(false)
    loadRooms()
  }

  async function handleStatusChange(roomId: string, newStatus: RoomStatus) {
    await supabase.from('rooms').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', roomId)
    if (newStatus === 'maintenance') {
      fetch('/api/telegram/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'room_maintenance', data: {
          room_number: rooms.find(r => r.id === roomId)?.room_number,
          priority: 'normal',
        }})
      }).catch(() => {})
    }
    toast('Room status updated')
    setSelectedRoom(null)
    loadRooms()
  }

  const summaryStats = [
    { label: 'Available', count: rooms.filter(r => r.status === 'available').length, color: '#1A7A4A' },
    { label: 'Occupied', count: rooms.filter(r => r.status === 'occupied').length, color: '#004AAD' },
    { label: 'Cleaning', count: rooms.filter(r => r.status === 'cleaning').length, color: '#A05C00' },
    { label: 'Maintenance', count: rooms.filter(r => r.status === 'maintenance').length, color: '#B83232' },
  ]

  return (
    <>
      <TopBar title="Room Management" subtitle="Types, floors, pricing & availability" />
      <div className="p-8 flex-1 section-enter">
        {/* Summary + actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {summaryStats.map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="text-sm text-hmuted">{s.label}</span>
                <span className="text-sm font-semibold text-dark-navy">{s.count}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
            >
              <option value="all">All Rooms</option>
              {STATUSES.map(s => <option key={s} value={s}>{capitalize(s)}</option>)}
            </select>
            <Button onClick={openAdd}>+ Add Room</Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-5 mb-5 flex-wrap">
          {Object.entries(STATUS_COLORS).map(([status, c]) => (
            <div key={status} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded ${c.bg} border ${c.border}`} />
              <span className="text-xs text-hmuted">{capitalize(status)}</span>
            </div>
          ))}
        </div>

        {/* Floor grid */}
        {loading ? (
          <p className="text-center text-hmuted py-16">Loading rooms…</p>
        ) : rooms.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-hmuted mb-4">No rooms yet. Add your first room to get started.</p>
            <Button onClick={openAdd}>+ Add Room</Button>
          </div>
        ) : roomsByFloor.map(({ floor, rooms: floorRooms }) => (
          <div key={floor} className="mb-6">
            <p className="text-xs font-semibold text-hmuted uppercase tracking-widest mb-3">Floor {floor}</p>
            <div className="grid grid-cols-6 gap-2.5 sm:grid-cols-8 lg:grid-cols-10">
              {floorRooms.map(room => {
                const c = STATUS_COLORS[room.status]
                return (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoom(room)}
                    className={`rounded-xl p-2.5 text-center border-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${c.bg} ${c.border} ${c.text}`}
                  >
                    <div className="font-bold text-[13px]">{room.room_number}</div>
                    <div className="text-[9px] opacity-70 mt-0.5 capitalize">{room.room_type}</div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Room detail modal */}
      <Modal
        open={!!selectedRoom}
        onClose={() => setSelectedRoom(null)}
        title={`Room ${selectedRoom?.room_number}`}
        subtitle={selectedRoom ? `${capitalize(selectedRoom.room_type)} · Floor ${selectedRoom.floor}` : ''}
        size="sm"
      >
        {selectedRoom && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge status={selectedRoom.status} />
              <span className="font-semibold text-dark-navy">{formatCurrency(selectedRoom.price_per_night)}<span className="text-xs text-hmuted font-normal">/night</span></span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-hsurface2 rounded-lg p-3">
                <p className="text-xs text-hmuted mb-1">Max Guests</p>
                <p className="font-medium">{selectedRoom.max_adults} adults, {selectedRoom.max_children} children</p>
              </div>
              <div className="bg-hsurface2 rounded-lg p-3">
                <p className="text-xs text-hmuted mb-1">Floor</p>
                <p className="font-medium">Floor {selectedRoom.floor}</p>
              </div>
            </div>
            {selectedRoom.amenities?.length > 0 && (
              <div>
                <p className="text-xs text-hmuted mb-1.5">Amenities</p>
                <div className="flex gap-1.5 flex-wrap">
                  {selectedRoom.amenities.map(a => (
                    <span key={a} className="bg-hsurface2 text-hmuted text-xs px-2 py-0.5 rounded-md">{a}</span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-hmuted mb-2">Change Status</p>
              <div className="flex gap-2 flex-wrap">
                {STATUSES.filter(s => s !== selectedRoom.status).map(s => (
                  <Button key={s} size="sm" variant="ghost" onClick={() => handleStatusChange(selectedRoom.id, s)}>
                    {capitalize(s)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t border-hborder">
              <Button variant="ghost" size="sm" onClick={() => openEdit(selectedRoom)} className="flex-1">Edit Details</Button>
              <Button variant="danger" size="sm" className="flex-1" onClick={async () => {
                if (!confirm('Delete this room?')) return
                await supabase.from('rooms').delete().eq('id', selectedRoom.id)
                toast('Room deleted')
                setSelectedRoom(null)
                loadRooms()
              }}>Delete</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add/Edit Room Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={editId ? 'Edit Room' : 'Add New Room'}
        size="md"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Room Number *</label>
              <input
                value={form.room_number}
                onChange={e => setForm(f => ({ ...f, room_number: e.target.value }))}
                placeholder="e.g. 101"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Floor</label>
              <input
                type="number" min={1}
                value={form.floor}
                onChange={e => setForm(f => ({ ...f, floor: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Room Type</label>
              <select
                value={form.room_type}
                onChange={e => setForm(f => ({ ...f, room_type: e.target.value as RoomType }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {ROOM_TYPES.map(t => <option key={t} value={t}>{capitalize(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Price / Night ($) *</label>
              <input
                type="number" min={0} step={0.01}
                value={form.price_per_night}
                onChange={e => setForm(f => ({ ...f, price_per_night: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Max Adults</label>
              <input
                type="number" min={1} max={10}
                value={form.max_adults}
                onChange={e => setForm(f => ({ ...f, max_adults: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Max Children</label>
              <input
                type="number" min={0} max={10}
                value={form.max_children}
                onChange={e => setForm(f => ({ ...f, max_children: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Amenities (comma-separated)</label>
            <input
              value={form.amenities}
              onChange={e => setForm(f => ({ ...f, amenities: e.target.value }))}
              placeholder="WiFi, AC, TV, Minibar, Balcony"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editId ? 'Update Room' : 'Add Room'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
