'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, formatCurrency,
  generateJournalEntryNumber, calculateNights, capitalize,
} from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import type { Invoice, Reservation, InvoiceItem } from '@/types'

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'qr', 'online']
// cash → 1010, everything else → 1020
const CASH_ACCOUNT_CODE: Record<string, string> = {
  cash: '1010', card: '1020', bank_transfer: '1020', qr: '1020', online: '1020',
}

export default function BillingPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [saving, setSaving] = useState(false)
  const [taxRate, setTaxRate] = useState(0)
  const [form, setForm] = useState({
    reservation_id: '',
    items: [{ description: 'House charge', quantity: 1, unit_price: 0, total: 0 }] as InvoiceItem[],
    discount_amount: 0,
    notes: '',
  })
  const [payForm, setPayForm] = useState({ payment_method: 'cash', amount_paid: 0, notes: '' })

  useEffect(() => { if (activeBranch) loadData() }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    if (!activeBranch) return
    const [invRes, resRes, settingsRes] = await Promise.all([
      supabase.from('invoices')
        .select('*, reservation:reservations(reservation_number, check_in_date, check_out_date), guest:guests(full_name, phone), house:houses(name)')
        .eq('branch_id', activeBranch.id)
        .order('created_at', { ascending: false }),
      supabase.from('reservations')
        .select('*, guest:guests(full_name), house:houses(name, base_rate_per_night), line_items:reservation_line_items(id, label, amount, sort_order)')
        .eq('branch_id', activeBranch.id)
        .in('status', ['confirmed', 'checked_in', 'checked_out'])
        .order('created_at', { ascending: false }),
      supabase.from('hotel_settings').select('tax_rate').eq('branch_id', activeBranch.id).single(),
    ])
    setInvoices((invRes.data ?? []) as unknown as Invoice[])
    setReservations((resRes.data ?? []) as unknown as Reservation[])
    if (settingsRes.data?.tax_rate != null) setTaxRate(Number(settingsRes.data.tax_rate))
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

  function openCreateInvoice(reservation?: Reservation) {
    if (reservation) {
      const house = (reservation as any).house
      const lineItems: any[] = ((reservation as any).line_items ?? [])
      const nights = calculateNights(reservation.check_in_date, reservation.check_out_date)
      const deposit = Number((reservation as any).deposit ?? 0)
      const totalAmount = Number(reservation.total_amount ?? 0)

      const items: InvoiceItem[] = []

      if (house && nights > 0) {
        // Best case: house rate × nights
        items.push({
          description: `House rental — ${house.name} (${nights} night${nights !== 1 ? 's' : ''})`,
          quantity: nights,
          unit_price: Number(house.base_rate_per_night),
          total: nights * Number(house.base_rate_per_night),
        })
      } else if (nights > 0 && totalAmount > 0) {
        // Fallback: reservation has a total_amount but no house rate — spread per night
        const perNight = Math.round((totalAmount / nights) * 100) / 100
        items.push({
          description: `House rental (${nights} night${nights !== 1 ? 's' : ''})`,
          quantity: nights,
          unit_price: perNight,
          total: totalAmount,
        })
      } else if (nights > 0) {
        // No rate data at all — at least show the correct nights count
        items.push({
          description: `House rental (${nights} night${nights !== 1 ? 's' : ''})`,
          quantity: nights,
          unit_price: 0,
          total: 0,
        })
      }

      // Add each reservation add-on line item
      const sorted = [...lineItems].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      sorted.forEach(item => {
        if (item.label) {
          items.push({ description: item.label, quantity: 1, unit_price: Number(item.amount), total: Number(item.amount) })
        }
      })

      if (items.length === 0) {
        items.push({ description: 'House charge', quantity: 1, unit_price: 0, total: 0 })
      }

      const noteParts: string[] = []
      if (deposit > 0) noteParts.push(`Deposit received: ${formatCurrency(deposit)}`)
      if ((reservation as any).arrival_time) noteParts.push(`Arrival: ${(reservation as any).arrival_time}`)
      if ((reservation as any).pax_count) noteParts.push(`Pax: ${(reservation as any).pax_count}`)

      setForm({
        reservation_id: reservation.id,
        items,
        discount_amount: 0,
        notes: noteParts.join(' · '),
      })
    } else {
      setForm({
        reservation_id: '',
        items: [{ description: 'House charge', quantity: 1, unit_price: 0, total: 0 }],
        discount_amount: 0, notes: '',
      })
    }
    setInvoiceOpen(true)
  }

  async function generateInvoiceNumber(): Promise<string> {
    const now = new Date()
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const prefix = `INV-${yyyymm}-`
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('branch_id', activeBranch!.id)
      .like('invoice_number', `${prefix}%`)
      .order('invoice_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    let seq = 1
    if (data?.invoice_number) {
      const lastNum = parseInt((data.invoice_number as string).slice(prefix.length), 10)
      if (!isNaN(lastNum)) seq = lastNum + 1
    }
    return `${prefix}${String(seq).padStart(3, '0')}`
  }

  async function handleCreate() {
    setSaving(true)
    const selectedRes = reservations.find(r => r.id === form.reservation_id) ?? null
    const guestId = selectedRes?.guest_id ?? null
    const deposit = Number((selectedRes as any)?.deposit ?? 0)

    // Determine initial payment status from deposit
    const initialPaid = deposit > 0 ? Math.min(deposit, total) : 0
    const initialStatus = initialPaid >= total && total > 0 ? 'paid' : initialPaid > 0 ? 'partial' : 'unpaid'

    const { data: inv, error } = await supabase.from('invoices').insert({
      invoice_number: await generateInvoiceNumber(),
      reservation_id: form.reservation_id || null,
      guest_id: guestId,
      house_id: (selectedRes as any)?.house_id ?? null,
      branch_id: activeBranch?.id ?? null,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount_amount: Number(form.discount_amount),
      total,
      amount_paid: initialPaid,
      status: initialStatus,
      payment_method: initialPaid > 0 ? 'cash' : null,
      paid_at: initialStatus === 'paid' ? new Date().toISOString() : null,
      items: form.items,
      notes: form.notes || null,
    }).select().single()

    if (error) { toast(error.message, 'error'); setSaving(false); return }

    // If deposit pre-paid, record it as a payment_transaction
    if (inv && initialPaid > 0) {
      await supabase.from('payment_transactions').insert({
        invoice_id: inv.id,
        amount: initialPaid,
        payment_method: 'cash',
        payment_date: new Date().toISOString(),
        notes: 'Deposit recorded at invoice creation',
        branch_id: activeBranch?.id ?? null,
      })
    }

    toast('Invoice created')
    setSaving(false)
    setInvoiceOpen(false)
    loadData()
  }

  function openPayment(invoice: Invoice) {
    setSelectedInvoice(invoice)
    setPayForm({
      payment_method: 'cash',
      amount_paid: Number(invoice.total) - Number(invoice.amount_paid),
      notes: '',
    })
    setPayOpen(true)
  }

  async function handlePayment() {
    if (!selectedInvoice || !activeBranch) return
    setSaving(true)
    const amountReceived = Number(payForm.amount_paid)
    const newPaid = Number(selectedInvoice.amount_paid) + amountReceived
    const newStatus = newPaid >= Number(selectedInvoice.total) ? 'paid' : 'partial'

    const { error } = await supabase.from('invoices').update({
      amount_paid: newPaid,
      status: newStatus,
      payment_method: payForm.payment_method,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : selectedInvoice.paid_at,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedInvoice.id)

    if (error) { toast(error.message, 'error'); setSaving(false); return }

    // ── Auto journal entry: DR Cash → CR Revenue ──────────────
    let jeId: string | null = null
    try {
      // Find cash account and revenue account for this branch
      const { data: accounts } = await supabase.from('chart_of_accounts')
        .select('id, code')
        .eq('branch_id', activeBranch.id)
        .in('code', [CASH_ACCOUNT_CODE[payForm.payment_method] ?? '1020', '4100'])

      const cashAcct = accounts?.find(a => a.code === (CASH_ACCOUNT_CODE[payForm.payment_method] ?? '1020'))
      const revenueAcct = accounts?.find(a => a.code === '4100')

      if (cashAcct && revenueAcct) {
        const { data: je } = await supabase.from('journal_entries').insert({
          entry_number: generateJournalEntryNumber(),
          entry_date: new Date().toISOString().split('T')[0],
          reference: selectedInvoice.invoice_number,
          reference_type: 'invoice',
          description: `Payment received — ${selectedInvoice.invoice_number} (${(selectedInvoice.guest as any)?.full_name ?? 'Guest'})`,
          branch_id: activeBranch.id,
        }).select().single()

        if (je) {
          jeId = je.id
          await supabase.from('journal_entry_lines').insert([
            { entry_id: je.id, account_id: cashAcct.id, description: `${capitalize(payForm.payment_method.replace('_', ' '))} received`, debit: amountReceived, credit: 0 },
            { entry_id: je.id, account_id: revenueAcct.id, description: selectedInvoice.invoice_number, debit: 0, credit: amountReceived },
          ])
        }
      }
    } catch { /* COA not set up yet — skip JE silently */ }

    // Record payment transaction
    await supabase.from('payment_transactions').insert({
      invoice_id: selectedInvoice.id,
      amount: amountReceived,
      payment_method: payForm.payment_method,
      payment_date: new Date().toISOString(),
      notes: payForm.notes || null,
      journal_entry_id: jeId,
      branch_id: activeBranch.id,
    })

    if (newStatus === 'paid') {
      fetch('/api/telegram/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'payment', branch_id: activeBranch?.id, data: {
          guest_name: (selectedInvoice.guest as any)?.full_name ?? 'Guest',
          amount: formatCurrency(selectedInvoice.total),
          method: capitalize(payForm.payment_method),
          invoice_number: selectedInvoice.invoice_number,
        }}),
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
  const unpaidTotal = invoices.filter(i => ['unpaid', 'partial'].includes(i.status)).reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0)
  const partialCount = invoices.filter(i => i.status === 'partial').length

  return (
    <>
      <TopBar title="Billing & Payments" subtitle={`Invoices & transactions — ${activeBranch?.location ?? ''}`} />
      <div className="p-8 flex-1 section-enter">

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Revenue Collected', value: formatCurrency(totalRevenue), color: '#1A7A4A' },
            { label: 'Outstanding Balance', value: formatCurrency(unpaidTotal), color: '#B83232' },
            { label: 'Partial Payments', value: partialCount, color: '#C89B3C' },
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
                {['Invoice #', 'Guest', 'House', 'Subtotal', 'Tax', 'Total', 'Paid', 'Balance', 'Status', 'Date Issued', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="px-5 py-10 text-center text-hmuted">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="px-5 py-10 text-center text-hmuted">No invoices found</td></tr>
              ) : filtered.map(inv => {
                const balance = Number(inv.total) - Number(inv.amount_paid)
                return (
                  <tr key={inv.id} className="border-t border-hborder hover:bg-hbg/40">
                    <td className="px-4 py-3 font-mono text-xs text-hmuted whitespace-nowrap">{inv.invoice_number}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-htext">{(inv.guest as any)?.full_name ?? '—'}</p>
                      <p className="text-xs text-hmuted">{(inv.guest as any)?.phone ?? ''}</p>
                    </td>
                    <td className="px-4 py-3 text-hmuted text-xs">{(inv as any).house?.name ?? (inv.reservation as any)?.reservation_number ?? '—'}</td>
                    <td className="px-4 py-3 text-hmuted">{formatCurrency(inv.subtotal)}</td>
                    <td className="px-4 py-3 text-hmuted">{formatCurrency(inv.tax_amount ?? 0)}</td>
                    <td className="px-4 py-3 font-semibold text-dark-navy whitespace-nowrap">{formatCurrency(inv.total)}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{formatCurrency(inv.amount_paid)}</td>
                    <td className="px-4 py-3">
                      {balance > 0
                        ? <span className="text-red-600 font-semibold">{formatCurrency(balance)}</span>
                        : <span className="text-green-600">—</span>}
                    </td>
                    <td className="px-4 py-3"><Badge status={inv.status} /></td>
                    <td className="px-4 py-3 text-xs text-hmuted whitespace-nowrap">{formatDate(inv.invoice_date ?? inv.created_at)}</td>
                    <td className="px-4 py-3">
                      {!['paid', 'refunded', 'void'].includes(inv.status) && (
                        <Button size="sm" onClick={() => openPayment(inv)}>Record Payment</Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create Invoice Modal ── */}
      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="Create Invoice" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-hmuted mb-1">Link to Reservation (optional)</label>
            <select
              value={form.reservation_id}
              onChange={e => {
                const res = reservations.find(r => r.id === e.target.value)
                if (res) openCreateInvoice(res)
                else setForm(f => ({ ...f, reservation_id: e.target.value }))
              }}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            >
              <option value="">— No reservation —</option>
              {reservations.map(r => (
                <option key={r.id} value={r.id}>
                  {(r.guest as any)?.full_name ?? 'Guest'} — {(r as any).reservation_number} · {(r as any).house?.name ?? 'No house linked'}
                </option>
              ))}
            </select>
          </div>

          {/* Reservation info banner */}
          {form.reservation_id && (() => {
            const res = reservations.find(r => r.id === form.reservation_id)
            if (!res) return null
            const house = (res as any).house
            const nights = calculateNights(res.check_in_date, res.check_out_date)
            return (
              <div className="bg-hsurface2 rounded-xl px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-hmuted">Guest</span>
                  <span className="font-medium text-htext">{(res.guest as any)?.full_name ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hmuted">House</span>
                  <span className="font-medium text-htext">{house?.name ?? <span className="text-orange-500">Not linked</span>}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hmuted">Check-in</span>
                  <span className="font-medium text-htext">{formatDate(res.check_in_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hmuted">Check-out</span>
                  <span className="font-medium text-htext">{formatDate(res.check_out_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hmuted">Nights</span>
                  <span className="font-medium text-htext">{nights}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hmuted">Pax</span>
                  <span className="font-medium text-htext">{(res as any).pax_count ?? (res.adults ?? 0) + (res.children ?? 0)}</span>
                </div>
                {(res as any).deposit > 0 && (
                  <div className="col-span-2 flex justify-between border-t border-hborder pt-1.5 mt-0.5">
                    <span className="text-hmuted">Deposit on file</span>
                    <span className="font-semibold text-green-700">{formatCurrency(Number((res as any).deposit))}</span>
                  </div>
                )}
                {!house && (
                  <div className="col-span-2 text-orange-600 text-[10px] mt-0.5">
                    ⚠ No house linked to this reservation — enter the rate manually or update the reservation.
                  </div>
                )}
              </div>
            )
          })()}

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Line Items</p>
              <button onClick={addItem} className="text-xs text-navy hover:underline font-medium">+ Add Item</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-0.5">
                <span className="col-span-5 text-[10px] text-hmuted uppercase tracking-wide">Description</span>
                <span className="col-span-2 text-[10px] text-hmuted uppercase tracking-wide">Qty</span>
                <span className="col-span-3 text-[10px] text-hmuted uppercase tracking-wide">Unit Price</span>
                <span className="col-span-1 text-[10px] text-hmuted uppercase tracking-wide text-right">Total</span>
              </div>
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
                  />
                  <input
                    type="number" min={0} step={0.01}
                    value={item.unit_price}
                    onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                    className="col-span-3 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                    placeholder="0.00"
                  />
                  <span className="col-span-1 text-sm font-medium text-right text-dark-navy">{formatCurrency(item.total)}</span>
                  <button onClick={() => removeItem(idx)} className="col-span-1 text-red-400 hover:text-red-600 text-center text-lg leading-none">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border border-hborder rounded-xl overflow-hidden">
            <div className="bg-hsurface2 px-4 py-2">
              <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Invoice Summary</p>
            </div>
            <div className="px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-hmuted">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-hmuted">Discount / Credit</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-hmuted text-xs">$</span>
                  <input
                    type="number" min={0}
                    value={form.discount_amount}
                    onChange={e => setForm(f => ({ ...f, discount_amount: Number(e.target.value) }))}
                    className="w-24 border border-hborder rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-navy bg-hbg"
                  />
                </div>
              </div>
              {taxRate > 0 && (
                <div className="flex justify-between">
                  <span className="text-hmuted">Tax ({taxRate}%)</span>
                  <span className="font-medium">{formatCurrency(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-dark-navy border-t border-hborder pt-2 text-[15px]">
                <span>Total Due</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-hmuted mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg resize-none"
              placeholder="Deposit notes, special terms…"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create Invoice'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Payment Modal ── */}
      <Modal
        open={payOpen}
        onClose={() => { setPayOpen(false); setSelectedInvoice(null) }}
        title="Record Payment"
        subtitle="Payment will auto-post a journal entry to the General Ledger"
        size="sm"
      >
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="bg-hsurface2 rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-hmuted">Invoice</span>
                <span className="font-mono text-xs">{selectedInvoice.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-hmuted">Total</span>
                <span className="font-bold">{formatCurrency(selectedInvoice.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-hmuted">Already Paid</span>
                <span className="text-green-700">{formatCurrency(selectedInvoice.amount_paid)}</span>
              </div>
              <div className="flex justify-between border-t border-hborder pt-1.5">
                <span className="text-hmuted">Remaining</span>
                <span className="font-bold text-red-600">{formatCurrency(Number(selectedInvoice.total) - Number(selectedInvoice.amount_paid))}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Payment Method</label>
              <select
                value={payForm.payment_method}
                onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>{capitalize(m.replace('_', ' '))}</option>
                ))}
              </select>
              <p className="text-[10px] text-hmuted mt-1">
                Posts to: {payForm.payment_method === 'cash' ? '1010 Cash on Hand' : '1020 Cash at Bank (ABA)'}
              </p>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Amount Received ($)</label>
              <input
                type="number" min={0} step={0.01}
                value={payForm.amount_paid}
                onChange={e => setPayForm(f => ({ ...f, amount_paid: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Notes (optional)</label>
              <input
                value={payForm.notes}
                onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="ABA ref #, cheque #…"
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
