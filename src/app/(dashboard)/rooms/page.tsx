'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, capitalize } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import { cn } from '@/lib/utils'
import type { House, HouseStatus, HouseType, Room, RoomStatus } from '@/types'

const HOUSE_TYPES: HouseType[] = ['homestay', 'villa', 'bungalow', 'cottage', 'cabin', 'chalet']
const HOUSE_STATUSES: HouseStatus[] = ['available', 'occupied', 'maintenance', 'closed']
const ROOM_STATUSES: RoomStatus[] = ['available', 'occupied', 'cleaning', 'maintenance', 'out_of_order']

const HOUSE_COLORS: Record<HouseStatus, { bg: string; border: string; badge: string; dot: string }> = {
  available:   { bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  occupied:    { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  maintenance: { bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700',      dot: 'bg-red-500' },
  closed:      { bg: 'bg-gray-50',   border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400' },
}

const ROOM_DOT: Record<RoomStatus, string> = {
  available:    'bg-green-500',
  occupied:     'bg-blue-500',
  cleaning:     'bg-yellow-500',
  maintenance:  'bg-red-500',
  out_of_order: 'bg-gray-400',
}

const emptyHouseForm = {
  name: '', house_type: 'homestay' as HouseType,
  capacity: 4, base_rate_per_night: 0, amenities: '', description: '',
}

const emptyRoomForm = {
  room_number: '', room_type: 'standard', floor: 1,
  max_adults: 2, max_children: 2, amenities: '', description: '',
}

export default function PropertiesPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()

  const [houses, setHouses] = useState<House[]>([])
  const [loading, setLoading] = useState(true)

  // Selected house for detail view
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(null)
  const selectedHouse = houses.find(h => h.id === selectedHouseId) ?? null
  const [houseBookings, setHouseBookings] = useState<any[]>([])

  // House add/edit modal
  const [houseFormOpen, setHouseFormOpen] = useState(false)
  const [editHouseId, setEditHouseId] = useState<string | null>(null)
  const [houseForm, setHouseForm] = useState({ ...emptyHouseForm })
  const [houseSaving, setHouseSaving] = useState(false)

  // Room add/edit modal
  const [roomFormOpen, setRoomFormOpen] = useState(false)
  const [editRoomId, setEditRoomId] = useState<string | null>(null)
  const [roomFormHouseId, setRoomFormHouseId] = useState<string | null>(null)
  const [roomForm, setRoomForm] = useState({ ...emptyRoomForm })
  const [roomSaving, setRoomSaving] = useState(false)

  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => { if (activeBranch) loadHouses() }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedHouseId) { setHouseBookings([]); return }
    const today = new Date().toISOString().split('T')[0]
    supabase
      .from('reservations')
      .select('reservation_number, check_in_date, check_out_date, arrival_time, status, pax_count, adults, guest:guests(full_name)')
      .eq('house_id', selectedHouseId)
      .gte('check_out_date', today)
      .in('status', ['pending', 'confirmed', 'checked_in'])
      .order('check_in_date')
      .limit(6)
      .then(({ data }) => setHouseBookings(data ?? []))
  }, [selectedHouseId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHouses() {
    if (!activeBranch) return
    const { data } = await supabase
      .from('houses')
      .select('*, rooms(*)')
      .eq('branch_id', activeBranch.id)
      .order('name')
    setHouses((data ?? []) as unknown as House[])
    setLoading(false)
  }

  const filteredHouses = filterStatus === 'all'
    ? houses
    : houses.filter(h => h.status === filterStatus)

  // ── House CRUD ────────────────────────────────────────────────

  function openAddHouse() {
    setEditHouseId(null)
    setHouseForm({ ...emptyHouseForm })
    setSelectedHouseId(null)
    setHouseFormOpen(true)
  }

  function openEditHouse(house: House) {
    setEditHouseId(house.id)
    setHouseForm({
      name: house.name,
      house_type: house.house_type,
      capacity: house.capacity,
      base_rate_per_night: house.base_rate_per_night,
      amenities: house.amenities?.join(', ') ?? '',
      description: house.description ?? '',
    })
    setSelectedHouseId(null)
    setHouseFormOpen(true)
  }

  async function saveHouse() {
    if (!houseForm.name) { toast('House name is required', 'error'); return }
    setHouseSaving(true)
    const payload = {
      name: houseForm.name,
      house_type: houseForm.house_type,
      capacity: Number(houseForm.capacity),
      base_rate_per_night: Number(houseForm.base_rate_per_night),
      amenities: houseForm.amenities ? houseForm.amenities.split(',').map(a => a.trim()).filter(Boolean) : [],
      description: houseForm.description || null,
      updated_at: new Date().toISOString(),
    }
    if (editHouseId) {
      const { error } = await supabase.from('houses').update(payload).eq('id', editHouseId)
      if (error) { toast(error.message, 'error'); setHouseSaving(false); return }
      toast('House updated')
    } else {
      const { error } = await supabase.from('houses').insert({
        ...payload, status: 'available', branch_id: activeBranch?.id ?? null,
      })
      if (error) { toast(error.message, 'error'); setHouseSaving(false); return }
      toast('House added')
    }
    setHouseSaving(false)
    setHouseFormOpen(false)
    await loadHouses()
    if (editHouseId) setSelectedHouseId(editHouseId)
  }

  async function changeHouseStatus(house: House, status: HouseStatus) {
    await supabase.from('houses').update({ status, updated_at: new Date().toISOString() }).eq('id', house.id)
    if (status === 'maintenance') {
      fetch('/api/telegram/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'room_maintenance', branch_id: activeBranch?.id, data: {
          house_name: house.name,
          notes: `${house.name} marked as maintenance`,
        }}),
      }).catch(() => {})
    }
    toast(`${house.name} marked as ${status}`)
    await loadHouses()
    setSelectedHouseId(house.id)
  }

  async function deleteHouse(id: string) {
    if (!confirm('Delete this house? This will also remove all rooms inside it.')) return
    await supabase.from('houses').delete().eq('id', id)
    toast('House deleted')
    setSelectedHouseId(null)
    loadHouses()
  }

  // ── Room CRUD ─────────────────────────────────────────────────

  function openAddRoom(houseId: string) {
    setEditRoomId(null)
    setRoomFormHouseId(houseId)
    setRoomForm({ ...emptyRoomForm })
    setRoomFormOpen(true)
  }

  function openEditRoom(room: Room) {
    setEditRoomId(room.id)
    setRoomFormHouseId((room as any).house_id ?? null)
    setRoomForm({
      room_number: room.room_number,
      room_type: room.room_type,
      floor: room.floor,
      max_adults: room.max_adults,
      max_children: room.max_children,
      amenities: room.amenities?.join(', ') ?? '',
      description: room.description ?? '',
    })
    setRoomFormOpen(true)
  }

  async function saveRoom() {
    if (!roomForm.room_number) { toast('Room name is required', 'error'); return }
    if (!roomFormHouseId) { toast('No house selected', 'error'); return }
    setRoomSaving(true)
    const payload = {
      room_number: roomForm.room_number,
      room_type: roomForm.room_type,
      floor: Number(roomForm.floor),
      max_adults: Number(roomForm.max_adults),
      max_children: Number(roomForm.max_children),
      price_per_night: 0,
      amenities: roomForm.amenities ? roomForm.amenities.split(',').map(a => a.trim()).filter(Boolean) : [],
      description: roomForm.description || null,
      house_id: roomFormHouseId,
      branch_id: activeBranch?.id ?? null,
      updated_at: new Date().toISOString(),
    }
    if (editRoomId) {
      const { error } = await supabase.from('rooms').update(payload).eq('id', editRoomId)
      if (error) { toast(error.message, 'error'); setRoomSaving(false); return }
      toast('Room updated')
    } else {
      const { error } = await supabase.from('rooms').insert({ ...payload, status: 'available' })
      if (error) { toast(error.message, 'error'); setRoomSaving(false); return }
      toast('Room added')
    }
    setRoomSaving(false)
    setRoomFormOpen(false)
    await loadHouses()
    setSelectedHouseId(roomFormHouseId)
  }

  async function deleteRoom(room: Room) {
    if (!confirm(`Delete room "${room.room_number}"?`)) return
    await supabase.from('rooms').delete().eq('id', room.id)
    toast('Room deleted')
    await loadHouses()
    setSelectedHouseId(roomFormHouseId ?? (room as any).house_id)
  }

  async function changeRoomStatus(room: Room, status: RoomStatus) {
    await supabase.from('rooms').update({ status, updated_at: new Date().toISOString() }).eq('id', room.id)
    if (status === 'maintenance') {
      fetch('/api/telegram/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'room_maintenance', branch_id: activeBranch?.id, data: {
          house_name: room.room_number,
          notes: `Room ${room.room_number} marked as maintenance`,
        }}),
      }).catch(() => {})
    }
    toast(`${room.room_number} marked as ${status}`)
    await loadHouses()
    setSelectedHouseId((room as any).house_id)
  }

  // ── Summary stats ─────────────────────────────────────────────
  const stats = [
    { label: 'Available',   count: houses.filter(h => h.status === 'available').length,   color: '#1A7A4A' },
    { label: 'Occupied',    count: houses.filter(h => h.status === 'occupied').length,    color: '#004AAD' },
    { label: 'Maintenance', count: houses.filter(h => h.status === 'maintenance').length, color: '#B83232' },
    { label: 'Closed',      count: houses.filter(h => h.status === 'closed').length,      color: '#6B7280' },
  ]

  return (
    <>
      <TopBar
        title="Properties"
        subtitle={`Houses & rooms — ${activeBranch?.location ?? ''}`}
      />
      <div className="p-8 flex-1 section-enter">

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-5">
            {stats.map(s => (
              <button
                key={s.label}
                onClick={() => setFilterStatus(filterStatus === s.label.toLowerCase() ? 'all' : s.label.toLowerCase())}
                className={cn(
                  'flex items-center gap-2 text-sm transition-opacity',
                  filterStatus !== 'all' && filterStatus !== s.label.toLowerCase() && 'opacity-40'
                )}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span className="text-hmuted">{s.label}</span>
                <span className="font-semibold text-dark-navy">{s.count}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
            >
              <option value="all">All Houses</option>
              {HOUSE_STATUSES.map(s => <option key={s} value={s}>{capitalize(s)}</option>)}
            </select>
            <Button onClick={openAddHouse}>+ Add House</Button>
          </div>
        </div>

        {/* Houses grid */}
        {loading ? (
          <p className="text-center text-hmuted py-20">Loading properties…</p>
        ) : filteredHouses.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-hmuted mb-4">No houses yet. Add your first property.</p>
            <Button onClick={openAddHouse}>+ Add House</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredHouses.map(house => {
              const c = HOUSE_COLORS[house.status]
              const houseRooms = (house.rooms ?? []) as Room[]
              return (
                <button
                  key={house.id}
                  onClick={() => setSelectedHouseId(house.id)}
                  className={cn(
                    'text-left rounded-2xl p-5 border-2 transition-all hover:-translate-y-0.5 hover:shadow-lg cursor-pointer',
                    c.bg, c.border
                  )}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-dark-navy text-[15px] leading-snug">{house.name}</h3>
                      <p className="text-xs text-hmuted mt-0.5">
                        {capitalize(house.house_type)} · {house.capacity} pax max · {formatCurrency(house.base_rate_per_night)}/night
                      </p>
                    </div>
                    <span className={cn('flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full capitalize', c.badge)}>
                      {house.status}
                    </span>
                  </div>

                  {/* Amenities preview */}
                  {house.amenities?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {house.amenities.slice(0, 4).map(a => (
                        <span key={a} className="text-[10px] bg-white/70 text-hmuted px-1.5 py-0.5 rounded-md">{a}</span>
                      ))}
                      {house.amenities.length > 4 && (
                        <span className="text-[10px] text-hmuted px-1">+{house.amenities.length - 4} more</span>
                      )}
                    </div>
                  )}

                  {/* Room status dots */}
                  {houseRooms.length > 0 ? (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[10px] text-hmuted mr-0.5">{houseRooms.length} room{houseRooms.length !== 1 ? 's' : ''}:</span>
                      {houseRooms.map(r => (
                        <span
                          key={r.id}
                          className={cn('w-2 h-2 rounded-full flex-shrink-0', ROOM_DOT[r.status])}
                          title={`${r.room_number} — ${r.status}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-hmuted/60 mt-2">No rooms set up</p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── House Detail Modal ── */}
      <Modal
        open={!!selectedHouse}
        onClose={() => setSelectedHouseId(null)}
        title={selectedHouse?.name ?? ''}
        subtitle={selectedHouse ? `${capitalize(selectedHouse.house_type)} · ${selectedHouse.capacity} pax max` : ''}
        size="lg"
      >
        {selectedHouse && (() => {
          const c = HOUSE_COLORS[selectedHouse.status]
          const houseRooms = (selectedHouse.rooms ?? []) as Room[]
          return (
            <div className="space-y-5">
              {/* Status + quick stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-hsurface2 rounded-xl p-3 text-center">
                  <p className="text-xs text-hmuted mb-1">Status</p>
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full capitalize', c.badge)}>
                    {selectedHouse.status}
                  </span>
                </div>
                <div className="bg-hsurface2 rounded-xl p-3 text-center">
                  <p className="text-xs text-hmuted mb-1">Capacity</p>
                  <p className="font-semibold text-dark-navy">{selectedHouse.capacity} pax</p>
                </div>
                <div className="bg-hsurface2 rounded-xl p-3 text-center">
                  <p className="text-xs text-hmuted mb-1">Base Rate</p>
                  <p className="font-semibold text-dark-navy">{formatCurrency(selectedHouse.base_rate_per_night)}/night</p>
                </div>
              </div>

              {/* Amenities */}
              {selectedHouse.amenities?.length > 0 && (
                <div>
                  <p className="text-xs text-hmuted mb-2">Amenities</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedHouse.amenities.map(a => (
                      <span key={a} className="bg-hsurface2 text-hmuted text-xs px-2 py-0.5 rounded-md">{a}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedHouse.description && (
                <p className="text-sm text-hmuted">{selectedHouse.description}</p>
              )}

              {/* Rooms */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">
                    Rooms ({houseRooms.length})
                  </p>
                  <button
                    onClick={() => openAddRoom(selectedHouse.id)}
                    className="text-xs text-navy hover:underline font-medium"
                  >
                    + Add Room
                  </button>
                </div>
                {houseRooms.length === 0 ? (
                  <p className="text-xs text-hmuted py-3 text-center border border-dashed border-hborder rounded-xl">
                    No rooms yet — add bedrooms or spaces inside this house
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {houseRooms.map(room => (
                      <div key={room.id} className="flex items-center gap-3 bg-hsurface2 rounded-lg px-3 py-2.5">
                        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', ROOM_DOT[room.status])} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-htext">{room.room_number}</p>
                          <p className="text-xs text-hmuted capitalize">
                            {room.room_type}
                            {room.max_adults || room.max_children ? ` · ${room.max_adults + room.max_children} guests max` : ''}
                          </p>
                        </div>
                        <select
                          value={room.status}
                          onChange={e => changeRoomStatus(room, e.target.value as RoomStatus)}
                          className="text-xs border border-hborder rounded-md px-2 py-1 bg-white focus:outline-none focus:border-navy"
                          onClick={e => e.stopPropagation()}
                        >
                          {ROOM_STATUSES.map(s => <option key={s} value={s}>{capitalize(s)}</option>)}
                        </select>
                        <button
                          onClick={() => openEditRoom({ ...room, house_id: selectedHouse.id } as any)}
                          className="text-xs text-navy hover:underline flex-shrink-0"
                        >Edit</button>
                        <button
                          onClick={() => deleteRoom({ ...room, house_id: selectedHouse.id } as any)}
                          className="text-xs text-red-500 hover:underline flex-shrink-0"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming reservations */}
              {houseBookings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-hmuted uppercase tracking-wide mb-2">Upcoming Reservations</p>
                  <div className="space-y-1.5">
                    {houseBookings.map(b => {
                      const pax = b.pax_count ?? b.adults
                      return (
                        <div key={b.reservation_number} className="flex items-center justify-between bg-hsurface2 rounded-lg px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-htext">{(b.guest as any)?.full_name ?? 'Guest'}</p>
                            <p className="text-xs text-hmuted">
                              {formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}
                              {b.arrival_time ? ` · ${b.arrival_time}` : ''}
                              {pax ? ` · ${pax} pax` : ''}
                            </p>
                          </div>
                          <Badge status={b.status} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Change house status */}
              <div>
                <p className="text-xs font-semibold text-hmuted uppercase tracking-wide mb-2">Change Status</p>
                <div className="flex flex-wrap gap-2">
                  {HOUSE_STATUSES.filter(s => s !== selectedHouse.status).map(s => (
                    <Button key={s} size="sm" variant="ghost" onClick={() => changeHouseStatus(selectedHouse, s)}>
                      {capitalize(s)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Footer actions */}
              <div className="flex gap-2 pt-2 border-t border-hborder">
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => openEditHouse(selectedHouse)}>
                  Edit House
                </Button>
                <Button variant="danger" size="sm" className="flex-1" onClick={() => deleteHouse(selectedHouse.id)}>
                  Delete House
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ── Add / Edit House Modal ── */}
      <Modal
        open={houseFormOpen}
        onClose={() => setHouseFormOpen(false)}
        title={editHouseId ? 'Edit House' : 'Add New House'}
        size="md"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-hmuted mb-1">House Name *</label>
            <input
              value={houseForm.name}
              onChange={e => setHouseForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. OnlyOne Home Stay, Riverside Villa"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">House Type</label>
              <select
                value={houseForm.house_type}
                onChange={e => setHouseForm(f => ({ ...f, house_type: e.target.value as HouseType }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {HOUSE_TYPES.map(t => <option key={t} value={t}>{capitalize(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Max Pax Capacity</label>
              <input
                type="number" min={1}
                value={houseForm.capacity}
                onChange={e => setHouseForm(f => ({ ...f, capacity: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-hmuted mb-1">Base Rate / Night ($)</label>
              <input
                type="number" min={0} step={0.01}
                value={houseForm.base_rate_per_night}
                onChange={e => setHouseForm(f => ({ ...f, base_rate_per_night: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Amenities (comma-separated)</label>
            <input
              value={houseForm.amenities}
              onChange={e => setHouseForm(f => ({ ...f, amenities: e.target.value }))}
              placeholder="WiFi, Pool, BBQ, Kayak, AC"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Description</label>
            <textarea
              value={houseForm.description}
              onChange={e => setHouseForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setHouseFormOpen(false)}>Cancel</Button>
            <Button onClick={saveHouse} disabled={houseSaving}>
              {houseSaving ? 'Saving…' : editHouseId ? 'Update House' : 'Add House'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Add / Edit Room Modal ── */}
      <Modal
        open={roomFormOpen}
        onClose={() => setRoomFormOpen(false)}
        title={editRoomId ? 'Edit Room' : 'Add Room'}
        subtitle={
          roomFormHouseId
            ? `Inside: ${houses.find(h => h.id === roomFormHouseId)?.name ?? ''}`
            : undefined
        }
        size="md"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Room Name *</label>
              <input
                value={roomForm.room_number}
                onChange={e => setRoomForm(f => ({ ...f, room_number: e.target.value }))}
                placeholder="e.g. Master Bedroom, Room 1"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Room Type</label>
              <input
                value={roomForm.room_type}
                onChange={e => setRoomForm(f => ({ ...f, room_type: e.target.value }))}
                placeholder="e.g. bedroom, bathroom, living"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Max Adults</label>
              <input
                type="number" min={0}
                value={roomForm.max_adults}
                onChange={e => setRoomForm(f => ({ ...f, max_adults: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Max Children</label>
              <input
                type="number" min={0}
                value={roomForm.max_children}
                onChange={e => setRoomForm(f => ({ ...f, max_children: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Amenities (comma-separated)</label>
            <input
              value={roomForm.amenities}
              onChange={e => setRoomForm(f => ({ ...f, amenities: e.target.value }))}
              placeholder="AC, En-suite bathroom, King bed"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Notes</label>
            <textarea
              value={roomForm.description}
              onChange={e => setRoomForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setRoomFormOpen(false)}>Cancel</Button>
            <Button onClick={saveRoom} disabled={roomSaving}>
              {roomSaving ? 'Saving…' : editRoomId ? 'Update Room' : 'Add Room'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
