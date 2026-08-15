'use client'
import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { toast } from './Toast'
import type { House } from '@/types'

const ID_TYPES = ['Passport', 'National ID', "Driver's License", 'Other']

export interface CheckInForm {
  id_type: string
  id_number: string
  id_expiry: string
  nationality: string
  vehicle_plate: string
  notes: string
  // Walk-in only
  guest_name?: string
  guest_phone?: string
  guest_email?: string
  house_id?: string
  check_out_date?: string
  adults?: number
  children?: number
}

// ── Reservation check-in props ──────────────────────────────────────────────
interface ReservationProps {
  mode: 'reservation'
  guestName: string
  reservationNumber: string
  houseName: string
  checkInDate: string
  checkOutDate: string
  nights: number
  totalAmount: number
  currency?: string
  defaultIdType?: string
  defaultIdNumber?: string
  defaultNationality?: string
}

// ── Walk-in props ───────────────────────────────────────────────────────────
interface WalkInProps {
  mode: 'walkin'
  availableHouses: House[]
  currency?: string
}

type ModeProps = ReservationProps | WalkInProps

type Props = ModeProps & {
  open: boolean
  onConfirm: (form: CheckInForm) => Promise<void>
  onClose: () => void
}

export function CheckInModal(props: Props) {
  const { open, onConfirm, onClose } = props
  const currency = props.currency ?? 'USD'

  const [form, setForm] = useState<CheckInForm>({
    id_type: (props.mode === 'reservation' ? props.defaultIdType : '') || 'Passport',
    id_number: (props.mode === 'reservation' ? props.defaultIdNumber : '') || '',
    id_expiry: '',
    nationality: (props.mode === 'reservation' ? props.defaultNationality : '') || '',
    vehicle_plate: '',
    notes: '',
    // Walk-in defaults
    guest_name: '',
    guest_phone: '',
    guest_email: '',
    house_id: '',
    check_out_date: '',
    adults: 1,
    children: 0,
  })
  const [saving, setSaving] = useState(false)

  function set(field: keyof CheckInForm, value: string | number) {
    setForm(f => ({ ...f, [field]: value }))
  }

  // Derived walk-in rate preview
  const selectedHouse = props.mode === 'walkin'
    ? props.availableHouses.find(h => h.id === form.house_id)
    : null
  const walkInNights = props.mode === 'walkin' && form.check_out_date
    ? Math.max(0, Math.round((new Date(form.check_out_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000))
    : 0
  const walkInTotal = selectedHouse ? selectedHouse.base_rate_per_night * walkInNights : 0
  const today = new Date().toISOString().split('T')[0]

  async function handleConfirm() {
    if (!form.id_number.trim()) {
      toast('ID Number is required to complete check-in.', 'error')
      return
    }
    if (props.mode === 'walkin') {
      if (!form.guest_name?.trim()) { toast('Guest name is required.', 'error'); return }
      if (!form.house_id) { toast('Please select a house.', 'error'); return }
      if (!form.check_out_date) { toast('Check-out date is required.', 'error'); return }
    }
    setSaving(true)
    try {
      await onConfirm(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={props.mode === 'walkin' ? 'Walk-in Check-in' : 'Check-In Guest'}
      subtitle={props.mode === 'walkin' ? 'Register and check in a guest immediately' : undefined}
      size="md"
    >
      <div className="space-y-4">

        {/* ── RESERVATION MODE: summary banner ─────────────────────────── */}
        {props.mode === 'reservation' && (
          <div className="bg-hsurface2 rounded-xl px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-hmuted">Guest</span>
              <span className="font-semibold text-htext">{props.guestName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hmuted">Property</span>
              <span className="font-semibold text-htext">{props.houseName || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hmuted">Check-in</span>
              <span className="font-medium text-htext">{props.checkInDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hmuted">Check-out</span>
              <span className="font-medium text-htext">{props.checkOutDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hmuted">Nights</span>
              <span className="font-medium text-htext">{props.nights}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hmuted">Total</span>
              <span className="font-semibold text-dark-navy">
                {currency} {Number(props.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* ── WALK-IN MODE: guest + house fields ───────────────────────── */}
        {props.mode === 'walkin' && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Guest Details *</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs text-hmuted mb-1">Full Name *</label>
                <input
                  value={form.guest_name}
                  onChange={e => set('guest_name', e.target.value)}
                  placeholder="Full name"
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Phone</label>
                <input
                  value={form.guest_phone}
                  onChange={e => set('guest_phone', e.target.value)}
                  placeholder="+855 12 345 678"
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Email</label>
                <input
                  type="email"
                  value={form.guest_email}
                  onChange={e => set('guest_email', e.target.value)}
                  placeholder="email@example.com"
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">House *</label>
                <select
                  value={form.house_id}
                  onChange={e => set('house_id', e.target.value)}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                >
                  <option value="">Select available house…</option>
                  {props.availableHouses.map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Check-out Date *</label>
                <input
                  type="date"
                  min={today}
                  value={form.check_out_date}
                  onChange={e => set('check_out_date', e.target.value)}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Adults</label>
                <input
                  type="number" min={1}
                  value={form.adults}
                  onChange={e => set('adults', Number(e.target.value))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Children</label>
                <input
                  type="number" min={0}
                  value={form.children}
                  onChange={e => set('children', Number(e.target.value))}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
            </div>

            {/* Rate preview */}
            {selectedHouse && walkInNights > 0 && (
              <div className="bg-hsurface2 rounded-xl px-4 py-2.5 flex justify-between text-sm">
                <span className="text-hmuted">{selectedHouse.name} — {walkInNights} night{walkInNights !== 1 ? 's' : ''} × {currency} {selectedHouse.base_rate_per_night.toLocaleString()}</span>
                <span className="font-semibold text-dark-navy">{currency} {walkInTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        )}

        {/* ── ID VERIFICATION (both modes) ─────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-hmuted uppercase tracking-wide mb-2">ID Verification *</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">ID Type</label>
              <select
                value={form.id_type}
                onChange={e => set('id_type', e.target.value)}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {ID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">ID Number *</label>
              <input
                value={form.id_number}
                onChange={e => set('id_number', e.target.value)}
                placeholder="e.g. A1234567"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">ID Expiry</label>
              <input
                type="date"
                value={form.id_expiry}
                onChange={e => set('id_expiry', e.target.value)}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Nationality</label>
              <input
                value={form.nationality}
                onChange={e => set('nationality', e.target.value)}
                placeholder="e.g. Cambodian"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>
        </div>

        {/* ── Vehicle & Notes (both modes) ─────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-hmuted mb-1">Vehicle Plate</label>
            <input
              value={form.vehicle_plate}
              onChange={e => set('vehicle_plate', e.target.value)}
              placeholder="Optional"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Notes</label>
            <input
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Special requests…"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
        </div>

        {/* Revenue notice */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
          Revenue will be recognized upon check-in: <strong>DR Accounts Receivable / CR House Rental Revenue</strong>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? 'Processing…' : 'Confirm Check-In'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
