'use client'
import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

export interface ExtraCharge {
  description: string
  amount: number
  revenue_code: string
}

export interface CheckOutForm {
  condition: 'good' | 'minor_damage' | 'major_damage'
  inspection_notes: string
  extra_charges: ExtraCharge[]
}

interface Props {
  open: boolean
  guestName: string
  reservationNumber: string
  houseName: string
  checkOutDate: string
  onConfirm: (form: CheckOutForm) => Promise<void>
  onClose: () => void
}

const CONDITIONS = [
  { value: 'good',         label: 'Good',         color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'minor_damage', label: 'Minor Damage',  color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'major_damage', label: 'Major Damage',  color: 'bg-red-100 text-red-700 border-red-300' },
] as const

const REVENUE_CODES = [
  { code: '4300', label: 'Other Revenue' },
  { code: '4000', label: 'House Rental Revenue' },
  { code: '4100', label: 'F&B Revenue' },
  { code: '4200', label: 'Activity & Rental' },
]

const emptyCharge = (): ExtraCharge => ({ description: '', amount: 0, revenue_code: '4300' })

export function CheckOutModal({ open, guestName, reservationNumber, houseName, checkOutDate, onConfirm, onClose }: Props) {
  const [form, setForm] = useState<CheckOutForm>({
    condition: 'good',
    inspection_notes: '',
    extra_charges: [],
  })
  const [saving, setSaving] = useState(false)

  function setCondition(c: CheckOutForm['condition']) {
    setForm(f => ({ ...f, condition: c }))
  }

  function addCharge() {
    setForm(f => ({ ...f, extra_charges: [...f.extra_charges, emptyCharge()] }))
  }

  function updateCharge(idx: number, field: keyof ExtraCharge, value: string | number) {
    setForm(f => {
      const charges = [...f.extra_charges]
      charges[idx] = { ...charges[idx], [field]: value }
      return { ...f, extra_charges: charges }
    })
  }

  function removeCharge(idx: number) {
    setForm(f => ({ ...f, extra_charges: f.extra_charges.filter((_, i) => i !== idx) }))
  }

  const totalExtra = form.extra_charges.reduce((s, c) => s + Number(c.amount || 0), 0)

  async function handleConfirm() {
    setSaving(true)
    try {
      await onConfirm({ ...form, extra_charges: form.extra_charges.filter(c => c.description && Number(c.amount) > 0) })
    } finally {
      setSaving(false)
    }
  }

  const conditionStyle = CONDITIONS.find(c => c.value === form.condition)?.color ?? ''

  return (
    <Modal open={open} onClose={onClose} title="Check-Out & Inspection" size="md">
      <div className="space-y-4">

        {/* Summary */}
        <div className="bg-hsurface2 rounded-xl px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-hmuted">Guest</span>
            <span className="font-semibold text-htext">{guestName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-hmuted">Property</span>
            <span className="font-semibold text-htext">{houseName || '—'}</span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="text-hmuted">Reservation</span>
            <span className="font-medium text-htext">{reservationNumber} · Checkout {checkOutDate}</span>
          </div>
        </div>

        {/* Property condition */}
        <div>
          <p className="text-xs font-semibold text-hmuted uppercase tracking-wide mb-2">Property Condition</p>
          <div className="flex gap-2">
            {CONDITIONS.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCondition(c.value)}
                className={`flex-1 py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                  form.condition === c.value ? c.color : 'bg-white border-hborder text-hmuted'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inspection notes */}
        <div>
          <label className="block text-xs text-hmuted mb-1">Inspection Notes</label>
          <textarea
            value={form.inspection_notes}
            onChange={e => setForm(f => ({ ...f, inspection_notes: e.target.value }))}
            rows={2}
            placeholder={form.condition === 'good' ? 'Property left in good condition…' : 'Describe the damage or issues found…'}
            className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg resize-none"
          />
        </div>

        {/* Extra charges */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Extra Charges</p>
            <button type="button" onClick={addCharge} className="text-xs text-navy hover:underline font-medium">+ Add Charge</button>
          </div>

          {form.extra_charges.length === 0 ? (
            <p className="text-xs text-hmuted italic">No extra charges — click "+ Add Charge" to add damage fees or additional costs.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-0.5">
                <span className="col-span-5 text-[10px] text-hmuted uppercase tracking-wide">Description</span>
                <span className="col-span-3 text-[10px] text-hmuted uppercase tracking-wide">Account</span>
                <span className="col-span-3 text-[10px] text-hmuted uppercase tracking-wide">Amount ($)</span>
              </div>
              {form.extra_charges.map((charge, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    value={charge.description}
                    onChange={e => updateCharge(idx, 'description', e.target.value)}
                    placeholder="e.g. Broken window"
                    className="col-span-5 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                  <select
                    value={charge.revenue_code}
                    onChange={e => updateCharge(idx, 'revenue_code', e.target.value)}
                    className="col-span-3 border border-hborder rounded-lg px-1.5 py-1.5 text-xs focus:outline-none focus:border-navy bg-hbg text-hmuted"
                  >
                    {REVENUE_CODES.map(r => (
                      <option key={r.code} value={r.code}>{r.code} {r.label}</option>
                    ))}
                  </select>
                  <input
                    type="number" min={0} step={0.01}
                    value={charge.amount || ''}
                    onChange={e => updateCharge(idx, 'amount', Number(e.target.value))}
                    placeholder="0.00"
                    className="col-span-3 border border-red-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-red-400 bg-red-50 text-red-700"
                  />
                  <button onClick={() => removeCharge(idx)} className="col-span-1 text-red-400 hover:text-red-600 text-center text-lg leading-none">×</button>
                </div>
              ))}
              {totalExtra > 0 && (
                <div className="flex justify-between text-sm font-semibold text-red-700 border-t border-red-100 pt-2 mt-1">
                  <span>Total Extra Charges</span>
                  <span>+ ${totalExtra.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info note */}
        {totalExtra > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            Extra charges will be pre-filled as line items when creating the invoice in Billing.
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={saving} variant={form.condition !== 'good' ? 'danger' : undefined}>
            {saving ? 'Processing…' : 'Confirm Check-Out'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
