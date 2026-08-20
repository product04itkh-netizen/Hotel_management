'use client'
import { Fragment, useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import { formatDate, calculateNights, calculateNightlyTotal, generateReservationNumber, formatCurrency, capitalize, generateJournalEntryNumber, formatTime12h, branchLogo, branchBrandLabel, todayISO } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import type { Reservation, House, HousePromotion, DepositReceipt, ServiceCatalogItem } from '@/types'

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




interface LineItemForm {
  id?: string
  label: string
  qty: number | string
  unit_price: number | string
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
  const { activeBranch, hotelSettings } = useBranch()
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
  const [housePromotions, setHousePromotions] = useState<HousePromotion[]>([])
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogItem[]>([])
  const [chargesModalRes, setChargesModalRes] = useState<Reservation | null>(null)
  const [originalTotalAmount, setOriginalTotalAmount] = useState<number | null>(null)

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

  useEffect(() => {
    if (!form.house_id || !activeBranch) { setHousePromotions([]); return }
    supabase.from('house_promotions').select('*')
      .eq('house_id', form.house_id).eq('is_active', true)
      .then(({ data }) => setHousePromotions((data ?? []) as HousePromotion[]))
  }, [form.house_id, activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const [resRes, houseRes, revAcctRes, costAcctRes, catalogRes] = await Promise.all([
      supabase.from('reservations')
        .select('*, guest:guests(full_name, email, phone), house:houses(name, code, house_type, base_rate_per_night), line_items:reservation_line_items(id, label, qty, unit_price, amount, discount, revenue_account_code, cost_amount, cost_account_code, sort_order), deposit_receipts(id, receipt_number, amount, payment_method, receipt_date, status)')
        .eq('branch_id', activeBranch.id)
        .order('check_in_date', { ascending: false }),
      supabase.from('houses')
        .select('*')
        .eq('branch_id', activeBranch.id)
        .order('name'),
      supabase.from('chart_of_accounts').select('code, name').eq('branch_id', activeBranch.id).eq('is_active', true).eq('type', 'revenue').order('code'),
      supabase.from('chart_of_accounts').select('code, name').eq('branch_id', activeBranch.id).eq('is_active', true).eq('type', 'expense').order('code'),
      supabase.from('service_catalog_items').select('*').eq('branch_id', activeBranch.id).eq('is_active', true).order('category').order('sort_order'),
    ])
    setReservations((resRes.data ?? []) as unknown as Reservation[])
    setHouses((houseRes.data ?? []) as unknown as House[])
    setRevenueAccounts((revAcctRes.data ?? []) as {code: string, name: string}[])
    setCostAccounts((costAcctRes.data ?? []) as {code: string, name: string}[])
    setServiceCatalog((catalogRes.data ?? []) as ServiceCatalogItem[])
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
    setArrivalTime(hotelSettings?.check_in_time ?? '')
    setLinkedPettyCash([])
    setOriginalTotalAmount(null)
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
        .map(i => ({ id: i.id, label: i.label, qty: i.qty ?? 1, unit_price: i.unit_price ?? '', amount: i.amount, discount: i.discount ?? 0, revenue_account_code: i.revenue_account_code ?? '4300', cost_amount: i.cost_amount ?? '', cost_account_code: i.cost_account_code ?? '6000' }))
    )
    setDeposit(res.deposit ?? 0)
    setDepositMethod((res as any).deposit_method ?? 'cash')
    setDiscountAmount((res as any).discount_amount ?? 0)
    setDiscountLabel((res as any).discount_label ?? '')
    setHouseDiscount((res as any).house_discount ?? 0)
    setPaxCount(res.pax_count ?? '')
    setArrivalTime(res.arrival_time ?? '')
    setLinkedPettyCash([])
    setOriginalTotalAmount(res.total_amount ?? null)
    if (res.id) loadLinkedPettyCash(res.id)
    setModalOpen(true)
  }

  function addPreset(item: ServiceCatalogItem) {
    if (lineItems.some(i => i.label === item.name_en)) {
      toast(`${item.name_en} already added`, 'info'); return
    }
    setLineItems(prev => [...prev, { label: item.name_en, qty: 1, unit_price: item.unit_price, amount: item.unit_price, discount: 0, revenue_account_code: item.revenue_account_code, cost_amount: '', cost_account_code: item.cost_account_code }])
  }

  function updateItem(idx: number, field: 'label' | 'amount' | 'discount' | 'revenue_account_code' | 'cost_amount' | 'cost_account_code', value: string | number) {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function updateQty(idx: number, qty: number) {
    setLineItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const q = Math.max(1, Math.round(qty) || 1)
      const unitPrice = item.unit_price !== '' && item.unit_price != null ? Number(item.unit_price) : null
      return { ...item, qty: q, amount: unitPrice != null ? Math.round(unitPrice * q * 100) / 100 : item.amount }
    }))
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

    // The deposit JE must be dated when the deposit was RECEIVED (the receipt
    // date), not "now". This function reruns on every reservation edit — using
    // today's date silently re-dated the deposit JE to the edit/checkout/invoice
    // date each time, misstating which period the cash landed in. Source the
    // date from the receipt; preserve an existing JE's date as a fallback.
    const { data: resRow } = await supabase.from('reservations').select('id').eq('reservation_number', resNum).eq('branch_id', activeBranch.id).maybeSingle()
    const { data: receipt } = resRow
      ? await supabase.from('deposit_receipts').select('receipt_date').eq('reservation_id', resRow.id).order('receipt_date', { ascending: true }).limit(1).maybeSingle()
      : { data: null }

    // ── Guard ──
    // This keeps exactly ONE deposit entry per reservation, rebuilt from the
    // amount passed in. deposit_receipts, though, allows several receipts per
    // reservation with independent held/applied/refunded statuses. When a
    // second deposit is taken after the first has been applied, the single
    // entry can't represent both and the newly held one silently ends up with
    // no liability posting — the ledger then understates guest deposits.
    // Nothing errors when that happens, so say so at the moment it is created.
    if (resRow) {
      const { data: allReceipts } = await supabase.from('deposit_receipts')
        .select('amount, status').eq('reservation_id', resRow.id)
      const held = (allReceipts ?? []).filter(r => r.status === 'held')
      const heldSum = held.reduce((s, r) => s + Number(r.amount), 0)
      if ((allReceipts?.length ?? 0) > 1 && Math.abs(heldSum - depositAmt) > 0.005) {
        toast(
          `Heads up: ${resNum} has ${allReceipts!.length} deposit receipts (${formatCurrency(heldSum)} still held) but the ` +
          `ledger entry is being written for ${formatCurrency(depositAmt)}. Check Guest Deposits (2200) in Reports — ` +
          `it may need a correcting entry.`,
          'error',
        )
      }
    }

    const { data: existingJes } = await supabase.from('journal_entries').select('id, entry_date').eq('reference', resNum).eq('reference_type', 'deposit')
    const priorDate = existingJes && existingJes.length > 0 ? existingJes[0].entry_date : null
    const depositDate = receipt?.receipt_date || priorDate || todayISO()
    if (existingJes && existingJes.length > 0) {
      const jeIds = existingJes.map(je => je.id)
      await supabase.from('journal_entry_lines').delete().in('entry_id', jeIds)
      await supabase.from('journal_entries').delete().in('id', jeIds)
    }

    if (depositAmt > 0) {
      const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
        entry_number: generateJournalEntryNumber(),
        entry_date: depositDate,
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
      entry_date: todayISO(),
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
  const nightlyResult = selectedHouse && form.check_in_date && form.check_out_date && nights > 0
    ? calculateNightlyTotal(form.check_in_date, form.check_out_date, selectedHouse.base_rate_per_night, housePromotions)
    : null
  const houseGross = nightlyResult?.total ?? 0
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
      //
      // A new receipt is only written when the deposit exceeds what has ALREADY
      // been receipted for this reservation. This used to create one whenever
      // there was no 'held' receipt — so re-saving a reservation whose deposit
      // had already been applied to an invoice minted a fresh held receipt for
      // money the guest never paid a second time. DR-KAM-202608-005 came from
      // exactly that: $250 already receipted and applied, the reservation
      // edited at checkout, and a phantom $250 "held" receipt created against
      // a fully-settled invoice.
      const { data: allReceipts } = await supabase
        .from('deposit_receipts').select('id, amount, status, payment_method').eq('reservation_id', editId)
      const existingReceipt = (allReceipts ?? []).find(r => r.status === 'held') ?? null
      const alreadyReceipted = (allReceipts ?? [])
        .filter(r => r.id !== existingReceipt?.id)
        .reduce((s, r) => s + Number(r.amount), 0)

      if (depositNum > 0) {
        if (existingReceipt) {
          // The held receipt covers whatever the other receipts don't.
          const target = Math.round((depositNum - alreadyReceipted) * 100) / 100
          if (target > 0.005) {
            await supabase.from('deposit_receipts').update({
              amount: target, payment_method: depositMethod, updated_at: new Date().toISOString(),
            }).eq('id', existingReceipt.id)
          }
        } else if (depositNum - alreadyReceipted > 0.005) {
          // Genuinely more deposit than has been receipted — receipt the difference only.
          const receiptNum = await generateDepositReceiptNumber()
          await supabase.from('deposit_receipts').insert({
            receipt_number: receiptNum, reservation_id: editId, branch_id: activeBranch.id,
            amount: Math.round((depositNum - alreadyReceipted) * 100) / 100,
            payment_method: depositMethod,
            receipt_date: todayISO(), status: 'held',
          })
        }
        // else: the deposit is already fully receipted — nothing to create.
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
          receipt_date: todayISO(),
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
            qty: Math.max(1, Number(item.qty) || 1),
            unit_price: item.unit_price !== '' && item.unit_price != null ? Number(item.unit_price) : null,
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

  async function handleCancelAndVoid(res: any) {
    if (!activeBranch) return
    const guestName = (res.guest as any)?.full_name ?? res.guest_name ?? 'Guest'

    const [{ data: invoices }, { data: activeReceipts }, { data: pettyCash }, { data: checkInJes }, { data: depositJes }] = await Promise.all([
      supabase.from('invoices').select('id, invoice_number, total, status').eq('reservation_id', res.id),
      // Every still-active deposit receipt for this reservation. 'held' = never
      // applied; 'applied' = consumed by an invoice that's about to be voided.
      // Both are unwound on cancel. NOTE: NOT .maybeSingle() — a reservation can
      // carry more than one receipt, and maybeSingle() silently returned null on
      // 2+ rows, skipping the entire refund/void path.
      supabase.from('deposit_receipts').select('*').eq('reservation_id', res.id).in('status', ['held', 'applied']),
      supabase.from('petty_cash_transactions').select('id').eq('reservation_id', res.id),
      // Check-in posts a revenue-recognition JE (DR Accounts Receivable / CR
      // Revenue) keyed to the reservation number, not the invoice number —
      // the invoice-voiding loop below never sees it, so it was never reversed.
      supabase.from('journal_entries').select('id').eq('reference', res.reservation_number).eq('reference_type', 'check_in').eq('branch_id', activeBranch.id).eq('is_void', false),
      // The deposit-received JE (DR Cash / CR Guest Deposits), keyed to the
      // reservation number. Was never voided on cancel, leaving the cash and
      // deposit-liability sitting on the balance sheet for a dead reservation.
      supabase.from('journal_entries').select('id').eq('reference', res.reservation_number).eq('reference_type', 'deposit').eq('branch_id', activeBranch.id).eq('is_void', false),
    ])

    const activeInvoices = (invoices ?? []).filter((inv: any) => !['void', 'refunded'].includes(inv.status))
    const depositReceipts = activeReceipts ?? []
    const depositTotal = depositReceipts.reduce((s: number, r: any) => s + Number(r.amount), 0)
    const pcCount = (pettyCash ?? []).length
    const checkInJeIds = (checkInJes ?? []).map((j: any) => j.id)
    const depositJeIds = (depositJes ?? []).map((j: any) => j.id)

    const lines: string[] = [
      `Reservation ${res.reservation_number} — ${guestName} will be cancelled.`,
    ]
    if (depositReceipts.length > 0) lines.push(`Deposit ${formatCurrency(depositTotal)} will be reversed (deposit entr${depositJeIds.length === 1 ? 'y' : 'ies'} voided).`)
    for (const inv of activeInvoices) {
      lines.push(`Invoice ${inv.invoice_number} (${formatCurrency(inv.total)}) will be voided.`)
    }
    if (pcCount > 0) lines.push(`${pcCount} petty cash transaction${pcCount > 1 ? 's' : ''} will be unlinked.`)
    if (checkInJeIds.length > 0) lines.push('Check-in revenue recognition will be reversed.')
    if (res.status === 'checked_in') lines.push(`⚠️  Guest is currently checked in — the house will be released back to available.`)
    lines.push('\nThis action cannot be undone.')

    setConfirmDialog({
      title: 'Cancel & Void Reservation',
      message: lines.join('\n'),
      confirmLabel: 'Confirm Cancel & Void',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null)

        await supabase.from('reservations')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', res.id)

        if (depositReceipts.length > 0) {
          await supabase.from('deposit_receipts')
            .update({ status: 'refunded', updated_at: new Date().toISOString() })
            .in('id', depositReceipts.map((r: any) => r.id))
        }
        // Void the deposit-received JE(s) so the cash + deposit liability they
        // recorded stop counting — same treatment as the invoice/check-in JEs
        // below. (A cancelled reservation should leave no financial footprint.)
        if (depositJeIds.length > 0) {
          await supabase.from('journal_entries')
            .update({ is_void: true, voided_at: new Date().toISOString() })
            .in('id', depositJeIds)
        }

        for (const inv of activeInvoices) {
          await supabase.from('invoices')
            .update({ status: 'void', updated_at: new Date().toISOString() })
            .eq('id', inv.id)
          // Every JE tied to this invoice — payment, deposit-applied, or a
          // prior correction — shares the same `reference`, regardless of
          // reference_type. Voiding only 'invoice'-type JEs left deposit_applied
          // entries still posted and counting in reports after the invoice
          // itself showed void.
          await supabase.from('journal_entries')
            .update({ is_void: true, voided_at: new Date().toISOString() })
            .eq('reference', inv.invoice_number)
            .eq('branch_id', activeBranch.id)
            .eq('is_void', false)
        }

        if (checkInJeIds.length > 0) {
          await supabase.from('journal_entries')
            .update({ is_void: true, voided_at: new Date().toISOString() })
            .in('id', checkInJeIds)
        }

        if (pcCount > 0) {
          await supabase.from('petty_cash_transactions')
            .update({ reservation_id: null, reservation_line_item_id: null })
            .eq('reservation_id', res.id)
        }

        // Release the house — but only if no OTHER checked-in reservation is
        // also currently claiming it (guards against a double-booking edge case).
        if (res.status === 'checked_in' && res.house_id) {
          const { data: otherActive } = await supabase.from('reservations')
            .select('id').eq('house_id', res.house_id).eq('status', 'checked_in').neq('id', res.id).limit(1)
          if (!otherActive || otherActive.length === 0) {
            await supabase.from('houses').update({ status: 'available', updated_at: new Date().toISOString() }).eq('id', res.house_id)
          }
        }

        fetch('/api/telegram/notify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'cancellation', branch_id: activeBranch?.id, data: {
            guest_name: guestName,
            house_name: (res.house as any)?.name,
            reservation_number: res.reservation_number,
          }}),
        }).catch(() => {})

        toast('Reservation cancelled & voided', 'info')
        loadData()
      },
    })
  }

  return (
    <>
      <TopBar title="Reservations" subtitle={`Manage bookings — ${activeBranch?.location ?? ''}`} />
      <div className="p-4 sm:p-6 lg:p-8 flex-1 section-enter">

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
                    {['Ref', 'Guest', 'House', 'Check-in', 'Check-out', 'Pax', 'Total', 'Discount', 'Deposit', 'Due', 'Status', 'Actions'].map(h => (
                      <th key={h} className={`px-2.5 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap ${['Total', 'Discount', 'Deposit', 'Due'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={12} className="px-5 py-10 text-center text-hmuted">Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={12} className="px-5 py-10 text-center text-hmuted">No reservations found</td></tr>
                  ) : filtered.map(res => {
                    const items = res.line_items ?? []
                    const dep = res.deposit ?? 0
                    const pax = res.pax_count
                    const netOf = (li: typeof items[number]) => Number(li.amount || 0) - Number(li.discount || 0)
                    const addOnsNet = items.reduce((s, li) => s + netOf(li), 0)
                    const houseDiscount = Number((res as any).house_discount || 0)
                    const itemDiscounts = items.reduce((s, li) => s + Number(li.discount || 0), 0)
                    const overallDiscount = Number(res.discount_amount || 0)
                    const totalDiscount = houseDiscount + itemDiscounts + overallDiscount
                    return (
                      <tr key={res.id} className="border-t border-hborder hover:bg-hbg/40 transition-colors">
                        <td className="px-2.5 py-2 h-[52px] align-middle font-mono text-xs text-hmuted whitespace-nowrap">{res.reservation_number}</td>
                        <td className="px-2.5 py-2 h-[52px] align-middle max-w-[150px]">
                          <p className="font-medium text-htext truncate text-xs" title={(res.guest as any)?.full_name ?? undefined}>{(res.guest as any)?.full_name ?? '—'}</p>
                          <p className="text-[11px] text-hmuted truncate">{(res.guest as any)?.phone ?? ''}</p>
                        </td>
                        <td className="px-2.5 py-2 h-[52px] align-middle text-hmuted text-xs font-mono whitespace-nowrap" title={(res.house as any)?.name ?? undefined}>{(res.house as any)?.code || (res.house as any)?.name || '—'}</td>
                        <td className="px-2.5 py-2 h-[52px] align-middle text-hmuted text-xs whitespace-nowrap">{formatDate(res.check_in_date)}</td>
                        <td className="px-2.5 py-2 h-[52px] align-middle text-hmuted text-xs whitespace-nowrap">{formatDate(res.check_out_date)}</td>
                        <td className="px-2.5 py-2 h-[52px] align-middle text-hmuted text-xs whitespace-nowrap">{pax != null ? pax : res.adults}</td>
                        <td className="px-2.5 py-2 h-[52px] align-middle text-right text-xs font-semibold tabular-nums text-htext whitespace-nowrap">
                          {res.total_amount == null ? '—' : formatCurrency(res.total_amount)}
                        </td>
                        <td className="px-2.5 py-2 h-[52px] align-middle text-right text-xs tabular-nums whitespace-nowrap">
                          {totalDiscount > 0 ? <span className="text-orange-600">−{formatCurrency(totalDiscount)}</span> : <span className="text-hmuted">—</span>}
                        </td>
                        <td className="px-2.5 py-2 h-[52px] align-middle text-right text-xs tabular-nums whitespace-nowrap">
                          {dep > 0 ? <span className="text-green-700 font-medium">{formatCurrency(dep)}</span> : <span className="text-hmuted">—</span>}
                        </td>
                        <td className="px-2.5 py-2 h-[52px] align-middle text-right text-xs whitespace-nowrap">
                          {res.total_amount != null ? (() => {
                            const remaining = (res.total_amount ?? 0) - dep
                            if (res.total_amount === 0 && dep === 0) return <span className="text-hmuted">—</span>
                            if (remaining <= 0) return <span className="font-medium text-green-700">Paid</span>
                            return <span className="text-red-600 font-medium">{formatCurrency(remaining)}</span>
                          })() : '—'}
                        </td>
                        <td className="px-2.5 py-2 h-[52px] align-middle"><Badge status={res.status} /></td>
                        <td className="px-2.5 py-2 h-[52px] align-middle whitespace-nowrap">
                          <div className="flex gap-3 items-center">
                            <div className="flex gap-2.5 items-center flex-shrink-0">
                              <button onClick={() => openEdit(res)} title="Edit reservation" className="text-hmuted hover:text-navy transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                              </button>
                              {!['cancelled', 'checked_out', 'no_show'].includes(res.status) && (
                                <button onClick={() => handleCancelAndVoid(res)} title="Cancel & void reservation" className="text-hmuted hover:text-red-600 transition-colors">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 105.636 5.636a9 9 0 0012.728 12.728zM5.636 5.636l12.728 12.728" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <div className="w-px h-4 bg-hborder flex-shrink-0" />
                            <div className="flex gap-2.5 items-center flex-shrink-0">
                              {(items.length > 0 || addOnsNet > 0) && (
                                <button
                                  onClick={() => setChargesModalRes(res)}
                                  title="View charges breakdown"
                                  className="text-hmuted hover:text-navy transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01" />
                                  </svg>
                                </button>
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
          const todayStr = todayISO()

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

                <div className="overflow-x-auto">
                <div className="min-w-[640px]">
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
                </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="col-span-1 sm:col-span-2">
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-1 sm:col-span-3">
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
                {(hotelSettings?.check_in_time || hotelSettings?.check_out_time) && (
                  <p className="text-[10px] text-hmuted mt-1">
                    Standard: check-in {formatTime12h(hotelSettings?.check_in_time)} · check-out {formatTime12h(hotelSettings?.check_out_time)}
                  </p>
                )}
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

            {/* Quick-add catalog chips */}
            {(['activity', 'fnb'] as const).map(cat => {
              const items = serviceCatalog.filter(i => i.category === cat)
              if (items.length === 0) return null
              return (
                <div key={cat} className="space-y-1">
                  <p className="text-[10px] font-semibold text-hmuted/80 uppercase tracking-wide">
                    {cat === 'activity' ? 'Activities & Services' : 'Food & Beverage'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map(p => {
                      const added = lineItems.some(i => i.label === p.name_en)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addPreset(p)}
                          title={[p.name_kh, p.details].filter(Boolean).join(' · ') || undefined}
                          className={[
                            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all',
                            added
                              ? 'border-navy/40 bg-navy/8 text-navy cursor-default'
                              : 'border-hborder bg-hsurface2 text-htext hover:bg-white hover:border-navy/50',
                          ].join(' ')}
                        >
                          <span>{cat === 'activity' ? '🎯' : '🍽️'}</span>
                          <span>{p.name_en}</span>
                          <span className="text-hmuted/70">{formatCurrency(p.unit_price)}</span>
                          {added && <span className="text-navy/60">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

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
                      <div className="relative flex-shrink-0 w-16">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-hmuted text-[10px] pointer-events-none select-none">Qty</span>
                        <input
                          type="number" min={1} step={1}
                          value={item.qty}
                          onChange={e => updateQty(idx, Number(e.target.value))}
                          title="Quantity"
                          className="w-full pl-8 pr-2 py-1.5 border border-hborder rounded-lg text-sm focus:outline-none focus:border-navy bg-hsurface2 focus:bg-white text-right transition-colors"
                        />
                      </div>
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
              {editId && originalTotalAmount != null && Math.abs(netTotal - originalTotalAmount) > 0.01 && (
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
                  ⚠ Saved total for this booking is <strong>{formatCurrency(originalTotalAmount)}</strong>, but recalculates to <strong>{formatCurrency(netTotal)}</strong> at today's rates — the house rate (or a promo) has changed since this reservation was made. Saving will overwrite the total to {formatCurrency(netTotal)} unless you adjust the discount below to preserve the original price.
                </div>
              )}
              <div className="px-4 py-3 space-y-1.5 bg-white">
                {selectedHouse && nights > 0 && nightlyResult && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-hmuted">
                        House — {nights} night{nights !== 1 ? 's' : ''}
                        {!nightlyResult.hasPromo && ` × ${formatCurrency(selectedHouse.base_rate_per_night)}`}
                        {nightlyResult.hasPromo && (
                          <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">promo</span>
                        )}
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
                    {nightlyResult.hasPromo && (
                      <div className="pl-2 border-l-2 border-amber-200 ml-1 space-y-0.5">
                        {nightlyResult.groups.map((g, i) => (
                          <div key={i} className="flex justify-between items-center text-xs text-hmuted">
                            <span>
                              {g.nights}n × {formatCurrency(g.rate)}
                              {g.promoName && <span className="ml-1 text-amber-600 font-medium">({g.promoName})</span>}
                            </span>
                            <span className="tabular-nums">{formatCurrency(g.nights * g.rate)}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
                        ? paymentMethods.map(pm => {
                            const code = (pm as any).account_code || (pm.is_cash ? '1010' : '1020')
                            return <option key={pm.value} value={pm.value}>{code} — {pm.name}</option>
                          })
                        : (
                            <>
                              <option value="cash">1010 — Cash</option>
                              <option value="bank_transfer">1020 — Bank Transfer</option>
                              <option value="aba_pay">1020 — ABA Pay</option>
                              <option value="wing">1020 — Wing</option>
                              <option value="bakong">1020 — Bakong</option>
                              <option value="online">1020 — Online (OTA)</option>
                              <option value="other">1020 — Other</option>
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
          w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${window.location.origin}"><title>Deposit Receipt ${receipt.receipt_number}</title>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={branchLogo(activeBranch?.location)} alt={branchBrandLabel(activeBranch?.location)} style={{ height: 52, width: 52, objectFit: 'contain', borderRadius: 8, background: 'white', padding: 4 }} />
                  <div>
                    <div style={{ color: '#F05830', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>Deposit Receipt</div>
                    <div style={{ color: '#a0aec0', fontSize: 11, marginTop: 3 }}>{branchBrandLabel(activeBranch?.location)}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#F05830' }}>{receipt.receipt_number}</div>
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
                {/* Charges Detail */}
                {(() => {
                  const items = ((receiptModalRes as any).line_items ?? []) as any[]
                  const fnbItems = items.filter(li => li.revenue_account_code === '4100')
                  const activityItems = items.filter(li => li.revenue_account_code !== '4100')
                  const netOf = (li: any) => Number(li.amount || 0) - Number(li.discount || 0)
                  const nights = calculateNights(receiptModalRes.check_in_date, receiptModalRes.check_out_date)
                  const addOnsNet = items.reduce((s, li) => s + netOf(li), 0)
                  const propertyNet = Number(receiptModalRes.total_amount ?? 0) + Number((receiptModalRes as any).discount_amount ?? 0) - addOnsNet
                  const houseDiscount = Number((receiptModalRes as any).house_discount || 0)

                  const sectionHeadStyle: React.CSSProperties = { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: '#9ca3af', fontWeight: 700, marginTop: 14, marginBottom: 4 }
                  const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 40px 64px 74px', gap: 8, fontSize: 12, padding: '3px 0', alignItems: 'center' }
                  const gridHeadStyle: React.CSSProperties = { ...gridStyle, fontSize: 10, textTransform: 'uppercase', color: '#9ca3af', fontWeight: 600, padding: '2px 0' }

                  const renderRows = (list: any[]) => list.map((li, i) => (
                    <div key={li.id ?? i} style={gridStyle}>
                      <span style={{ color: '#374151' }}>{li.label}</span>
                      <span style={{ textAlign: 'right', color: '#6b7280' }}>{li.qty ?? 1}</span>
                      <span style={{ textAlign: 'right', color: '#dc2626' }}>{Number(li.discount || 0) > 0 ? `−${formatCurrency(Number(li.discount))}` : '—'}</span>
                      <span style={{ textAlign: 'right', fontWeight: 600, color: '#1a1a2e' }}>{formatCurrency(netOf(li))}</span>
                    </div>
                  ))

                  return (
                    <div style={{ margin: '14px 0', borderTop: '1px solid #f0f4f8', paddingTop: 2 }}>
                      <p style={sectionHeadStyle}>Property</p>
                      <div style={gridHeadStyle}><span>Item</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Disc.</span><span style={{ textAlign: 'right' }}>Amount</span></div>
                      <div style={gridStyle}>
                        <span style={{ color: '#374151' }}>{house?.name ?? '—'}</span>
                        <span style={{ textAlign: 'right', color: '#6b7280' }}>{nights || '—'}</span>
                        <span style={{ textAlign: 'right', color: '#dc2626' }}>{houseDiscount > 0 ? `−${formatCurrency(houseDiscount)}` : '—'}</span>
                        <span style={{ textAlign: 'right', fontWeight: 600, color: '#1a1a2e' }}>{formatCurrency(propertyNet)}</span>
                      </div>

                      {activityItems.length > 0 && (
                        <>
                          <p style={sectionHeadStyle}>Activities &amp; Services</p>
                          <div style={gridHeadStyle}><span>Item</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Disc.</span><span style={{ textAlign: 'right' }}>Amount</span></div>
                          {renderRows(activityItems)}
                        </>
                      )}

                      {fnbItems.length > 0 && (
                        <>
                          <p style={sectionHeadStyle}>Food &amp; Beverage</p>
                          <div style={gridHeadStyle}><span>Item</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Disc.</span><span style={{ textAlign: 'right' }}>Amount</span></div>
                          {renderRows(fnbItems)}
                        </>
                      )}
                    </div>
                  )
                })()}
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
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${statusColor[receipt.status] ?? 'bg-gray-100 text-gray-600'}`}>
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

      {/* ── Charges Breakdown Modal ── */}
      {chargesModalRes && (() => {
        const res = chargesModalRes
        const items = (res.line_items ?? []) as any[]
        const fnbItems = items.filter(li => li.revenue_account_code === '4100')
        const activityItems = items.filter(li => li.revenue_account_code !== '4100')
        const netOf = (li: any) => Number(li.amount || 0) - Number(li.discount || 0)
        const addOnsNet = items.reduce((s, li) => s + netOf(li), 0)
        const propertyNet = (res.total_amount ?? 0) + Number(res.discount_amount || 0) - addOnsNet
        const houseDiscount = Number((res as any).house_discount || 0)
        const overallDiscount = Number(res.discount_amount || 0)
        const nights = calculateNights(res.check_in_date, res.check_out_date)
        const grossBeforeOverallDiscount = propertyNet + addOnsNet
        const colHead = (
          <>
            <div className="text-[10px] text-hmuted/70 uppercase tracking-wide">Item</div>
            <div className="text-[10px] text-hmuted/70 uppercase tracking-wide text-right">Qty</div>
            <div className="text-[10px] text-hmuted/70 uppercase tracking-wide text-right">Discount</div>
            <div className="text-[10px] text-hmuted/70 uppercase tracking-wide text-right">Amount</div>
          </>
        )
        return (
          <Modal
            open={true}
            onClose={() => setChargesModalRes(null)}
            title="Charges Breakdown"
            subtitle={`${res.reservation_number} — ${(res.guest as any)?.full_name ?? 'Guest'}`}
            size="md"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_50px_80px_90px] gap-x-4 gap-y-1 text-xs">
              {/* Property */}
              <div className="col-span-4 text-[10px] font-semibold text-hmuted uppercase tracking-wide">Property</div>
              {colHead}
              <div className="text-hmuted truncate">{(res.house as any)?.name ?? '—'}</div>
              <div className="text-right text-hmuted tabular-nums">{nights || '—'}</div>
              <div className="text-right text-orange-600 tabular-nums">{houseDiscount > 0 ? `−${formatCurrency(houseDiscount)}` : '—'}</div>
              <div className="text-right font-medium text-htext tabular-nums">{formatCurrency(propertyNet)}</div>

              {/* Activities & Services */}
              <div className="col-span-4 text-[10px] font-semibold text-hmuted uppercase tracking-wide mt-3">Activities &amp; Services</div>
              {activityItems.length === 0 ? (
                <div className="col-span-4 text-hmuted">—</div>
              ) : (
                <>
                  {colHead}
                  {activityItems.map(li => (
                    <Fragment key={li.id}>
                      <div className="text-hmuted truncate">{li.label}</div>
                      <div className="text-right text-hmuted tabular-nums">{li.qty ?? 1}</div>
                      <div className="text-right text-orange-600 tabular-nums">{Number(li.discount || 0) > 0 ? `−${formatCurrency(Number(li.discount))}` : '—'}</div>
                      <div className="text-right text-htext tabular-nums">{formatCurrency(netOf(li))}</div>
                    </Fragment>
                  ))}
                </>
              )}

              {/* Food & Beverage */}
              <div className="col-span-4 text-[10px] font-semibold text-hmuted uppercase tracking-wide mt-3">Food &amp; Beverage</div>
              {fnbItems.length === 0 ? (
                <div className="col-span-4 text-hmuted">—</div>
              ) : (
                <>
                  {colHead}
                  {fnbItems.map(li => (
                    <Fragment key={li.id}>
                      <div className="text-hmuted truncate">{li.label}</div>
                      <div className="text-right text-hmuted tabular-nums">{li.qty ?? 1}</div>
                      <div className="text-right text-orange-600 tabular-nums">{Number(li.discount || 0) > 0 ? `−${formatCurrency(Number(li.discount))}` : '—'}</div>
                      <div className="text-right text-htext tabular-nums">{formatCurrency(netOf(li))}</div>
                    </Fragment>
                  ))}
                </>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-hborder space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-hmuted">Subtotal</span>
                <span className="tabular-nums text-htext">{formatCurrency(grossBeforeOverallDiscount)}</span>
              </div>
              {overallDiscount > 0 && (
                <div className="flex justify-between">
                  <span className="text-orange-600 truncate">{(res as any).discount_label || 'Discount'}</span>
                  <span className="tabular-nums text-orange-600 flex-shrink-0">−{formatCurrency(overallDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 mt-1 border-t border-hborder/60">
                <span className="font-semibold text-htext">Total</span>
                <span className="font-semibold text-htext tabular-nums">{res.total_amount == null ? '—' : formatCurrency(res.total_amount)}</span>
              </div>
            </div>
          </Modal>
        )
      })()}
    </>
  )
}
