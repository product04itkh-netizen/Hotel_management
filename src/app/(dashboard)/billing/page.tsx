'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatCurrency, generateInvoiceNumber, calculateNights, capitalize } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import type { Invoice, Reservation, InvoiceItem } from '@/types'

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'qr', 'online']

export default function BillingPage() {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [saving, setSaving] = useState(false)
  const [taxRate, setTaxRate] = useState(10)
  const [form, setForm] = useState({
    reservation_id: '',
    items: [{ description: 'Room charge', quantity: 1, unit_price: 0, total: 0 }] as InvoiceItem[],
    discount_amount: 0,
    notes: '',
  })
  const [payForm, setPayForm] = useState({ payment_method: 'cash', amount_paid: 0 })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [invRes, resRes, settingsRes] = await Promise.all([
      supabase.from('invoices')
        .select('*, reservation:reservations(reservation_number, check_in_date, check_out_date), guest:guests(full_name, phone)')
        .order('created_at', { ascending: false }),
      supabase.from('reservations')
        .select('*, guest:guests(full_name)')
        .in('status', ['checked_in', 'checked_out'])
        .order('created_at', { ascending: false }),
      supabase.from('hotel_settings').select('tax_rate').single(),
    ])
    setInvoices((invRes.data ?? []) as unknown as Invoice[])
    setReservations((resRes.data ?? []) as unknown as Reservation[])
    if (settingsRes.data?.tax_rate) setTaxRate(Number(settingsRes.data.tax_rate))
    setLoading(false)
  }

  function updateItem(idx: number, field: keyof InvoiceItem, value: string | number) {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [field]: value }
      items[idx].total = Number(items[idx].quantity) * Number(items[idx].unit_price)
      return { ...f, items }
    })
  }

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { description: '', quantity: 1, unit_price: 0, total: 0 }] }))
  }

  function removeItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  const subtotal = form.items.reduce((s, i) => s + Number(i.total), 0)
  const taxAmount = (subtotal - Number(form.discount_amount)) * (taxRate / 100)
  const total = subtotal - Number(form.discount_amount) + taxAmount

  async function openCreateInvoice(reservation?: Reservation) {
    let initialItems: InvoiceItem[] = [{ description: 'Room charge', quantity: 1, unit_price: 0, total: 0 }]
    if (reservation?.room_id && reservation.total_amount) {
      const nights = calculateNights(reservation.check_in_date, reservation.check_out_date)
      const pricePerNight = reservation.total_amount / (nights || 1)
      initialItems = [{ description: `Room charge (${nights} night${nights > 1 ? 's' : ''})`, quantity: nights, unit_price: pricePerNight, total: reservation.total_amount }]
    }
    setForm({ reservation_id: reservation?.id ?? '', items: initialItems, discount_amount: 0, notes: '' })
    setInvoiceOpen(true)
  }

  async function handleCreate() {
    setSaving(true)
    const res = reservations.find(r => r.id === form.reservation_id)
    const guestId = res?.guest_id ?? null

    const { data: inv, error } = await supabase.from('invoices').insert({
      invoice_number: generateInvoiceNumber(),
      reservation_id: form.reservation_id || null,
      guest_id: guestId,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount_amount: Number(form.discount_amount),
      total,
      amount_paid: 0,
      status: 'unpaid',
      items: form.items,
      notes: form.notes || null,
    }).select().single()

    if (error) { toast(error.message, 'error'); setSaving(false); return }
    toast('Invoice created')
    setSaving(false)
    setInvoiceOpen(false)
    loadData()
  }

  function openPayment(invoice: Invoice) {
    setSelectedInvoice(invoice)
    setPayForm({ payment_method: 'cash', amount_paid: invoice.total - invoice.amount_paid })
    setPayOpen(true)
  }

  async function handlePayment() {
    if (!selectedInvoice) return
    setSaving(true)
    const newPaid = Number(selectedInvoice.amount_paid) + Number(payForm.amount_paid)
    const newStatus = newPaid >= Number(selectedInvoice.total) ? 'paid' : 'partial'
    const { error } = await supabase.from('invoices').update({
      amount_paid: newPaid,
      status: newStatus,
      payment_method: payForm.payment_method,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : selectedInvoice.paid_at,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedInvoice.id)

    if (error) { toast(error.message, 'error'); setSaving(false); return }

    if (newStatus === 'paid') {
      fetch('/api/telegram/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'payment', data: {
          guest_name: (selectedInvoice.guest as any)?.full_name ?? 'Guest',
          amount: formatCurrency(selectedInvoice.total),
          method: capitalize(payForm.payment_method),
          invoice_number: selectedInvoice.invoice_number,
        }})
      }).catch(() => {})
    }
    toast(newStatus === 'paid' ? 'Invoice fully paid' : 'Partial payment recorded')
    setSaving(false)
    setPayOpen(false)
    setSelectedInvoice(null)
    loadData()
  }

  const filtered = invoices.filter(i => statusFilter === 'all' || i.status === statusFilter)
  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total), 0)
  const unpaidTotal = invoices.filter(i => i.status === 'unpaid').reduce((s, i) => s + Number(i.total), 0)

  return (
    <>
      <TopBar title="Billing & Payments" subtitle="Invoices & transactions" />
      <div className="p-8 flex-1 section-enter">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Revenue', value: formatCurrency(totalRevenue), color: '#1A7A4A' },
            { label: 'Outstanding', value: formatCurrency(unpaidTotal), color: '#B83232' },
            { label: 'Total Invoices', value: invoices.length, color: '#004AAD' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-hborder rounded-2xl p-4 shadow-card relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: s.color }} />
              <p className="text-xs text-hmuted uppercase tracking-wide pl-2">{s.label}</p>
              <p className="font-serif text-2xl text-dark-navy mt-1 pl-2">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
          >
            {['all','unpaid','partial','paid','refunded','void'].map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All Invoices' : capitalize(s)}</option>
            ))}
          </select>
          <Button onClick={() => openCreateInvoice()}>+ New Invoice</Button>
        </div>

        <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hsurface2">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Invoice #</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Guest</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Reservation</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Total</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Paid</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Date</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-hmuted">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-hmuted">No invoices found</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} className="border-t border-hborder hover:bg-hbg/40">
                  <td className="px-5 py-3 font-mono text-xs text-hmuted">{inv.invoice_number}</td>
                  <td className="px-5 py-3 font-medium text-htext">{(inv.guest as any)?.full_name ?? '—'}</td>
                  <td className="px-5 py-3 font-mono text-xs text-hmuted">{(inv.reservation as any)?.reservation_number ?? '—'}</td>
                  <td className="px-5 py-3 font-semibold text-dark-navy">{formatCurrency(inv.total)}</td>
                  <td className="px-5 py-3 text-hmuted">{formatCurrency(inv.amount_paid)}</td>
                  <td className="px-5 py-3"><Badge status={inv.status} /></td>
                  <td className="px-5 py-3 text-xs text-hmuted">{formatDate(inv.created_at)}</td>
                  <td className="px-5 py-3">
                    {!['paid','refunded','void'].includes(inv.status) && (
                      <Button size="sm" onClick={() => openPayment(inv)}>Record Payment</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Invoice Modal */}
      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="Create Invoice" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-hmuted mb-1">Link to Reservation (optional)</label>
            <select
              value={form.reservation_id}
              onChange={e => {
                const res = reservations.find(r => r.id === e.target.value)
                if (res) {
                  openCreateInvoice(res)
                } else {
                  setForm(f => ({ ...f, reservation_id: e.target.value }))
                }
              }}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            >
              <option value="">No reservation</option>
              {reservations.map(r => (
                <option key={r.id} value={r.id}>
                  {(r.guest as any)?.full_name} — {(r as any).reservation_number}
                </option>
              ))}
            </select>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Line Items</p>
              <button onClick={addItem} className="text-xs text-navy hover:underline">+ Add Item</button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    value={item.description}
                    onChange={e => updateItem(idx, 'description', e.target.value)}
                    placeholder="Description"
                    className="col-span-5 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                  <input
                    type="number" min={1}
                    value={item.quantity}
                    onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                    className="col-span-2 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                    placeholder="Qty"
                  />
                  <input
                    type="number" min={0} step={0.01}
                    value={item.unit_price}
                    onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                    className="col-span-3 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                    placeholder="Unit price"
                  />
                  <span className="col-span-1 text-sm font-medium text-right text-dark-navy">{formatCurrency(item.total)}</span>
                  <button onClick={() => removeItem(idx)} className="col-span-1 text-red-400 hover:text-red-600 text-center">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-hborder pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-hmuted">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-hmuted">Discount</span>
              <input
                type="number" min={0}
                value={form.discount_amount}
                onChange={e => setForm(f => ({ ...f, discount_amount: Number(e.target.value) }))}
                className="w-24 border border-hborder rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div className="flex justify-between">
              <span className="text-hmuted">Tax ({taxRate}%)</span>
              <span>{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-dark-navy border-t border-hborder pt-2">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-hmuted mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg resize-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create Invoice'}</Button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal open={payOpen} onClose={() => { setPayOpen(false); setSelectedInvoice(null) }} title="Record Payment" size="sm">
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="bg-hsurface2 rounded-xl p-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-hmuted">Invoice</span><span className="font-mono">{selectedInvoice.invoice_number}</span></div>
              <div className="flex justify-between"><span className="text-hmuted">Total</span><span className="font-bold">{formatCurrency(selectedInvoice.total)}</span></div>
              <div className="flex justify-between"><span className="text-hmuted">Already Paid</span><span>{formatCurrency(selectedInvoice.amount_paid)}</span></div>
              <div className="flex justify-between border-t border-hborder pt-1"><span className="text-hmuted">Remaining</span><span className="font-bold text-red-600">{formatCurrency(selectedInvoice.total - selectedInvoice.amount_paid)}</span></div>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Payment Method</label>
              <select
                value={payForm.payment_method}
                onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{capitalize(m.replace('_', ' '))}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Amount Received</label>
              <input
                type="number" min={0} step={0.01}
                value={payForm.amount_paid}
                onChange={e => setPayForm(f => ({ ...f, amount_paid: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => { setPayOpen(false); setSelectedInvoice(null) }}>Cancel</Button>
              <Button onClick={handlePayment} disabled={saving}>{saving ? 'Recording…' : 'Record Payment'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
