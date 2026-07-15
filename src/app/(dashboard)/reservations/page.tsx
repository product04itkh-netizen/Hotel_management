'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import { formatDate, calculateNights, generateReservationNumber, formatCurrency, capitalize, generateJournalEntryNumber } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import type { Reservation, House, DepositReceipt } from '@/types'

interface PaymentMethod {
  id: string
  name: string
  value: string
  is_cash: boolean
  is_active: boolean
  sort_order: number
}

const STATUSES = ['all', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']
const SOURCES = ['walk_in', 'phone', 'online', 'ota', 'referral']


const PRESET_ADDONS = [
  { label: 'Car Rental (4WD)', icon: '🚙', code: '4200', costCode: '5500' },
  { label: 'Food & Cooking',   icon: '🍳', code: '4100', costCode: '5300' },
  { label: 'BBQ / Grilling',  icon: '🔥', code: '4100', costCode: '5600' },
  { label: 'Ice',              icon: '🧊', code: '4100', costCode: '5300' },
  { label: 'Tent Rental',      icon: '⛺', code: '4200', costCode: '6000' },
  { label: 'Bedding Set',      icon: '🛏', code: '4300', costCode: '6000' },
  { label: 'Extra Cleaning',   icon: '🧹', code: '4300', costCode: '6000' },
  { label: 'Transport',        icon: '🚌', code: '4200', costCode: '5500' },
  { label: 'Kayak Rental',     icon: '🚣', code: '4200', costCode: '5400' },
  { label: 'Bike Rental',      icon: '🚲', code: '4200', costCode: '5400' },
]


interface LineItemForm {
  id?: string
  label: string
  amount: number | string
  discount: number | string
  revenue_account_code: string
  cost_amount: number | string
  cost_account_code: string
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
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message?: string; confirmLabel?: string; variant?: 'default' | 'danger'; onConfirm: () => void } | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [lineItems, setLineItems] = useState<LineItemForm[]>([])
  const [deposit, setDeposit] = useState<number | string>(0)
  const [depositMethod, setDepositMethod] = useState<string>('cash')
  const [discountAmount, setDiscountAmount] = useState<number | string>(0)
  const [discountLabel, setDiscountLabel] = useState('')
  const [houseDiscount, setHouseDiscount] = useState<number | string>(0)
  const [receiptModalRes, setReceiptModalRes] = useState<any>(null)
  const [paxCount, setPaxCount] = useState<number | string>('')
  const [arrivalTime, setArrivalTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })
  const [houseFilter, setHouseFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [khHolidays, setKhHolidays] = useState<Record<string, string>>({})
  const [notifyingId, setNotifyingId] = useState<string | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [linkedPettyCash, setLinkedPettyCash] = useState<any[]>([])
  const [revenueAccounts, setRevenueAccounts] = useState<{code: string, name: string}[]>([])
  const [costAccounts, setCostAccounts] = useState<{code: string, name: string}[]>([])

  useEffect(() => {
    if (activeBranch) { loadData(); loadPaymentMethods() }
  }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPaymentMethods() {
    if (!activeBranch) return
    const { data } = await supabase.from('payment_methods').select('*').eq('branch_id', activeBranch.id).eq('is_active', true).order('sort_order')
    setPaymentMethods((data ?? []) as PaymentMethod[])
  }

  async function loadLinkedPettyCash(reservationId: string) {
    const { data } = await supabase
      .from('petty_cash_transactions')
      .select('id, description, amount, transaction_date, reservation_line_item_id')
      .eq('reservation_id', reservationId)
      .eq('transaction_type', 'out')
      .order('transaction_date')
    setLinkedPettyCash((data ?? []) as any[])
  }

  // Fetch Cambodian public holidays from Calendarific (once per year, cached 90 days)
  useEffect(() => {
    if (viewMode !== 'calendar') return
    const yearsNeeded = new Set<number>()
    if (dateFrom || dateTo) {
      const start = new Date((dateFrom || dateTo) + 'T00:00:00').getFullYear()
      const end   = new Date((dateTo || dateFrom) + 'T00:00:00').getFullYear()
      for (let y = start; y <= end; y++) yearsNeeded.add(y)
    } else {
      yearsNeeded.add(calMonth.getFullYear())
      yearsNeeded.add(calMonth.getFullYear() + 1) // prefetch next year
    }
    yearsNeeded.forEach(async (year) => {
      try {
        const res = await fetch(`/api/holidays?year=${year}`)
        if (res.ok) {
          const data: Record<string, string> = await res.json()
          setKhHolidays(prev => ({ ...prev, ...data }))
        }
      } catch { /* silently fail — calendar still works without holidays */ }
    })
  }, [viewMode, calMonth, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    if (!activeBranch) return
    const [resRes, houseRes, revAcctRes, costAcctRes] = await Promise.all([
      supabase.from('reservations')
        .select('*, guest:guests(full_name, email, phone), house:houses(name, house_type, base_rate_per_night), line_items:reservation_line_items(id, label, amount, discount, revenue_account_code, cost_amount, cost_account_code, sort_order), deposit_receipts(id, receipt_number, amount, payment_method, receipt_date, status)')
        .eq('branch_id', activeBranch.id)
        .order('check_in_date', { ascending: false }),
      supabase.from('houses')
        .select('*')
        .eq('branch_id', activeBranch.id)
        .order('name'),
      supabase.from('chart_of_accounts').select('code, name').eq('branch_id', activeBranch.id).eq('is_active', true).eq('type', 'revenue').order('code'),
      supabase.from('chart_of_accounts').select('code, name').eq('branch_id', activeBranch.id).eq('is_active', true).eq('type', 'expense').order('code'),
    ])
    setReservations((resRes.data ?? []) as unknown as Reservation[])
    setHouses((houseRes.data ?? []) as unknown as House[])
    setRevenueAccounts((revAcctRes.data ?? []) as {code: string, name: string}[])
    setCostAccounts((costAcctRes.data ?? []) as {code: string, name: string}[])
    setLoading(false)
  }

  const filtered = reservations.filter(r => {
    const guestName = (r.guest as any)?.full_name ?? ''
    const matchSearch = !search
      || guestName.toLowerCase().includes(search.toLowerCase())
      || r.reservation_number.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    const matchHouse = houseFilter === 'all' || r.house_id === houseFilter
    const matchFrom = !dateFrom || r.check_in_date >= dateFrom
    const matchTo = !dateTo || r.check_in_date <= dateTo
    return matchSearch && matchStatus && matchHouse && matchFrom && matchTo
  })

  function openCreate() {
    setEditId(null)
    setForm({ ...emptyForm })
    setLineItems([])
    setDeposit(0)
    setDepositMethod('cash')
    setDiscountAmount(0)
    setDiscountLabel('')
    setHouseDiscount(0)
    setPaxCount('')
    setArrivalTime('')
    setLinkedPettyCash([])
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
        .map(i => ({ id: i.id, label: i.label, amount: i.amount, discount: i.discount ?? 0, revenue_account_code: i.revenue_account_code ?? '4300', cost_amount: i.cost_amount ?? '', cost_account_code: i.cost_account_code ?? '6000' }))
    )
    setDeposit(res.deposit ?? 0)
    setDepositMethod((res as any).deposit_method ?? 'cash')
    setDiscountAmount((res as any).discount_amount ?? 0)
    setDiscountLabel((res as any).discount_label ?? '')
    setHouseDiscount((res as any).house_discount ?? 0)
    setPaxCount(res.pax_count ?? '')
    setArrivalTime(res.arrival_time ?? '')
    setLinkedPettyCash([])
    if (res.id) loadLinkedPettyCash(res.id)
    setModalOpen(true)
  }

  function addPreset(preset: { label: string; icon: string; code: string; costCode: string }) {
    if (lineItems.some(i => i.label === preset.label)) {
      toast(`${preset.label} already added`, 'info'); return
    }
    setLineItems(prev => [...prev, { label: preset.label, amount: '', discount: 0, revenue_account_code: preset.code, cost_amount: '', cost_account_code: preset.costCode }])
  }

  function addCustom() {
    setLineItems(prev => [...prev, { label: '', amount: '', discount: 0, revenue_account_code: '4300', cost_amount: '', cost_account_code: '6000' }])
  }

  function updateItem(idx: number, field: 'label' | 'amount' | 'discount' | 'revenue_account_code' | 'cost_amount' | 'cost_account_code', value: string | number) {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function removeItem(idx: number) {
    setLineItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function generateDepositReceiptNumber(): Promise<string> {
    const now = new Date()
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const location = activeBranch?.location ?? ''
    const words = location.trim().split(/\s+/)
    const branchCode = words.length === 1
      ? location.slice(0, 3).toUpperCase()
      : words.map(w => w[0]).join('').toUpperCase()
    const prefix = `DR-${branchCode}-${yyyymm}-`
    const { data } = await supabase
      .from('deposit_receipts')
      .select('receipt_number')
      .eq('branch_id', activeBranch!.id)
      .like('receipt_number', `${prefix}%`)
      .order('receipt_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    let seq = 1
    if (data?.receipt_number) {
      const lastNum = parseInt((data.receipt_number as string).slice(prefix.length), 10)
      if (!isNaN(lastNum)) seq = lastNum + 1
    }
    return `${prefix}${String(seq).padStart(3, '0')}`
  }

  async function syncDepositJournalEntry(resNum: string, guestName: string, depositAmt: number, method: string) {
    if (!activeBranch) return
    const pm = paymentMethods.find(m => m.value === method)
    const cashCode = (pm as any)?.account_code || (pm?.is_cash ? '1010' : (method === 'cash' ? '1010' : '1020'))
    const { data: accounts } = await supabase.from('chart_of_accounts').select('id, code').eq('branch_id', activeBranch.id).in('code', [cashCode, '2200'])
    if (!accounts) return
    const assetAcc = accounts.find(a => a.code === cashCode)?.id
    const depositAcc = accounts.find(a => a.code === '2200')?.id
    if (!assetAcc || !depositAcc) return

    const { data: existingJes } = await supabase.from('journal_entries').select('id').eq('reference', resNum).eq('reference_type', 'deposit')
    if (existingJes && existingJes.length > 0) {
      const jeIds = existingJes.map(je => je.id)
      await supabase.from('journal_entry_lines').delete().in('entry_id', jeIds)
      await supabase.from('journal_entries').delete().in('id', jeIds)
    }

    if (depositAmt > 0) {
      const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
        entry_number: generateJournalEntryNumber(),
        entry_date: new Date().toISOString().split('T')[0],
        reference: resNum,
        reference_type: 'deposit',
        description: `Deposit received for ${guestName} (${resNum})`,
        branch_id: activeBranch.id
      }).select().single()

      if (entryErr) { console.error('JE error:', entryErr); return }
      if (entry) {
        const { error: lineErr } = await supabase.from('journal_entry_lines').insert([
          { entry_id: entry.id, account_id: assetAcc, debit: depositAmt, credit: 0, description: 'Deposit Received' },
          { entry_id: entry.id, account_id: depositAcc, debit: 0, credit: depositAmt, description: 'Guest Deposit Liability' }
        ])
        if (lineErr) {
          await supabase.from('journal_entries').delete().eq('id', entry.id)
          console.error('JE line error:', lineErr)
        }
      }
    }
  }

  async function createRefundJournalEntry(resNum: string, guestName: string, depositAmt: number, method: string) {
    if (!activeBranch || depositAmt <= 0) return
    const pm = paymentMethods.find(m => m.value === method)
    const cashCode = (pm as any)?.account_code || (pm?.is_cash ? '1010' : (method === 'cash' ? '1010' : '1020'))
    const { data: accounts } = await supabase.from('chart_of_accounts').select('id, code').eq('branch_id', activeBranch.id).in('code', [cashCode, '2200'])
    if (!accounts) return
    const assetAcc = accounts.find(a => a.code === cashCode)?.id
    const depositAcc = accounts.find(a => a.code === '2200')?.id
    if (!assetAcc || !depositAcc) return

    const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
      entry_number: generateJournalEntryNumber(),
      entry_date: new Date().toISOString().split('T')[0],
      reference: resNum,
      reference_type: 'deposit_refund',
      description: `Deposit refunded for ${guestName} (${resNum})`,
      branch_id: activeBranch.id
    }).select().single()

    if (entryErr) { console.error('Refund JE error:', entryErr); return }
    if (entry) {
      const { error: lineErr } = await supabase.from('journal_entry_lines').insert([
        { entry_id: entry.id, account_id: depositAcc, debit: depositAmt, credit: 0, description: 'Deposit Refunded Liability Clear' },
        { entry_id: entry.id, account_id: assetAcc, debit: 0, credit: depositAmt, description: 'Deposit Refunded Cash Out' }
      ])
      if (lineErr) {
        await supabase.from('journal_entries').delete().eq('id', entry.id)
        console.error('Refund JE line error:', lineErr)
      }
    }
  }

  // Cost calculations (live as user types)
  const nights = form.check_in_date && form.check_out_date
    ? calculateNights(form.check_in_date, form.check_out_date)
    : 0
  const selectedHouse = houses.find(h => h.id === form.house_id)
  const houseGross = selectedHouse && nights > 0 ? selectedHouse.base_rate_per_night * nights : 0
  const houseDiscountNum = Math.max(0, Number(houseDiscount || 0))
  const houseBase = Math.max(0, houseGross - houseDiscountNum)
  const addOnsGross = lineItems.reduce((s, i) => s + Number(i.amount || 0), 0)
  const addOnsItemDiscount = lineItems.reduce((s, i) => s + Math.max(0, Number(i.discount || 0)), 0)
  const addOnsTotal = lineItems.reduce((s, i) => s + Math.max(0, Number(i.amount || 0) - Number(i.discount || 0)), 0)
  const addOnsCost = lineItems.reduce((s, i) => s + (i.cost_amount !== '' && i.cost_amount != null ? Number(i.cost_amount) : 0), 0)
  const addOnsMargin = addOnsTotal - addOnsCost
  const addOnsMarginPct = addOnsTotal > 0 ? Math.round((addOnsMargin / addOnsTotal) * 100) : null
  const totalActual = linkedPettyCash.reduce((s, p) => s + Number(p.amount), 0)
  const totalItemDiscounts = houseDiscountNum + addOnsItemDiscount
  const grossSubtotal = houseGross + addOnsGross
  const subtotal = houseBase + addOnsTotal
  const discountNum = Number(discountAmount || 0)
  const netTotal = subtotal - discountNum
  const depositNum = Number(deposit || 0)
  const balanceDue = netTotal - depositNum

  async function handleSave() {
    if (!form.guest_name || !form.check_in_date || !form.check_out_date || !form.house_id) {
      toast('Guest name, house, and dates are required', 'error'); return
    }
    if (form.check_out_date <= form.check_in_date) {
      toast('Check-out date must be after check-in date', 'error'); return
    }
    if (!activeBranch) { toast('No branch selected', 'error'); return }
    setSaving(true)

    const validItems = lineItems.filter(i => i.label.trim())

    // Upsert guest
    let guestId = form.guest_id
    if (!guestId && form.guest_name) {
      const { data: newGuest, error: guestErr } = await supabase.from('guests').insert({
        full_name: form.guest_name,
        email: form.guest_email || null,
        phone: form.guest_phone || null,
        visit_count: 1,
      }).select().single()
      if (guestErr) { toast(`Failed to create guest: ${guestErr.message}`, 'error'); setSaving(false); return }
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
        total_amount: netTotal,
        deposit: depositNum,
        deposit_method: depositNum > 0 ? depositMethod : null,
        discount_amount: discountNum,
        discount_label: discountLabel || null,
        house_discount: houseDiscountNum,
        updated_at: new Date().toISOString(),
      }).eq('id', editId)
      if (error) { toast(error.message, 'error'); setSaving(false); return }

      // Sync deposit receipt: update existing held receipt, create new, or mark refunded
      const { data: existingReceipt } = await supabase
        .from('deposit_receipts').select('id, amount, payment_method').eq('reservation_id', editId).eq('status', 'held').maybeSingle()
      if (depositNum > 0) {
        if (existingReceipt) {
          await supabase.from('deposit_receipts').update({
            amount: depositNum, payment_method: depositMethod, updated_at: new Date().toISOString(),
          }).eq('id', existingReceipt.id)
        } else {
          const receiptNum = await generateDepositReceiptNumber()
          await supabase.from('deposit_receipts').insert({
            receipt_number: receiptNum, reservation_id: editId, branch_id: activeBranch.id,
            amount: depositNum, payment_method: depositMethod,
            receipt_date: new Date().toISOString().split('T')[0], status: 'held',
          })
        }
        const resNum = reservations.find(r => r.id === editId)?.reservation_number || ''
        await syncDepositJournalEntry(resNum, form.guest_name, depositNum, depositMethod)
      } else if (existingReceipt) {
        await supabase.from('deposit_receipts').update({
          status: 'refunded', updated_at: new Date().toISOString(),
        }).eq('id', existingReceipt.id)
        
        const resNum = reservations.find(r => r.id === editId)?.reservation_number || ''
        await createRefundJournalEntry(resNum, form.guest_name, existingReceipt.amount, existingReceipt.payment_method)
      }

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
        total_amount: netTotal,
        deposit: depositNum,
        deposit_method: depositNum > 0 ? depositMethod : null,
        discount_amount: discountNum,
        discount_label: discountLabel || null,
        house_discount: houseDiscountNum,
      }).select().single()

      if (error) { toast(error.message, 'error'); setSaving(false); return }
      reservationId = newRes?.id ?? null

      // Create deposit receipt if a deposit was taken
      if (newRes && depositNum > 0) {
        const receiptNum = await generateDepositReceiptNumber()
        const { error: recErr } = await supabase.from('deposit_receipts').insert({
          receipt_number: receiptNum,
          reservation_id: newRes.id,
          branch_id: activeBranch.id,
          amount: depositNum,
          payment_method: depositMethod,
          receipt_date: new Date().toISOString().split('T')[0],
          status: 'held',
        })
        if (recErr) toast(`Reservation saved but receipt error: ${recErr.message}`, 'error')
        await syncDepositJournalEntry(newRes.reservation_number, form.guest_name, depositNum, depositMethod)
      }

      if (newRes) {
        const paxStr = [
          form.adults > 0 ? `${form.adults} Adult${form.adults !== 1 ? 's' : ''}` : null,
          form.children > 0 ? `${form.children} Child${form.children !== 1 ? 'ren' : ''}` : null,
        ].filter(Boolean).join(', ') || `${paxCount} Pax`
        const addOnsStr = validItems.length > 0
          ? validItems.map(i => `• ${i.label}  $${Number(i.amount || 0).toFixed(2)}`).join('\n')
          : 'None'
        const remainingAmt = netTotal - depositNum
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
              pax: paxStr,
              total_amount: formatCurrency(netTotal),
              deposit: depositNum > 0 ? formatCurrency(depositNum) : '—',
              remaining: remainingAmt > 0 ? formatCurrency(remainingAmt) : '$0.00',
              add_ons: addOnsStr,
              status: form.status.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
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
        const { error: lineErr } = await supabase.from('reservation_line_items').insert(
          validItems.map((item, i) => ({
            reservation_id: reservationId,
            label: item.label.trim(),
            amount: Number(item.amount) || 0,
            discount: Math.max(0, Number(item.discount) || 0),
            revenue_account_code: item.revenue_account_code || '4300',
            cost_amount: item.cost_amount !== '' && item.cost_amount != null ? Number(item.cost_amount) : null,
            cost_account_code: item.cost_amount !== '' && item.cost_amount != null ? (item.cost_account_code || '6000') : null,
            sort_order: i,
          }))
        )
        if (lineErr) toast(`Failed to save line items: ${lineErr.message}`, 'error')
      }
    }

    setSaving(false)
    setModalOpen(false)
    loadData()
  }

  async function handleNotify(res: any) {
    setNotifyingId(res.id)
    const adults = res.adults ?? 0
    const children = res.children ?? 0
    const paxStr = [
      adults > 0 ? `${adults} Adult${adults !== 1 ? 's' : ''}` : null,
      children > 0 ? `${children} Child${children !== 1 ? 'ren' : ''}` : null,
    ].filter(Boolean).join(', ') || `${res.pax_count ?? '—'} Pax`
    const total = res.total_amount ?? 0
    const dep = res.deposit ?? 0
    const remaining = total - dep
    const items: any[] = res.line_items ?? []
    const addOnsStr = items.length > 0
      ? items.map((i: any) => `• ${i.label}  $${Number(i.amount || 0).toFixed(2)}`).join('\n')
      : 'None'
    const response = await fetch('/api/telegram/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'new_reservation', branch_id: activeBranch?.id,
        data: {
          guest_name: (res.guest as any)?.full_name ?? res.guest_name,
          house_name: (res.house as any)?.name,
          check_in: res.check_in_date,
          check_out: res.check_out_date,
          reservation_number: res.reservation_number,
          pax: paxStr,
          total_amount: formatCurrency(total),
          deposit: dep > 0 ? formatCurrency(dep) : '—',
          remaining: remaining > 0 ? formatCurrency(remaining) : '$0.00',
          add_ons: addOnsStr,
          status: String(res.status ?? '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        },
      }),
    })
    const json = await response.json()
    if (json.ok) {
      toast(`Notification sent for ${res.reservation_number}`)
    } else {
      toast(json.error ?? 'Failed to send notification', 'error')
    }
    setNotifyingId(null)
  }

  function handleCancel(res: any) {
    const guestName = (res.guest as any)?.full_name ?? res.guest_name ?? 'this reservation'
    setConfirmDialog({
      title: 'Cancel Reservation',
      message: `Cancel ${guestName}'s reservation (${res.reservation_number})? Any held deposit will be marked for refund.`,
      confirmLabel: 'Cancel Reservation',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null)
        await supabase.from('reservations').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', res.id)
        // Find existing held receipt to know exact amount and method
        const { data: heldReceipt } = await supabase.from('deposit_receipts').select('*').eq('reservation_id', res.id).eq('status', 'held').maybeSingle()
        if (heldReceipt) {
          await supabase.from('deposit_receipts').update({
            status: 'refunded', updated_at: new Date().toISOString(),
          }).eq('id', heldReceipt.id)
          await createRefundJournalEntry(res.reservation_number, guestName, heldReceipt.amount, heldReceipt.payment_method)
        }
        fetch('/api/telegram/notify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'cancellation', branch_id: activeBranch?.id, data: {
            guest_name: (res.guest as any)?.full_name ?? res.guest_name,
            house_name: (res.house as any)?.name,
            reservation_number: res.reservation_number,
          }}),
        }).catch(() => {})
        toast('Reservation cancelled', 'info')
        loadData()
      },
    })
  }

  return (
    <>
      <TopBar title="Reservations" subtitle={`Manage bookings — ${activeBranch?.location ?? ''}`} />
      <div className="p-8 flex-1 section-enter">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Filters */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search guest or ref…"
            className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy w-48"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All Statuses' : capitalize(s.replace('_', ' '))}</option>
            ))}
          </select>
          <select
            value={houseFilter}
            onChange={e => setHouseFilter(e.target.value)}
            className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
          >
            <option value="all">All Properties</option>
            {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-hmuted whitespace-nowrap">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => {
                const v = e.target.value
                setDateFrom(v)
                if (v && viewMode === 'calendar') {
                  const d = new Date(v + 'T00:00:00')
                  d.setDate(1)
                  setCalMonth(d)
                }
              }}
              className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-hmuted whitespace-nowrap">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => {
                const v = e.target.value
                setDateTo(v)
                if (v && !dateFrom && viewMode === 'calendar') {
                  const d = new Date(v + 'T00:00:00')
                  d.setDate(1)
                  setCalMonth(d)
                }
              }}
              className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
            />
          </div>
          {(dateFrom || dateTo || houseFilter !== 'all' || statusFilter !== 'all' || search) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setHouseFilter('all'); setDateFrom(''); setDateTo('') }}
              className="text-xs text-hmuted hover:text-red-500 transition-colors px-2 py-2"
            >
              ✕ Clear
            </button>
          )}
          {/* Spacer */}
          <div className="flex-1" />
          {/* View toggle + action */}
          <div className="flex rounded-lg border border-hborder overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-navy text-white' : 'bg-white text-hmuted hover:bg-hbg'}`}
            >
              ☰ List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-2 text-xs font-medium transition-colors border-l border-hborder ${viewMode === 'calendar' ? 'bg-navy text-white' : 'bg-white text-hmuted hover:bg-hbg'}`}
            >
              ▦ Calendar
            </button>
          </div>
          <Button onClick={openCreate}>+ New Reservation</Button>
        </div>

        {/* ── LIST VIEW ── */}
        {viewMode === 'list' && (
          <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-hsurface2">
                    {['Ref', 'Guest', 'House', 'Check-in', 'Check-out', 'Pax', 'Add-ons', 'Total', 'Deposit', 'Remaining', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={12} className="px-5 py-10 text-center text-hmuted">Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={12} className="px-5 py-10 text-center text-hmuted">No reservations found</td></tr>
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
                        <td className="px-4 py-3 whitespace-nowrap">
                          {res.total_amount != null ? (() => {
                            const remaining = (res.total_amount ?? 0) - dep
                            return remaining > 0
                              ? <span className="text-red-600 font-medium">{formatCurrency(remaining)}</span>
                              : remaining === 0
                                ? <span className="text-green-700 font-medium">Paid</span>
                                : '—'
                          })() : '—'}
                        </td>
                        <td className="px-4 py-3"><Badge status={res.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 items-center">
                            <button onClick={() => openEdit(res)} className="text-xs text-navy hover:underline">Edit</button>
                            {!['cancelled', 'checked_out', 'no_show'].includes(res.status) && (
                              <button onClick={() => handleCancel(res)} className="text-xs text-red-500 hover:underline">Cancel</button>
                            )}
                            {/* Deposit receipt — shown only if a receipt exists */}
                            {((res as any).deposit_receipts ?? []).length > 0 && (
                              <button
                                onClick={() => setReceiptModalRes(res)}
                                title="View deposit receipt"
                                className="text-hmuted hover:text-green-600 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => handleNotify(res)}
                              disabled={notifyingId === res.id}
                              title="Resend Telegram notification"
                              className="text-hmuted hover:text-[#229ED9] disabled:opacity-40 transition-colors"
                            >
                              {notifyingId === res.id ? (
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                              ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z"/>
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CALENDAR / GRID VIEW ── */}
        {viewMode === 'calendar' && (() => {
          const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
          const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
          const todayStr = new Date().toISOString().slice(0, 10)

          const statusColor: Record<string, { bg: string; text: string; border: string }> = {
            confirmed:   { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
            checked_in:  { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
            pending:     { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
            checked_out: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
            cancelled:   { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
            no_show:     { bg: '#fdf4ff', text: '#7e22ce', border: '#d8b4fe' },
          }

          function toDStr(d: Date) {
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          }

          const visibleHouses = houseFilter === 'all' ? houses : houses.filter(h => h.id === houseFilter)

          // Determine which months to display
          const monthsToShow: Date[] = []
          if (dateFrom || dateTo) {
            const start = new Date((dateFrom || dateTo)! + 'T00:00:00')
            start.setDate(1)
            const end = new Date((dateTo || dateFrom)! + 'T00:00:00')
            const cur = new Date(start)
            while (cur <= end) {
              monthsToShow.push(new Date(cur))
              cur.setMonth(cur.getMonth() + 1)
            }
          } else {
            monthsToShow.push(new Date(calMonth))
          }

          // Reservations for a specific day (optionally filtered by status)
          function getDayRes(dayStr: string) {
            return visibleHouses.flatMap(house =>
              reservations
                .filter(r =>
                  r.house_id === house.id &&
                  r.check_in_date <= dayStr &&
                  r.check_out_date > dayStr &&
                  (statusFilter === 'all' || r.status === statusFilter)
                )
                .map(r => ({ house, r }))
            )
          }

          function renderMonth(mStart: Date) {
            const yr = mStart.getFullYear()
            const mo = mStart.getMonth()
            const dim = new Date(yr, mo + 1, 0).getDate()

            // ISO week: Mon=0 … Sun=6
            const firstDow = (new Date(yr, mo, 1).getDay() + 6) % 7
            const cells: (Date | null)[] = [
              ...Array(firstDow).fill(null),
              ...Array.from({ length: dim }, (_, i) => new Date(yr, mo, i + 1)),
            ]
            while (cells.length % 7 !== 0) cells.push(null)

            const weeks: (Date | null)[][] = []
            for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

            return (
              <div key={`${yr}-${mo}`} className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden mb-6">
                {/* Month title */}
                <div className="px-5 py-3 border-b border-hborder bg-hsurface2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-htext">{MONTH_NAMES[mo]} {yr}</h3>
                  <div className="flex items-center gap-3">
                    {Object.entries(statusColor).map(([s, c]) => (
                      <span key={s} className="flex items-center gap-1 text-[10px] font-medium whitespace-nowrap" style={{ color: c.text }}>
                        <span className="w-2 h-2 rounded-sm inline-block flex-none" style={{ background: c.bg, border: `1px solid ${c.border}` }} />
                        {capitalize(s.replace('_', ' '))}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Day-of-week header */}
                <div className="grid grid-cols-7 border-b border-hborder">
                  {DAY_LABELS.map(d => (
                    <div
                      key={d}
                      className={`py-2 text-center text-[11px] font-semibold uppercase tracking-wide border-r border-hborder last:border-r-0 ${
                        d === 'Sat' || d === 'Sun' ? 'text-amber-600 bg-amber-50/50' : 'text-hmuted bg-hsurface2'
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Week rows */}
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 border-b border-hborder last:border-b-0">
                    {week.map((day, di) => {
                      const isWeekend = di >= 5
                      if (!day) {
                        return (
                          <div
                            key={di}
                            className={`border-r border-hborder last:border-r-0 min-h-[90px] ${isWeekend ? 'bg-amber-50/20' : 'bg-hbg/30'}`}
                          />
                        )
                      }
                      const ds = toDStr(day)
                      const isToday = ds === todayStr
                      const entries = getDayRes(ds)
                      const holiday = khHolidays[ds] ?? null
                      return (
                        <div
                          key={di}
                          className={`border-r border-hborder last:border-r-0 min-h-[90px] p-1.5 ${
                            isToday
                              ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-300'
                              : isWeekend
                                ? 'bg-amber-50/30'
                                : 'bg-white'
                          }`}
                        >
                          {/* Date number */}
                          <div className="flex justify-end mb-1">
                            <span
                              className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                                isToday ? 'bg-blue-600 text-white' : isWeekend ? 'text-amber-600' : 'text-hmuted'
                              }`}
                            >
                              {day.getDate()}
                            </span>
                          </div>

                          {/* Cambodian public holiday tag */}
                          {holiday && (
                            <div
                              title={holiday}
                              className="w-full mb-[3px] px-1 py-[2px] rounded-[3px] text-[9px] font-semibold leading-tight truncate bg-red-50 text-red-700 border border-red-200"
                            >
                              🇰🇭 {holiday}
                            </div>
                          )}

                          {/* Reservation chips */}
                          <div className="space-y-[3px]">
                            {entries.map(({ house, r }) => {
                              const sc = statusColor[r.status] ?? statusColor.confirmed
                              const guestName = (r.guest as any)?.full_name ?? 'Guest'
                              const isCI = r.check_in_date === ds
                              const isCO = r.check_out_date === ds
                              return (
                                <button
                                  key={r.id}
                                  onClick={() => openEdit(r)}
                                  title={`${guestName} · ${formatDate(r.check_in_date)} → ${formatDate(r.check_out_date)}`}
                                  className="w-full text-left rounded-[4px] px-1.5 py-[3px] text-[10px] font-semibold leading-tight truncate block hover:opacity-80 transition-opacity"
                                  style={{ background: sc.bg, color: sc.text, border: `1.5px solid ${sc.border}` }}
                                >
                                  {isCI && <span className="mr-0.5 opacity-60">▶</span>}
                                  {isCO && <span className="mr-0.5 opacity-60">◀</span>}
                                  {guestName}
                                  {visibleHouses.length > 1 && (
                                    <span className="opacity-60 ml-1">· {house.name}</span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )
          }

          return (
            <div>
              {/* Nav bar — only when no date range set */}
              {!dateFrom && !dateTo && (
                <div className="flex items-center gap-2 mb-5">
                  <button
                    onClick={() => { const d = new Date(calMonth); d.setMonth(d.getMonth()-1); setCalMonth(d) }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-hborder bg-white text-hmuted hover:bg-hbg transition-colors"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setCalMonth(d) }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-hborder bg-white text-navy font-semibold hover:bg-hbg transition-colors"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => { const d = new Date(calMonth); d.setMonth(d.getMonth()+1); setCalMonth(d) }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-hborder bg-white text-hmuted hover:bg-hbg transition-colors"
                  >
                    Next →
                  </button>
                  <span className="text-xs text-hmuted ml-2">{MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}</span>
                </div>
              )}
              {dateFrom && dateTo && (
                <p className="text-xs text-hmuted mb-5">
                  Showing {monthsToShow.length} month{monthsToShow.length > 1 ? 's' : ''} · {formatDate(dateFrom)} → {formatDate(dateTo)}
                </p>
              )}

              {loading ? (
                <div className="bg-white border border-hborder rounded-2xl p-12 text-center text-hmuted text-sm">Loading…</div>
              ) : (
                monthsToShow.map(m => renderMonth(m))
              )}
            </div>
          )
        })()}
      </div>

      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message}
        confirmLabel={confirmDialog?.confirmLabel}
        variant={confirmDialog?.variant}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />

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
              <div className="space-y-2 pt-2 border-t border-hborder">
                {lineItems.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-hborder bg-white overflow-hidden">
                    {/* Row 1: description + price + delete */}
                    <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                      <input
                        value={item.label}
                        onChange={e => updateItem(idx, 'label', e.target.value)}
                        placeholder="Service description…"
                        className="flex-1 bg-hsurface2 border border-transparent rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-navy focus:bg-white transition-colors"
                      />
                      <div className="relative flex-shrink-0 w-28">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-hmuted text-sm pointer-events-none select-none">$</span>
                        <input
                          type="number" min={0} step={0.01}
                          value={item.amount}
                          onChange={e => updateItem(idx, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-6 pr-2 py-1.5 border border-hborder rounded-lg text-sm focus:outline-none focus:border-navy bg-hsurface2 focus:bg-white text-right transition-colors"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-hmuted hover:text-red-500 transition-colors rounded"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {/* Row 2: revenue acct · discount · cost acct · est. cost (spacer aligns with delete btn) */}
                    <div className="flex items-center gap-2 px-3 pb-2.5">
                      <select
                        value={item.revenue_account_code || '4300'}
                        onChange={e => updateItem(idx, 'revenue_account_code', e.target.value)}
                        className="flex-1 border border-hborder rounded-lg px-2.5 py-1 text-xs text-hmuted focus:outline-none focus:border-navy bg-hsurface2 cursor-pointer"
                      >
                        {revenueAccounts.map(r => <option key={r.code} value={r.code}>{r.code} {r.name}</option>)}
                      </select>
                      <div className="relative flex-shrink-0 w-20">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-orange-400 text-xs pointer-events-none select-none">-$</span>
                        <input
                          type="number" min={0} step={0.01}
                          value={item.discount || ''}
                          onChange={e => updateItem(idx, 'discount', e.target.value)}
                          placeholder="0"
                          className="w-full pl-6 pr-2 py-1 border border-orange-200 rounded-lg text-xs focus:outline-none focus:border-orange-400 bg-orange-50 text-orange-700 text-right"
                        />
                      </div>
                      <select
                        value={item.cost_account_code || '6000'}
                        onChange={e => updateItem(idx, 'cost_account_code', e.target.value)}
                        className="flex-1 border border-emerald-200 rounded-lg px-2.5 py-1 text-xs text-emerald-700 focus:outline-none focus:border-emerald-400 bg-emerald-50 cursor-pointer"
                      >
                        {costAccounts.map(c => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
                      </select>
                      <div className="relative flex-shrink-0 w-20">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-500 text-xs pointer-events-none select-none">$</span>
                        <input
                          type="number" min={0} step={0.01}
                          value={item.cost_amount || ''}
                          onChange={e => updateItem(idx, 'cost_amount', e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-5 pr-2 py-1 border border-emerald-200 rounded-lg text-xs focus:outline-none focus:border-emerald-400 bg-emerald-50 text-emerald-700 text-right"
                        />
                      </div>
                      <div className="w-6 flex-shrink-0" />
                    </div>
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
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-hmuted">
                        House — {nights} night{nights !== 1 ? 's' : ''} × {formatCurrency(selectedHouse.base_rate_per_night)}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-orange-400 text-xs">−$</span>
                          <input
                            type="number" min={0} step={0.01}
                            value={houseDiscount || ''}
                            onChange={e => setHouseDiscount(e.target.value)}
                            placeholder="0"
                            className="w-16 text-right border border-orange-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-orange-400 bg-orange-50 text-orange-700"
                          />
                        </div>
                        <span className="font-medium text-htext w-20 text-right">{formatCurrency(houseBase)}</span>
                      </div>
                    </div>
                  </>
                )}
                {lineItems.filter(i => i.label.trim()).map((item, idx) => {
                  const net = Math.max(0, Number(item.amount || 0) - Number(item.discount || 0))
                  const cost = item.cost_amount !== '' && item.cost_amount != null ? Number(item.cost_amount) : null
                  const actualLinked = item.id
                    ? linkedPettyCash.filter(p => p.reservation_line_item_id === item.id).reduce((s, p) => s + Number(p.amount), 0)
                    : 0
                  const hasActual = item.id ? linkedPettyCash.some(p => p.reservation_line_item_id === item.id) : false
                  const effectiveCost = hasActual ? actualLinked : cost
                  const margin = effectiveCost != null ? net - effectiveCost : null
                  const hasCostInfo = cost != null || hasActual
                  return (
                    <div key={idx} className="py-0.5">
                      <div className="flex justify-between items-baseline text-sm">
                        <span className="text-hmuted">{item.label}</span>
                        <div className="flex items-baseline gap-3">
                          {margin != null && (
                            <span className={`text-xs ${margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {margin >= 0 ? '+' : ''}{formatCurrency(margin)}
                            </span>
                          )}
                          <span className="font-medium text-htext w-20 text-right">{formatCurrency(net)}</span>
                        </div>
                      </div>
                      {hasCostInfo && (
                        <div className="flex justify-end items-center gap-2 text-xs mt-0.5">
                          {cost != null && <span className="text-hmuted">est. {formatCurrency(cost)}</span>}
                          {hasActual && cost != null && <span className="text-hmuted">·</span>}
                          {hasActual && <span className="text-emerald-600 font-medium">actual {formatCurrency(actualLinked)}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}

                {(addOnsCost > 0 || totalActual > 0) && (
                  <div className="flex justify-between items-center text-xs bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-100 mt-1">
                    <span className="text-emerald-700 font-medium">Service Cost</span>
                    <div className="flex items-center gap-4">
                      {addOnsCost > 0 && <span className="text-hmuted">est. −{formatCurrency(addOnsCost)}</span>}
                      {totalActual > 0 && <span className="text-emerald-700 font-semibold">actual −{formatCurrency(totalActual)}</span>}
                      {addOnsMarginPct != null && <span className="text-emerald-600">· {addOnsMarginPct}% margin</span>}
                    </div>
                  </div>
                )}

                {totalItemDiscounts > 0 ? (
                  <>
                    <div className="flex justify-between text-sm border-t border-hborder pt-2 mt-1">
                      <span className="text-hmuted">Gross Subtotal</span>
                      <span className="text-htext">{formatCurrency(grossSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-orange-600">Item Discounts</span>
                      <span className="text-orange-600 font-medium">−{formatCurrency(totalItemDiscounts)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-hborder pt-1.5">
                      <span className="text-hmuted">Subtotal</span>
                      <span className="font-semibold text-dark-navy">{formatCurrency(subtotal)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-sm border-t border-hborder pt-2 mt-1">
                    <span className="text-hmuted">Subtotal</span>
                    <span className="font-semibold text-dark-navy">{formatCurrency(subtotal)}</span>
                  </div>
                )}

                {/* Discount */}
                <div className="flex items-center justify-between text-sm gap-2">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-hmuted">Discount</span>
                    <input
                      value={discountLabel}
                      onChange={e => setDiscountLabel(e.target.value)}
                      placeholder="reason…"
                      className="text-xs border border-hborder rounded px-2 py-0.5 w-24 focus:outline-none focus:border-navy bg-hbg text-hmuted"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-red-400 text-xs">−$</span>
                    <input
                      type="number" min={0} step={0.01}
                      value={discountAmount}
                      onChange={e => setDiscountAmount(e.target.value)}
                      placeholder="0"
                      className="w-20 text-right border border-hborder rounded-md px-2 py-0.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                    />
                  </div>
                </div>

                {discountNum > 0 && (
                  <div className="flex justify-between text-sm border-t border-hborder pt-1.5">
                    <span className="text-hmuted font-medium">Total (after discount)</span>
                    <span className="font-semibold text-dark-navy">{formatCurrency(netTotal)}</span>
                  </div>
                )}

                {/* Deposit inline input */}
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-hmuted shrink-0">Deposit Paid</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={depositMethod}
                      onChange={e => setDepositMethod(e.target.value)}
                      className="border border-hborder rounded-md px-2 py-0.5 text-xs focus:outline-none focus:border-navy bg-hbg text-htext"
                    >
                      {paymentMethods.length > 0
                        ? paymentMethods.map(pm => (
                            <option key={pm.value} value={pm.value}>{pm.name}</option>
                          ))
                        : (
                            <>
                              <option value="cash">Cash</option>
                              <option value="bank_transfer">Bank Transfer</option>
                              <option value="aba_pay">ABA Pay</option>
                              <option value="wing">Wing</option>
                              <option value="bakong">Bakong</option>
                              <option value="online">Online (OTA)</option>
                              <option value="other">Other</option>
                            </>
                          )
                      }
                    </select>
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

      {/* ── Deposit Receipt Modal ── */}
      {receiptModalRes && (() => {
        const receipts: DepositReceipt[] = (receiptModalRes as any).deposit_receipts ?? []
        const receipt = receipts[receipts.length - 1] // most recent
        if (!receipt) return null
        const guest = (receiptModalRes as any).guest
        const house = (receiptModalRes as any).house
        const statusColor: Record<string, string> = {
          held: 'bg-yellow-100 text-yellow-700',
          applied: 'bg-green-100 text-green-700',
          refunded: 'bg-red-100 text-red-600',
        }
        const methodLabel: Record<string, string> = {
          cash: 'Cash', bank_transfer: 'Bank Transfer', aba_pay: 'ABA Pay',
          wing: 'Wing', bakong: 'Bakong', online: 'Online (OTA)', other: 'Other',
          ...(Object.fromEntries(paymentMethods.map(pm => [pm.value, pm.name])))
        }
        function printDepositReceipt() {
          const content = document.getElementById('deposit-receipt-printable')?.innerHTML ?? ''
          const w = window.open('', '_blank', 'width=680,height=860')
          if (!w) return
          w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Deposit Receipt ${receipt.receipt_number}</title>
          <style>
            *{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#1a1a2e;padding:40px;max-width:620px;margin:0 auto}
            .hdr{background:#1a1a2e;color:#fff;padding:22px 28px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center}
            .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600}
            .body{border:1px solid #e8edf3;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px}
            .row{display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid #f0f4f8}
            .row:last-child{border:none}
            .label{color:#6b7280}.val{font-weight:600;color:#1a1a2e}
            .total-row{background:#f8fafc;padding:14px 16px;border-radius:8px;margin:16px 0;display:flex;justify-content:space-between;align-items:center}
            .note{font-size:12px;color:#6b7280;margin-top:16px;border-top:1px dashed #e8edf3;padding-top:14px}
            @media print{body{padding:0}}
          </style></head><body>${content}</body></html>`)
          w.document.close(); w.focus(); setTimeout(() => w.print(), 400)
        }
        return (
          <Modal open={true} onClose={() => setReceiptModalRes(null)} title="Deposit Receipt" size="md">
            <div className="flex justify-end gap-2 mb-4">
              <Button variant="ghost" onClick={() => setReceiptModalRes(null)}>Close</Button>
              <Button onClick={printDepositReceipt}>Print / Save PDF</Button>
            </div>
            <div id="deposit-receipt-printable">
              {/* Header */}
              <div style={{ background: '#1a1a2e', borderRadius: '12px 12px 0 0', padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#c89b3c', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>Deposit Receipt</div>
                  <div style={{ color: '#a0aec0', fontSize: 11, marginTop: 3 }}>{activeBranch?.location ?? ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#c89b3c' }}>{receipt.receipt_number}</div>
                  <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 2 }}>{receipt.receipt_date}</div>
                </div>
              </div>
              {/* Body */}
              <div style={{ border: '1px solid #e8edf3', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '24px 28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#9ca3af', marginBottom: 4 }}>Guest</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{guest?.full_name ?? '—'}</p>
                    {guest?.phone && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{guest.phone}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#9ca3af', marginBottom: 4 }}>Property</p>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{house?.name ?? '—'}</p>
                    <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{formatDate(receiptModalRes.check_in_date)} → {formatDate(receiptModalRes.check_out_date)}</p>
                  </div>
                </div>
                {/* Details */}
                {[
                  ['Reservation Ref', receiptModalRes.reservation_number],
                  ['Payment Method', methodLabel[receipt.payment_method] ?? receipt.payment_method],
                  ['Receipt Date', receipt.receipt_date],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f0f4f8' }}>
                    <span style={{ color: '#6b7280' }}>{l}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
                {/* Financial summary */}
                {(() => {
                  const netTotal = Number(receiptModalRes.total_amount ?? 0)
                  const discount = Number((receiptModalRes as any).discount_amount ?? 0)
                  const discLabel = (receiptModalRes as any).discount_label
                  const grossTotal = netTotal + discount
                  const remaining = netTotal - receipt.amount
                  const rowStyle = { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f0f4f8' } as React.CSSProperties
                  return (
                    <div style={{ margin: '16px 0' }}>
                      {discount > 0 && (
                        <div style={rowStyle}>
                          <span style={{ color: '#6b7280' }}>Subtotal</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(grossTotal)}</span>
                        </div>
                      )}
                      {discount > 0 && (
                        <div style={rowStyle}>
                          <span style={{ color: '#6b7280' }}>Discount{discLabel ? ` (${discLabel})` : ''}</span>
                          <span style={{ fontWeight: 600, color: '#dc2626' }}>−{formatCurrency(discount)}</span>
                        </div>
                      )}
                      <div style={{ ...rowStyle, borderBottom: '2px solid #1a1a2e', paddingBottom: 10, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, color: '#1a1a2e' }}>Total Amount</span>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}>{formatCurrency(netTotal)}</span>
                      </div>
                      <div style={{ background: '#f0fdf4', padding: '12px 14px', borderRadius: 8, margin: '12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Deposit Received</span>
                        <span style={{ fontSize: 20, fontWeight: 800, color: '#1a7a4a' }}>{formatCurrency(receipt.amount)}</span>
                      </div>
                      <div style={{ ...rowStyle, borderBottom: 'none', paddingTop: 4 }}>
                        <span style={{ fontWeight: 700, color: remaining > 0 ? '#b91c1c' : '#1a7a4a' }}>
                          {remaining > 0 ? 'Balance Due at Checkout' : 'Fully Paid'}
                        </span>
                        <span style={{ fontWeight: 800, fontSize: 15, color: remaining > 0 ? '#b91c1c' : '#1a7a4a' }}>
                          {remaining > 0 ? formatCurrency(remaining) : '—'}
                        </span>
                      </div>
                    </div>
                  )
                })()}
                {/* Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingTop: 4, borderTop: '1px solid #f0f4f8' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>Deposit Status</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusColor[receipt.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {receipt.status === 'held' ? '🟡 Held — pending checkout' : receipt.status === 'applied' ? '✅ Applied to invoice' : '↩ Refunded'}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#6b7280', marginTop: 16, borderTop: '1px dashed #e8edf3', paddingTop: 14 }}>
                  {receipt.status === 'held'
                    ? `This deposit will be applied toward your invoice upon checkout on ${formatDate(receiptModalRes.check_out_date)}.`
                    : receipt.status === 'refunded'
                    ? 'This deposit has been marked for refund due to cancellation.'
                    : 'This deposit has been applied to the final invoice.'}
                </p>
              </div>
            </div>
          </Modal>
        )
      })()}
    </>
  )
}
