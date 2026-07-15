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

interface PaymentMethod {
  id: string
  name: string
  value: string
  is_cash: boolean
  is_active: boolean
  sort_order: number
}

// Fallback static map for receipts/labels on old records
const FALLBACK_METHODS: PaymentMethod[] = [
  { id: '1', name: 'Cash', value: 'cash', is_cash: true, is_active: true, sort_order: 1 },
  { id: '2', name: 'Bank Transfer', value: 'bank_transfer', is_cash: false, is_active: true, sort_order: 2 },
  { id: '3', name: 'ABA Pay', value: 'aba_pay', is_cash: false, is_active: true, sort_order: 3 },
  { id: '4', name: 'Wing', value: 'wing', is_cash: false, is_active: true, sort_order: 4 },
  { id: '5', name: 'Bakong', value: 'bakong', is_cash: false, is_active: true, sort_order: 5 },
  { id: '6', name: 'Online (OTA)', value: 'online', is_cash: false, is_active: true, sort_order: 6 },
  { id: '7', name: 'Other', value: 'other', is_cash: false, is_active: true, sort_order: 7 },
]

export default function BillingPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(FALLBACK_METHODS)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [revenueAccounts, setRevenueAccounts] = useState<{code: string, name: string}[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [saving, setSaving] = useState(false)
  const [taxRate, setTaxRate] = useState(0)
  const [settings, setSettings] = useState<any>(null)
  const [receiptInvoice, setReceiptInvoice] = useState<Invoice | null>(null)
  const [reservationReceipt, setReservationReceipt] = useState<any>(null)
  const [form, setForm] = useState({
    reservation_id: '',
    items: [{ description: 'House charge', quantity: 1, unit_price: 0, total: 0 }] as InvoiceItem[],
    discount_amount: 0,
    discount_pct: 0,
    discount_type: '$' as '$' | '%',
    discount_reason: '',
    notes: '',
  })
  const [payForm, setPayForm] = useState({ payment_method: 'cash', amount_paid: 0, notes: '' })

  useEffect(() => { if (activeBranch) { loadData(); loadPaymentMethods() } }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPaymentMethods() {
    if (!activeBranch) return
    const { data } = await supabase.from('payment_methods').select('*').eq('branch_id', activeBranch.id).eq('is_active', true).order('sort_order')
    if (data && data.length > 0) setPaymentMethods(data as PaymentMethod[])
  }

  async function loadData() {
    if (!activeBranch) return
    const [invRes, resRes, settingsRes, coaRes] = await Promise.all([
      supabase.from('invoices')
        .select('*, reservation:reservations(reservation_number, check_in_date, check_out_date), guest:guests(full_name, phone), house:houses(name)')
        .eq('branch_id', activeBranch.id)
        .order('created_at', { ascending: false }),
      supabase.from('reservations')
        .select('*, guest:guests(full_name), house:houses(name, base_rate_per_night), line_items:reservation_line_items(id, label, amount, discount, revenue_account_code, cost_amount, cost_account_code, sort_order)')
        .eq('branch_id', activeBranch.id)
        .in('status', ['confirmed', 'checked_in', 'checked_out'])
        .order('created_at', { ascending: false }),
      supabase.from('hotel_settings').select('*').eq('branch_id', activeBranch.id).single(),
      supabase.from('chart_of_accounts').select('code, name').eq('branch_id', activeBranch.id).eq('is_active', true).eq('type', 'revenue').order('code'),
    ])
    setInvoices((invRes.data ?? []) as unknown as Invoice[])
    setReservations((resRes.data ?? []) as unknown as Reservation[])
    if (settingsRes.data) { setTaxRate(Number(settingsRes.data.tax_rate)); setSettings(settingsRes.data) }
    setRevenueAccounts((coaRes.data ?? []) as any)
    setLoading(false)
  }

  function updateItem(idx: number, field: keyof InvoiceItem, value: string | number) {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [field]: value }
      const gross = Number(items[idx].quantity) * Number(items[idx].unit_price)
      const disc  = Number(items[idx].discount ?? 0)
      items[idx].total = Math.max(0, gross - disc)
      return { ...f, items }
    })
  }

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { description: '', quantity: 1, unit_price: 0, discount: 0, total: 0 }] }))
  }

  function removeItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  const subtotal = form.items.reduce((s, i) => s + Number(i.total), 0)
  const discountAmount = form.discount_type === '%'
    ? Math.round(subtotal * Number(form.discount_pct) / 100 * 100) / 100
    : Number(form.discount_amount)
  const taxAmount = (subtotal - discountAmount) * (taxRate / 100)
  const total = subtotal - discountAmount + taxAmount

  async function openCreateInvoice(reservation?: Reservation) {
    setReservationReceipt(null)
    if (reservation) {
      // Load the held deposit receipt for this reservation (if any)
      const { data: receipt } = await supabase
        .from('deposit_receipts').select('*')
        .eq('reservation_id', reservation.id).eq('status', 'held').maybeSingle()
      setReservationReceipt(receipt ?? null)

      const house = (reservation as any).house
      const lineItems: any[] = ((reservation as any).line_items ?? [])
      const nights = calculateNights(reservation.check_in_date, reservation.check_out_date)
      const deposit = Number((reservation as any).deposit ?? 0)
      const totalAmount = Number(reservation.total_amount ?? 0)

      const items: InvoiceItem[] = []

      const houseDisc = Math.max(0, Number((reservation as any).house_discount ?? 0))
      if (house && nights > 0) {
        const houseGross = nights * Number(house.base_rate_per_night)
        items.push({
          description: `House rental — ${house.name} (${nights} night${nights !== 1 ? 's' : ''})`,
          quantity: nights,
          unit_price: Number(house.base_rate_per_night),
          discount: houseDisc || undefined,
          total: Math.max(0, houseGross - houseDisc),
          account_code: '4000',
        })
      } else if (nights > 0 && totalAmount > 0) {
        // Fallback: reservation has a total_amount but no house rate — spread per night
        const perNight = Math.round((totalAmount / nights) * 100) / 100
        items.push({
          description: `House rental (${nights} night${nights !== 1 ? 's' : ''})`,
          quantity: nights,
          unit_price: perNight,
          total: totalAmount,
          account_code: '4000',
        })
      } else if (nights > 0) {
        // No rate data at all — at least show the correct nights count
        items.push({
          description: `House rental (${nights} night${nights !== 1 ? 's' : ''})`,
          quantity: nights,
          unit_price: 0,
          total: 0,
          account_code: '4000',
        })
      }

      // Add each reservation add-on line item — use explicit revenue_account_code set at reservation time
      const sorted = [...lineItems].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      sorted.forEach(item => {
        if (item.label) {
          const code = (item as any).revenue_account_code || '4300'
          const itemDisc = Math.max(0, Number(item.discount ?? 0))
          items.push({ description: item.label, quantity: 1, unit_price: Number(item.amount), discount: itemDisc || undefined, total: Math.max(0, Number(item.amount) - itemDisc), account_code: code })
        }
      })

      if (items.length === 0) {
        items.push({ description: 'House charge', quantity: 1, unit_price: 0, total: 0, account_code: '4000' })
      }

      // Append extra charges from checkout inspection (damage fees etc.)
      const { data: inspection } = await supabase
        .from('checkout_inspections')
        .select('extra_charges, condition')
        .eq('reservation_id', reservation.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (inspection && Array.isArray(inspection.extra_charges)) {
        inspection.extra_charges.forEach((charge: any) => {
          if (charge.description && Number(charge.amount) > 0) {
            items.push({
              description: `Extra charge — ${charge.description}`,
              quantity: 1,
              unit_price: Number(charge.amount),
              total: Number(charge.amount),
              account_code: charge.revenue_code ?? '4300',
            })
          }
        })
      }

      const noteParts: string[] = []
      if (deposit > 0) noteParts.push(`Deposit received: ${formatCurrency(deposit)}`)
      if (inspection?.condition && inspection.condition !== 'good') noteParts.push(`Property condition: ${inspection.condition.replace('_', ' ')}`)
      if ((reservation as any).arrival_time) noteParts.push(`Arrival: ${(reservation as any).arrival_time}`)
      if ((reservation as any).pax_count) noteParts.push(`Pax: ${(reservation as any).pax_count}`)

      const resDiscount = Number((reservation as any).discount_amount ?? 0)
      const resDiscountLabel = (reservation as any).discount_label ?? ''
      setForm({
        reservation_id: reservation.id,
        items,
        discount_amount: resDiscount,
        discount_pct: 0,
        discount_type: '$',
        discount_reason: resDiscountLabel,
        notes: noteParts.join(' · '),
      })
    } else {
      setForm({
        reservation_id: '',
        items: [{ description: 'House charge', quantity: 1, unit_price: 0, total: 0, account_code: '4000' }],
        discount_amount: 0, discount_pct: 0, discount_type: '$', discount_reason: '', notes: '',
      })
    }
    setInvoiceOpen(true)
  }

  async function generateInvoiceNumber(): Promise<string> {
    const now = new Date()
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    // Branch code: single word → first 3 chars; multi-word → initials (e.g. "Srae Ambel" → "SA")
    const location = activeBranch?.location ?? ''
    const words = location.trim().split(/\s+/)
    const branchCode = words.length === 1
      ? location.slice(0, 3).toUpperCase()
      : words.map(w => w[0]).join('').toUpperCase()
    const prefix = `INV-${branchCode}-${yyyymm}-`
    // Query per-branch — sequence is independent per branch
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
    const today = new Date().toISOString().split('T')[0]
    const selectedRes = reservations.find(r => r.id === form.reservation_id) ?? null
    if (selectedRes && selectedRes.check_out_date > today) {
      toast('Update the check-out date in Reservations first, then create the invoice.', 'error')
      return
    }
    setSaving(true)
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
      discount_amount: discountAmount,
      total,
      amount_paid: initialPaid,
      deposit_amount: initialPaid,
      status: initialStatus,
      payment_method: initialPaid > 0 ? 'cash' : null,
      paid_at: initialStatus === 'paid' ? new Date().toISOString() : null,
      items: form.items,
      notes: [form.notes, form.discount_reason ? `Discount reason: ${form.discount_reason}` : ''].filter(Boolean).join(' · ') || null,
    }).select().single()

    if (error) { toast(error.message, 'error'); setSaving(false); return }

    // If deposit pre-paid, record it as a payment_transaction
    if (inv && initialPaid > 0) {
      await supabase.from('payment_transactions').insert({
        invoice_id: inv.id,
        amount: initialPaid,
        payment_method: (selectedRes as any)?.deposit_method ?? 'cash',
        payment_date: new Date().toISOString(),
        notes: 'Deposit applied at invoice creation',
        branch_id: activeBranch?.id ?? null,
      })
    }

    // Mark the held deposit receipt as applied
    if (inv && reservationReceipt?.id) {
      await supabase.from('deposit_receipts').update({
        status: 'applied', updated_at: new Date().toISOString(),
      }).eq('id', reservationReceipt.id)
      setReservationReceipt(null)
    }

    // Auto journal entry: clear deposit liability → credit revenue
    if (inv && initialPaid > 0 && selectedRes) {
      try {
        const itemCodes = new Set(form.items.map(i => i.account_code || '4300'))
        const { data: accounts } = await supabase.from('chart_of_accounts')
          .select('id, code')
          .eq('branch_id', activeBranch!.id)
          .in('code', ['2200', ...Array.from(itemCodes)])

        const depositLiabilityAcc = accounts?.find(a => a.code === '2200')

        if (depositLiabilityAcc) {
          const { data: je, error: jeErr } = await supabase.from('journal_entries').insert({
            entry_number: generateJournalEntryNumber(),
            entry_date: new Date().toISOString().split('T')[0],
            reference: inv.invoice_number,
            reference_type: 'deposit_applied',
            description: `Deposit applied to invoice ${inv.invoice_number} (${(selectedRes.guest as any)?.full_name ?? 'Guest'})`,
            branch_id: activeBranch!.id,
          }).select().single()

          if (jeErr) { toast(`Invoice created but JE failed: ${jeErr.message}`, 'error') }
          else if (je) {
            const lines = [{ entry_id: je.id, account_id: depositLiabilityAcc.id, debit: initialPaid, credit: 0, description: 'Deposit Applied — Liability Cleared' }]
            
            const accountTotals: Record<string, number> = {}
            form.items.forEach(item => {
              const code = item.account_code || '4300'
              accountTotals[code] = (accountTotals[code] || 0) + Number(item.total)
            })
            const invoiceSubtotal = Object.values(accountTotals).reduce((a,b) => a+b, 0)
            
            let remainingPaid = initialPaid
            for (const [code, itemTotal] of Object.entries(accountTotals)) {
              const acc = accounts?.find(a => a.code === code)
              if (!acc) continue
              const ratio = invoiceSubtotal > 0 ? itemTotal / invoiceSubtotal : (1 / Object.keys(accountTotals).length)
              const amount = Math.round((initialPaid * ratio) * 100) / 100
              if (amount > 0) {
                lines.push({ entry_id: je.id, account_id: acc.id, debit: 0, credit: amount, description: `Revenue — ${inv.invoice_number}` })
                remainingPaid -= amount
              }
            }
            if (Math.abs(remainingPaid) > 0.001 && lines.length > 1) {
              lines[1].credit = Math.round((lines[1].credit + remainingPaid) * 100) / 100
            }

            const { error: lineErr } = await supabase.from('journal_entry_lines').insert(lines)
            if (lineErr) {
              await supabase.from('journal_entries').delete().eq('id', je.id)
              toast(`Invoice created but JE lines failed: ${lineErr.message}`, 'error')
            }
          }
        }
      } catch (err: any) { toast(err.message || 'JE error', 'error') }
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
      // Determine account code based on dynamic payment method account_code or is_cash flag
      const selectedPm = paymentMethods.find(m => m.value === payForm.payment_method)
      const cashCode = (selectedPm as any)?.account_code || (selectedPm?.is_cash ? '1010' : '1020')

      const itemCodes = new Set(selectedInvoice.items.map(i => (i as any).account_code || '4300'))

      // Find cash account and revenue account for this branch
      const { data: accounts, error: acctErr } = await supabase.from('chart_of_accounts')
        .select('id, code')
        .eq('branch_id', activeBranch.id)
        .eq('is_active', true)
        .in('code', [cashCode, '2200', ...Array.from(itemCodes)])

      const cashAcct = accounts?.find(a => a.code === cashCode)

      if (cashAcct && amountReceived > 0) {
        const { data: je, error: jeErr } = await supabase.from('journal_entries').insert({
          entry_number: generateJournalEntryNumber(),
          entry_date: new Date().toISOString().split('T')[0],
          reference: selectedInvoice.invoice_number,
          reference_type: 'invoice',
          description: `Payment received — ${selectedInvoice.invoice_number} (${(selectedInvoice.guest as any)?.full_name ?? 'Guest'})`,
          branch_id: activeBranch.id,
        }).select().single()

        if (jeErr) throw jeErr
        if (je) {
          jeId = je.id
          const lines = [{ entry_id: je.id, account_id: cashAcct.id, description: `${capitalize(payForm.payment_method.replace('_', ' '))} received`, debit: amountReceived, credit: 0 }]
          
          const accountTotals: Record<string, number> = {}
          selectedInvoice.items.forEach(item => {
            const code = (item as any).account_code || '4300'
            accountTotals[code] = (accountTotals[code] || 0) + Number(item.total)
          })
          const invoiceSubtotal = Object.values(accountTotals).reduce((a,b) => a+b, 0)
          
          let remainingPaid = amountReceived
          for (const [code, itemTotal] of Object.entries(accountTotals)) {
            const acc = accounts?.find(a => a.code === code)
            if (!acc) continue
            const ratio = invoiceSubtotal > 0 ? itemTotal / invoiceSubtotal : (1 / Object.keys(accountTotals).length)
            const amount = Math.round((amountReceived * ratio) * 100) / 100
            if (amount > 0) {
              lines.push({ entry_id: je.id, account_id: acc.id, description: selectedInvoice.invoice_number, debit: 0, credit: amount })
              remainingPaid -= amount
            }
          }
          if (Math.abs(remainingPaid) > 0.001 && lines.length > 1) {
            lines[1].credit = Math.round((lines[1].credit + remainingPaid) * 100) / 100
          }

          const { error: lineErr } = await supabase.from('journal_entry_lines').insert(lines)
          if (lineErr) {
            await supabase.from('journal_entries').delete().eq('id', je.id)
            throw lineErr
          }
        }
      }

      // Backward compatibility: ensure deposit was applied to JE if it exists
      if (selectedInvoice.reservation_id) {
        const { data: res } = await supabase.from('reservations').select('deposit').eq('id', selectedInvoice.reservation_id).single()
        if (res && res.deposit > 0) {
          const { data: existingDepositJe } = await supabase.from('journal_entries').select('id').eq('reference', selectedInvoice.invoice_number).eq('reference_type', 'deposit_applied').maybeSingle()
          if (!existingDepositJe) {
            const depositLiabilityAcc = accounts?.find(a => a.code === '2200')
            if (depositLiabilityAcc) {
              const { data: depJe, error: depJeErr } = await supabase.from('journal_entries').insert({
                entry_number: generateJournalEntryNumber(),
                entry_date: new Date().toISOString().split('T')[0],
                reference: selectedInvoice.invoice_number,
                reference_type: 'deposit_applied',
                description: `Deposit applied to invoice ${selectedInvoice.invoice_number} (${(selectedInvoice.guest as any)?.full_name ?? 'Guest'})`,
                branch_id: activeBranch.id,
              }).select().single()
              if (depJeErr) throw depJeErr
              if (depJe) {
                const lines = [{ entry_id: depJe.id, account_id: depositLiabilityAcc.id, debit: res.deposit, credit: 0, description: 'Deposit Applied — Liability Cleared' }]
                
                const accountTotals: Record<string, number> = {}
                selectedInvoice.items.forEach(item => {
                  const code = (item as any).account_code || '4300'
                  accountTotals[code] = (accountTotals[code] || 0) + Number(item.total)
                })
                const invoiceSubtotal = Object.values(accountTotals).reduce((a,b) => a+b, 0)
                
                let remainingPaid = res.deposit
                for (const [code, itemTotal] of Object.entries(accountTotals)) {
                  const acc = accounts?.find(a => a.code === code)
                  if (!acc) continue
                  const ratio = invoiceSubtotal > 0 ? itemTotal / invoiceSubtotal : (1 / Object.keys(accountTotals).length)
                  const amount = Math.round((res.deposit * ratio) * 100) / 100
                  if (amount > 0) {
                    lines.push({ entry_id: depJe.id, account_id: acc.id, debit: 0, credit: amount, description: `Revenue — ${selectedInvoice.invoice_number}` })
                    remainingPaid -= amount
                  }
                }
                if (Math.abs(remainingPaid) > 0.001 && lines.length > 1) {
                  lines[1].credit = Math.round((lines[1].credit + remainingPaid) * 100) / 100
                }

                const { error: depLineErr } = await supabase.from('journal_entry_lines').insert(lines)
                if (depLineErr) {
                  await supabase.from('journal_entries').delete().eq('id', depJe.id)
                  throw depLineErr
                }
              }
            }
          }
        }
      }

    } catch (err: any) { toast(`Payment logged, but JE failed: ${err.message}`, 'error') }

    // Record payment transaction
    const { error: pmtErr } = await supabase.from('payment_transactions').insert({
      invoice_id: selectedInvoice.id,
      amount: amountReceived,
      payment_method: payForm.payment_method,
      payment_date: new Date().toISOString(),
      notes: payForm.notes || null,
      journal_entry_id: jeId,
      branch_id: activeBranch.id,
    })
    
    if (pmtErr) {
      if (jeId) await supabase.from('journal_entries').delete().eq('id', jeId)
      toast(`Failed to record payment transaction: ${pmtErr.message}`, 'error')
      setSaving(false); return
    }

    // Sync deposit back to reservation so Remaining column stays accurate
    if (selectedInvoice.reservation_id) {
      const { error: resErr } = await supabase.from('reservations').update({
        deposit: newPaid,
        updated_at: new Date().toISOString(),
      }).eq('id', selectedInvoice.reservation_id)
      if (resErr) toast(`Warning: failed to sync reservation deposit: ${resErr.message}`, 'error')
    }

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
    const refreshed = { ...selectedInvoice, amount_paid: newPaid, status: newStatus, payment_method: payForm.payment_method } as Invoice
    setSelectedInvoice(null)
    loadData()
    setReceiptInvoice(refreshed)
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
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hsurface2">
                {['Invoice #', 'Guest', 'House', 'Subtotal', 'Tax', 'Total', 'Deposit', 'Paid', 'Balance', 'Status', 'Date Issued', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="px-5 py-10 text-center text-hmuted">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-5 py-10 text-center text-hmuted">No invoices found</td></tr>
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
                    <td className="px-4 py-3 text-blue-600 font-medium">
                      {Number((inv as any).deposit_amount) > 0 ? formatCurrency((inv as any).deposit_amount) : <span className="text-hmuted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-green-700 font-medium">{formatCurrency(inv.amount_paid)}</td>
                    <td className="px-4 py-3">
                      {balance > 0
                        ? <span className="text-red-600 font-semibold">{formatCurrency(balance)}</span>
                        : <span className="text-green-600">—</span>}
                    </td>
                    <td className="px-4 py-3"><Badge status={inv.status} /></td>
                    <td className="px-4 py-3 text-xs text-hmuted whitespace-nowrap">{formatDate(inv.invoice_date ?? inv.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-nowrap">
                        {!['paid', 'refunded', 'void'].includes(inv.status) && (
                          <Button size="sm" onClick={() => openPayment(inv)}>Record Payment</Button>
                        )}
                        {Number(inv.amount_paid) > 0 && (
                          <button onClick={() => setReceiptInvoice(inv)} className="text-xs text-navy hover:underline font-medium whitespace-nowrap">Receipt</button>
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

      {/* ── Create Invoice Modal ── */}
      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="Create Invoice" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-hmuted">Link to Reservation</label>
            {(() => {
              const today = new Date().toISOString().split('T')[0]
              const invoicedIds = new Set(
                invoices
                  .filter(i => i.reservation_id && i.status !== 'void')
                  .map(i => i.reservation_id!)
              )
              const eligible = reservations
                .filter(r => r.check_out_date <= today && !invoicedIds.has(r.id))
              return (
                <>
                  <select
                    value={form.reservation_id}
                    onChange={e => {
                      const res = reservations.find(r => r.id === e.target.value)
                      if (res) openCreateInvoice(res)
                      else { setForm(f => ({ ...f, reservation_id: e.target.value })); setReservationReceipt(null) }
                    }}
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  >
                    <option value="">— No reservation —</option>
                    {eligible.map(r => (
                      <option key={r.id} value={r.id}>
                        {(r.guest as any)?.full_name ?? 'Guest'} — {(r as any).reservation_number} · {(r as any).house?.name ?? 'No house linked'}
                      </option>
                    ))}
                  </select>
                  {eligible.length === 0 && (
                    <p className="text-xs text-hmuted mt-1">No reservations checking out today.</p>
                  )}
                </>
              )
            })()}
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
                {reservationReceipt ? (
                  <div className="col-span-2 flex justify-between border-t border-hborder pt-1.5 mt-0.5 items-center">
                    <span className="text-hmuted">Deposit Receipt</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-green-700">{formatCurrency(Number(reservationReceipt.amount))}</span>
                      <span className="font-mono text-[10px] text-hmuted">{reservationReceipt.receipt_number}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-semibold">Held</span>
                    </span>
                  </div>
                ) : (res as any).deposit > 0 ? (
                  <div className="col-span-2 flex justify-between border-t border-hborder pt-1.5 mt-0.5">
                    <span className="text-hmuted">Deposit on file</span>
                    <span className="font-semibold text-green-700">{formatCurrency(Number((res as any).deposit))}</span>
                  </div>
                ) : null}
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
                <span className="col-span-3 text-[10px] text-hmuted uppercase tracking-wide">Description</span>
                <span className="col-span-2 text-[10px] text-hmuted uppercase tracking-wide">Account</span>
                <span className="col-span-1 text-[10px] text-hmuted uppercase tracking-wide text-center">Qty</span>
                <span className="col-span-2 text-[10px] text-hmuted uppercase tracking-wide">Unit Price</span>
                <span className="col-span-2 text-[10px] text-hmuted uppercase tracking-wide text-orange-500">Discount ($)</span>
                <span className="col-span-1 text-[10px] text-hmuted uppercase tracking-wide text-right">Total</span>
              </div>
              {form.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    value={item.description}
                    onChange={e => updateItem(idx, 'description', e.target.value)}
                    placeholder="Description"
                    className="col-span-3 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                  <select
                    value={item.account_code || '4300'}
                    onChange={e => updateItem(idx, 'account_code', e.target.value)}
                    className="col-span-2 border border-hborder rounded-lg px-1.5 py-1.5 text-xs focus:outline-none focus:border-navy bg-hbg text-hmuted"
                  >
                    {revenueAccounts.map(a => (
                      <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                  <input
                    type="number" min={1}
                    value={item.quantity}
                    onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                    className="col-span-1 border border-hborder rounded-lg px-1.5 py-1.5 text-sm text-center focus:outline-none focus:border-navy bg-hbg"
                  />
                  <input
                    type="number" min={0} step={0.01}
                    value={item.unit_price}
                    onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                    className="col-span-2 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                    placeholder="0.00"
                  />
                  <input
                    type="number" min={0} step={0.01}
                    value={item.discount ?? 0}
                    onChange={e => updateItem(idx, 'discount', Number(e.target.value))}
                    className="col-span-2 border border-orange-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-orange-400 bg-orange-50 text-orange-700"
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
                <span className="text-hmuted">Subtotal (before item discounts)</span>
                <span className="font-medium">{formatCurrency(form.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0))}</span>
              </div>
              {form.items.some(i => Number(i.discount ?? 0) > 0) && (
                <div className="flex justify-between text-orange-600">
                  <span>Item Discounts</span>
                  <span className="font-medium">− {formatCurrency(form.items.reduce((s, i) => s + Number(i.discount ?? 0), 0))}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-hborder pt-1.5">
                <span className="text-hmuted">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-hmuted">Discount</span>
                  <div className="flex items-center gap-1.5">
                    {/* % / $ toggle */}
                    <div className="flex rounded-lg overflow-hidden border border-hborder text-xs font-semibold">
                      {(['$', '%'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, discount_type: t, discount_amount: 0, discount_pct: 0 }))}
                          className={`px-2.5 py-1 transition-colors ${form.discount_type === t ? 'bg-navy text-white' : 'bg-white text-hmuted hover:bg-hsurface2'}`}
                        >{t}</button>
                      ))}
                    </div>
                    {form.discount_type === '%' ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min={0} max={100} step={0.5}
                          value={form.discount_pct}
                          onChange={e => setForm(f => ({ ...f, discount_pct: Number(e.target.value) }))}
                          className="w-16 border border-hborder rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-navy bg-hbg"
                        />
                        <span className="text-hmuted text-xs">%</span>
                        {form.discount_pct > 0 && (
                          <span className="text-red-500 font-medium text-sm">−{formatCurrency(discountAmount)}</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-hmuted text-xs">$</span>
                        <input
                          type="number" min={0} step={0.01}
                          value={form.discount_amount}
                          onChange={e => setForm(f => ({ ...f, discount_amount: Number(e.target.value) }))}
                          className="w-24 border border-hborder rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-navy bg-hbg"
                        />
                      </div>
                    )}
                  </div>
                </div>
                {discountAmount > 0 && (
                  <div className="flex items-center gap-2">
                    <input
                      value={form.discount_reason}
                      onChange={e => setForm(f => ({ ...f, discount_reason: e.target.value }))}
                      placeholder="Reason (e.g. loyalty, promo code…)"
                      className="flex-1 border border-hborder rounded px-2 py-1 text-xs focus:outline-none focus:border-navy bg-hbg text-hmuted"
                    />
                  </div>
                )}
              </div>
              {taxRate > 0 && (
                <div className="flex justify-between">
                  <span className="text-hmuted">Tax ({taxRate}%)</span>
                  <span className="font-medium">{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {(() => {
                const srcRes = reservations.find(r => r.id === form.reservation_id)
                const lineItems: any[] = (srcRes as any)?.line_items ?? []
                const totalCost = lineItems.reduce((s: number, i: any) => s + (i.cost_amount != null ? Number(i.cost_amount) : 0), 0)
                const addOnRev = lineItems.reduce((s: number, i: any) => s + Math.max(0, Number(i.amount) - Number(i.discount ?? 0)), 0)
                if (totalCost === 0) return null
                const margin = addOnRev - totalCost
                const pct = addOnRev > 0 ? Math.round((margin / addOnRev) * 100) : 0
                return (
                  <div className="flex justify-between text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-emerald-700">
                    <span>Service Cost (est.) · Add-on Margin</span>
                    <span className="font-semibold">−{formatCurrency(totalCost)} · {formatCurrency(margin)} ({pct}%)</span>
                  </div>
                )
              })()}
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
            <Button
              onClick={handleCreate}
              disabled={saving || (() => {
                const t = new Date().toISOString().split('T')[0]
                const r = reservations.find(r => r.id === form.reservation_id)
                return !!(r && r.check_out_date > t)
              })()}
            >{saving ? 'Creating…' : 'Create Invoice'}</Button>
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
                {paymentMethods.map(m => (
                  <option key={m.value} value={m.value}>{m.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-hmuted mt-1">
                Posts to: {(() => { const pm = paymentMethods.find(m => m.value === payForm.payment_method); const code = (pm as any)?.account_code || (pm?.is_cash ? '1010' : '1020'); return `${code} ${pm?.is_cash ? 'Cash on Hand' : 'Bank'}` })()}
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

      {/* ── Receipt Modal ── */}
      {receiptInvoice && (() => {
        const inv = receiptInvoice
        const guest = (inv.guest as any)
        const house = (inv as any).house
        const res = (inv.reservation as any)
        const balance = Number(inv.total) - Number(inv.amount_paid)
        const items: InvoiceItem[] = Array.isArray(inv.items) ? inv.items : []
        const hotelName = settings?.hotel_name ?? 'OnlyOne Homestay'
        const hotelPhone = settings?.hotel_phone ?? ''
        const hotelAddress = settings?.hotel_address ?? ''

        function printReceipt() {
          const content = document.getElementById('receipt-printable')?.innerHTML ?? ''
          const w = window.open('', '_blank', 'width=720,height=960')
          if (!w) return
          w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${window.location.origin}"><title>Receipt ${inv.invoice_number}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1a1a2e; padding: 40px; max-width: 680px; margin: 0 auto; }
            .receipt-header { background: #1a1a2e; color: white; padding: 24px 32px; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: center; }
            .header-left { display: flex; align-items: center; gap: 16px; }
            .logo { height: 64px; width: 64px; object-fit: contain; border-radius: 8px; background: white; padding: 4px; }
            .branch-name { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #c89b3c; }
            .hotel-sub { font-size: 12px; color: #a0aec0; margin-top: 3px; }
            .receipt-label { font-size: 10px; text-transform: uppercase; letter-spacing: 3px; color: #a0aec0; font-weight: 600; }
            .receipt-num { font-size: 22px; font-weight: 800; color: #c89b3c; letter-spacing: -0.5px; }
            .receipt-date { font-size: 12px; color: #a0aec0; margin-top: 2px; }
            .body { border: 1px solid #e8edf3; border-top: none; border-radius: 0 0 12px 12px; padding: 28px 32px; }
            .billed-to { margin-bottom: 24px; }
            .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #9ca3af; font-weight: 600; margin-bottom: 6px; }
            .guest-name { font-size: 16px; font-weight: 700; color: #1a1a2e; }
            .guest-phone { font-size: 13px; color: #6b7280; margin-top: 2px; }
            .dates-row { display: flex; gap: 32px; padding: 12px 0; border-top: 1px solid #f0f4f8; border-bottom: 1px solid #f0f4f8; margin-bottom: 24px; }
            .date-item { display: flex; flex-direction: column; gap: 2px; }
            .date-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; }
            .date-val { font-size: 13px; font-weight: 600; color: #1a1a2e; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            thead tr { border-bottom: 2px solid #1a1a2e; }
            thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; font-weight: 600; padding: 8px 0; text-align: left; }
            thead th:not(:first-child) { text-align: right; }
            tbody tr { border-bottom: 1px solid #f0f4f8; }
            tbody td { padding: 12px 0; font-size: 13px; color: #374151; }
            tbody td:not(:first-child) { text-align: right; }
            .totals { margin-left: auto; width: 280px; }
            .totals-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; color: #6b7280; }
            .totals-row.total { border-top: 2px solid #1a1a2e; margin-top: 8px; padding-top: 10px; font-size: 16px; font-weight: 800; color: #1a1a2e; }
            .totals-row.remaining { border-top: 1px solid #e8edf3; margin-top: 8px; padding-top: 8px; font-weight: 700; color: #c0392b; font-size: 14px; }
            .totals-row.paid-full { color: #1a7a4a; font-weight: 700; font-size: 14px; border-top: 1px solid #e8edf3; margin-top: 8px; padding-top: 8px; }
            .payment-footer { margin-top: 28px; padding-top: 20px; border-top: 1px dashed #e8edf3; display: flex; justify-content: space-between; align-items: flex-start; }
            .payment-method { font-size: 12px; }
            .payment-method strong { color: #1a1a2e; }
            .thank-you { text-align: right; font-size: 13px; color: #6b7280; font-style: italic; }
            @media print { body { padding: 0; } }
          </style></head><body>${content}</body></html>`)
          w.document.close()
          w.focus()
          setTimeout(() => w.print(), 400)
        }

        return (
          <Modal open={true} onClose={() => setReceiptInvoice(null)} title="Receipt" size="lg">
            <div className="flex justify-end gap-2 mb-4 print:hidden">
              <Button variant="ghost" onClick={() => setReceiptInvoice(null)}>Close</Button>
              <Button onClick={printReceipt}>Print / Save PDF</Button>
            </div>

            <div id="receipt-printable">
              {/* Header */}
              <div style={{ background: '#1a1a2e', borderRadius: '12px 12px 0 0', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.jpg" alt={settings?.hotel_name ?? 'OnlyOne Homestay'} style={{ height: 64, width: 64, objectFit: 'contain', borderRadius: 8, background: 'white', padding: 4 }} />
                  <div>
                    <div style={{ color: '#c89b3c', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>{activeBranch?.location ?? ''}</div>
                    {hotelPhone && <div style={{ color: '#a0aec0', fontSize: 12, marginTop: 3 }}>{hotelPhone}</div>}
                    {hotelAddress && <div style={{ color: '#a0aec0', fontSize: 11, marginTop: 2 }}>{hotelAddress}</div>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 3, color: '#a0aec0', fontWeight: 600 }}>Receipt</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#c89b3c', letterSpacing: -0.5 }}>{inv.invoice_number}</div>
                  <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 2 }}>{formatDate(inv.invoice_date ?? inv.created_at)}</div>
                </div>
              </div>

              {/* Body */}
              <div style={{ border: '1px solid #e8edf3', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '28px 32px' }}>
                {/* Billed to + dates */}
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#9ca3af', marginBottom: 6 }}>Billed To</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{guest?.full_name ?? '—'}</p>
                    {guest?.phone && <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{guest.phone}</p>}
                  </div>
                  {res && (
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#9ca3af', marginBottom: 6 }}>Stay Details</p>
                      {house?.name && <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{house.name}</p>}
                      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{formatDate(res.check_in_date)} → {formatDate(res.check_out_date)}</p>
                    </div>
                  )}
                </div>

                {/* Line items */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1a1a2e' }}>
                      {['Description', 'Rate', 'Qty', 'Total'].map((h, i) => (
                        <th key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: '#6b7280', fontWeight: 600, padding: '8px 0', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.length > 0 ? items.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f0f4f8' }}>
                        <td style={{ padding: '12px 0', fontSize: 13, color: '#374151' }}>{item.description}</td>
                        <td style={{ padding: '12px 0', fontSize: 13, color: '#374151', textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                        <td style={{ padding: '12px 0', fontSize: 13, color: '#374151', textAlign: 'right' }}>{item.quantity}</td>
                        <td style={{ padding: '12px 0', fontSize: 13, fontWeight: 600, color: '#1a1a2e', textAlign: 'right' }}>{formatCurrency(item.total)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} style={{ padding: '12px 0', fontSize: 13, color: '#9ca3af' }}>House charge</td></tr>
                    )}
                  </tbody>
                </table>

                {/* Totals */}
                <div style={{ marginLeft: 'auto', width: 280 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: '#6b7280' }}>
                    <span>Subtotal</span><span>{formatCurrency(inv.subtotal)}</span>
                  </div>
                  {Number(inv.discount_amount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: '#6b7280' }}>
                      <span>Discount</span><span>−{formatCurrency(inv.discount_amount)}</span>
                    </div>
                  )}
                  {Number(inv.tax_amount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: '#6b7280' }}>
                      <span>Tax ({inv.tax_rate}%)</span><span>{formatCurrency(inv.tax_amount)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: '#1a1a2e', borderTop: '2px solid #1a1a2e', marginTop: 8, paddingTop: 10 }}>
                    <span>Total</span><span>{formatCurrency(inv.total)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0 4px', color: '#6b7280', borderTop: '1px solid #e8edf3', marginTop: 8 }}>
                    <span>Deposit Paid</span><span style={{ color: '#1a7a4a', fontWeight: 600 }}>{formatCurrency(inv.amount_paid)}</span>
                  </div>
                  {balance > 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#c0392b', paddingTop: 4 }}>
                      <span>Remaining</span><span>{formatCurrency(balance)}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#1a7a4a', paddingTop: 4 }}>
                      <span>Remaining</span><span>Paid in Full ✓</span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px dashed #e8edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    {inv.payment_method && (
                      <p style={{ fontSize: 12, color: '#6b7280' }}>
                        Payment: <strong style={{ color: '#1a1a2e' }}>{capitalize(String(inv.payment_method).replace('_', ' '))}</strong>
                      </p>
                    )}
                    {inv.notes && <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, maxWidth: 260 }}>{inv.notes}</p>}
                  </div>
                  <p style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>Thank you for staying with us!</p>
                </div>
              </div>
            </div>
          </Modal>
        )
      })()}
    </>
  )
}
