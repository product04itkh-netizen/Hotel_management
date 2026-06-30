'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, generateJournalEntryNumber, capitalize } from '@/lib/utils'
import { exportXlsx } from '@/lib/excel'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import { cn } from '@/lib/utils'
import type { ChartOfAccount, AccountType, JournalEntry, PettyCashTransaction, Vendor, Bill } from '@/types'

// ── Types & constants ──────────────────────────────────────────
type Tab = 'overview' | 'ar' | 'bills' | 'vendors' | 'journal' | 'ledger' | 'trial_balance' | 'reports' | 'reconciliation' | 'recurring' | 'periods' | 'coa' | 'petty'

const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense']
const PETTY_CATEGORIES = [
  'Cleaning Supplies', 'Maintenance Materials', 'Staff Refreshments',
  'Office Supplies', 'Utilities', 'Transportation', 'Food & Beverages',
  'Garden & Outdoor', 'Printing & Stationery', 'Miscellaneous',
]
const TYPE_COLOR: Record<AccountType, string> = {
  asset: 'bg-green-100 text-green-700', liability: 'bg-red-100 text-red-700',
  equity: 'bg-purple-100 text-purple-700', revenue: 'bg-blue-100 text-blue-700',
  expense: 'bg-orange-100 text-orange-700',
}
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',       label: 'Overview' },
  { key: 'ar',             label: 'Receivables' },
  { key: 'bills',          label: 'Bills (AP)' },
  { key: 'vendors',        label: 'Vendors' },
  { key: 'journal',        label: 'Journal Entries' },
  { key: 'ledger',         label: 'General Ledger' },
  { key: 'trial_balance',  label: 'Trial Balance' },
  { key: 'reports',        label: 'P&L / Balance Sheet' },
  { key: 'reconciliation', label: 'Bank Recon.' },
  { key: 'recurring',      label: 'Recurring' },
  { key: 'periods',        label: 'Periods' },
  { key: 'coa',            label: 'Chart of Accounts' },
  { key: 'petty',          label: 'Petty Cash' },
]
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function normalBalance(type: AccountType): 'debit' | 'credit' {
  return ['asset', 'expense'].includes(type) ? 'debit' : 'credit'
}
function daysPastDue(issueDate: string, terms = 30): number {
  const due = new Date(issueDate)
  due.setDate(due.getDate() + terms)
  return Math.floor((Date.now() - due.getTime()) / 86400000)
}
function agingLabel(od: number) {
  if (od <= 0) return 'Current'
  if (od <= 30) return '1–30 days'
  if (od <= 60) return '31–60 days'
  return '60+ days'
}
function agingColor(od: number) {
  if (od <= 0) return 'bg-green-100 text-green-700'
  if (od <= 30) return 'bg-yellow-100 text-yellow-700'
  if (od <= 60) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}
const todayStr = () => new Date().toISOString().split('T')[0]
const emptyCoaForm = { code: '', name: '', type: 'expense' as AccountType, category: 'operating_expense', is_active: true, opening_balance: '', opening_balance_date: todayStr(), offset_account_id: '' }
const emptyJeLine = () => ({ account_id: '', description: '', debit: '' as number | string, credit: '' as number | string })

// ── Page ───────────────────────────────────────────────────────
export default function AccountingPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()
  const [tab, setTab] = useState<Tab>('overview')

  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message?: string; confirmLabel?: string; variant?: 'default' | 'danger'; onConfirm: () => void } | null>(null)

  // COA
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([])
  const [coaFormOpen, setCoaFormOpen] = useState(false)
  const [editAccountId, setEditAccountId] = useState<string | null>(null)
  const [coaForm, setCoaForm] = useState({ ...emptyCoaForm })
  const [coaSaving, setCoaSaving] = useState(false)

  // Journal Entries
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [jeFormOpen, setJeFormOpen] = useState(false)
  const [editJeId, setEditJeId] = useState<string | null>(null)
  const [jeForm, setJeForm] = useState({ date: '', description: '', reference: '', reference_type: 'manual' })
  const [jeLines, setJeLines] = useState([emptyJeLine(), emptyJeLine()])
  const [jeSaving, setJeSaving] = useState(false)
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [entryLines, setEntryLines] = useState<Record<string, any[]>>({})

  // General Ledger
  const [ledgerAccountId, setLedgerAccountId] = useState('')
  const [ledgerFrom, setLedgerFrom] = useState('')
  const [ledgerTo, setLedgerTo] = useState('')
  const [ledgerRows, setLedgerRows] = useState<any[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

  // Petty Cash
  const [petty, setPetty] = useState<PettyCashTransaction[]>([])
  const [pcFormOpen, setPcFormOpen] = useState(false)
  const [pcForm, setPcForm] = useState({
    date: todayStr(), description: '', category: 'Miscellaneous', amount: '',
    type: 'out' as 'in' | 'out', reference: '', expense_account_id: '',
  })
  const [pcSaving, setPcSaving] = useState(false)
  const [pcFilter, setPcFilter] = useState<'all' | 'in' | 'out'>('all')

  // Overview
  const [overview, setOverview] = useState({
    pettyCashBalance: 0, monthRevenue: 0, monthExpenses: 0,
    totalEntries: 0, arOutstanding: 0, apOutstanding: 0,
  })

  // AR
  const [arInvoices, setArInvoices] = useState<any[]>([])
  const [arFilter, setArFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('unpaid')

  // Bills (AP)
  const [bills, setBills] = useState<Bill[]>([])
  const [billFilter, setBillFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('unpaid')
  const [billFormOpen, setBillFormOpen] = useState(false)
  const [billPayOpen, setBillPayOpen] = useState(false)
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [billSaving, setBillSaving] = useState(false)
  const [billForm, setBillForm] = useState({
    vendor_id: '', bill_date: todayStr(), due_date: '',
    description: '', subtotal: '', tax_amount: '0',
    expense_account_id: '', notes: '',
  })
  const [billPayForm, setBillPayForm] = useState({
    payment_date: todayStr(), amount: '', payment_method: 'cash', reference: '', notes: '',
  })

  // Vendors
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorFormOpen, setVendorFormOpen] = useState(false)
  const [editVendorId, setEditVendorId] = useState<string | null>(null)
  const [vendorSaving, setVendorSaving] = useState(false)
  const [vendorForm, setVendorForm] = useState({
    name: '', contact_name: '', email: '', phone: '',
    address: '', tax_id: '', payment_terms: '30', notes: '',
  })

  // Trial Balance
  const [tbFrom, setTbFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [tbTo,   setTbTo]   = useState(todayStr())
  const [tbRows, setTbRows] = useState<any[]>([])
  const [tbLoading, setTbLoading] = useState(false)

  // Reports (P&L / Balance Sheet)
  const [reportType,    setReportType]    = useState<'pl' | 'bs'>('pl')
  const [reportFrom,    setReportFrom]    = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`)
  const [reportTo,      setReportTo]      = useState(todayStr())
  const [reportData,    setReportData]    = useState<any>(null)
  const [reportLoading, setReportLoading] = useState(false)

  // Bank Reconciliation
  const [reconLines,   setReconLines]   = useState<any[]>([])
  const [reconStmtBal, setReconStmtBal] = useState('')
  const [reconLoading, setReconLoading] = useState(false)

  // Recurring Entries
  const [recurring,      setRecurring]      = useState<any[]>([])
  const [recurFormOpen,  setRecurFormOpen]  = useState(false)
  const [editRecurId,    setEditRecurId]    = useState<string | null>(null)
  const [recurSaving,    setRecurSaving]    = useState(false)
  const [recurForm,      setRecurForm]      = useState({ name: '', description: '', frequency: 'monthly', next_due_date: todayStr() })
  const [recurLines,     setRecurLines]     = useState([emptyJeLine(), emptyJeLine()])

  // Accounting Periods
  const [periods,       setPeriods]       = useState<any[]>([])
  const [periodSaving,  setPeriodSaving]  = useState(false)

  // AR Aging Report modal
  const [showAgingReport, setShowAgingReport] = useState(false)

  // Payment Methods (dynamic, loaded from DB)
  const [paymentMethods, setPaymentMethods] = useState<{ name: string; value: string; is_cash: boolean }[]>([
    { name: 'Cash', value: 'cash', is_cash: true },
    { name: 'Bank Transfer', value: 'bank_transfer', is_cash: false },
    { name: 'ABA Pay', value: 'aba_pay', is_cash: false },
    { name: 'Wing', value: 'wing', is_cash: false },
    { name: 'Bakong', value: 'bakong', is_cash: false },
    { name: 'Online (OTA)', value: 'online', is_cash: false },
    { name: 'Other', value: 'other', is_cash: false },
  ])

  useEffect(() => {
    if (activeBranch) {
      loadAccounts(); loadEntries(); loadPetty()
      loadAR(); loadBills(); loadVendors()
      loadPeriods(); loadRecurring()
      loadPaymentMethods()
    }
  }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPaymentMethods() {
    if (!activeBranch) return
    const { data } = await supabase.from('payment_methods').select('name, value, is_cash').eq('branch_id', activeBranch.id).eq('is_active', true).order('sort_order')
    if (data && data.length > 0) setPaymentMethods(data as { name: string; value: string; is_cash: boolean }[])
  }

  // ── Load ───────────────────────────────────────────────────────

  async function loadAccounts() {
    if (!activeBranch) return
    const { data } = await supabase.from('chart_of_accounts')
      .select('*').eq('branch_id', activeBranch.id).order('code')
    const accts = (data ?? []) as ChartOfAccount[]
    setAccounts(accts)
    const requiredCodes = ['1010', '1020', '2100', '5800']
    const missing = requiredCodes.filter(c => !accts.find(a => a.code === c && a.is_active))
    if (missing.length) {
      toast(`Missing required COA accounts: ${missing.join(', ')} — auto journal entries will be skipped until added`, 'error')
    }
  }

  async function loadEntries() {
    if (!activeBranch) return
    const { data } = await supabase.from('journal_entries')
      .select('*').eq('branch_id', activeBranch.id)
      .order('entry_date', { ascending: false }).limit(100)
    setEntries((data ?? []) as JournalEntry[])
    computeOverview(data ?? [])
  }

  async function loadPetty() {
    if (!activeBranch) return
    const { data } = await supabase.from('petty_cash_transactions')
      .select('*').eq('branch_id', activeBranch.id)
      .order('transaction_date', { ascending: false })
    setPetty((data ?? []) as PettyCashTransaction[])
  }

  async function loadAR() {
    if (!activeBranch) return
    const { data } = await supabase.from('invoices')
      .select('*, guest:guests(full_name), house:houses(name)')
      .eq('branch_id', activeBranch.id)
      .order('invoice_date', { ascending: false })
    setArInvoices(data ?? [])
  }

  async function loadBills() {
    if (!activeBranch) return
    const { data } = await supabase.from('bills')
      .select('*, vendor:vendors(name, payment_terms), expense_account:chart_of_accounts(code, name)')
      .eq('branch_id', activeBranch.id)
      .order('bill_date', { ascending: false })
    setBills((data ?? []) as Bill[])
  }

  async function loadVendors() {
    if (!activeBranch) return
    const { data } = await supabase.from('vendors')
      .select('*').eq('branch_id', activeBranch.id).order('name')
    setVendors((data ?? []) as Vendor[])
  }

  async function loadEntryLines(entryId: string) {
    if (entryLines[entryId]) return
    const { data } = await supabase.from('journal_entry_lines')
      .select('*, account:chart_of_accounts(code, name, type)')
      .eq('entry_id', entryId).order('debit', { ascending: false })
    setEntryLines(prev => ({ ...prev, [entryId]: data ?? [] }))
  }

  async function loadLedger() {
    if (!ledgerAccountId || !activeBranch) return
    setLedgerLoading(true)
    // Step 1: get entry IDs filtered by date — PostgREST cannot filter on nested FK columns
    let jeQ = supabase.from('journal_entries')
      .select('id').eq('branch_id', activeBranch.id).eq('status', 'posted')
    if (ledgerFrom) jeQ = jeQ.gte('entry_date', ledgerFrom)
    if (ledgerTo)   jeQ = jeQ.lte('entry_date', ledgerTo)
    const { data: jeData } = await jeQ
    const ids = (jeData ?? []).map((e: any) => e.id)
    if (ids.length === 0) { setLedgerRows([]); setLedgerLoading(false); return }
    // Step 2: get lines for those entries on the selected account
    const { data } = await supabase.from('journal_entry_lines')
      .select('*, entry:journal_entries(entry_number, entry_date, description, reference)')
      .eq('account_id', ledgerAccountId)
      .in('entry_id', ids)
    const acct = accounts.find(a => a.id === ledgerAccountId)
    const nb = acct ? normalBalance(acct.type) : 'debit'
    let balance = 0
    const rows = (data ?? [])
      .filter((r: any) => r.entry)
      .sort((a: any, b: any) => a.entry.entry_date.localeCompare(b.entry.entry_date))
      .map((r: any) => {
        const net = nb === 'debit' ? Number(r.debit) - Number(r.credit) : Number(r.credit) - Number(r.debit)
        balance += net
        return { ...r, running_balance: balance }
      })
    setLedgerRows(rows)
    setLedgerLoading(false)
  }

  async function computeOverview(entryData: any[]) {
    if (!activeBranch) return
    const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
    const [pcRes, arRes, apRes] = await Promise.all([
      supabase.from('petty_cash_transactions').select('amount, transaction_type').eq('branch_id', activeBranch.id),
      supabase.from('invoices').select('total, amount_paid').eq('branch_id', activeBranch.id).in('status', ['unpaid', 'partial']),
      supabase.from('bills').select('total, amount_paid').eq('branch_id', activeBranch.id).in('status', ['unpaid', 'partial']),
    ])
    // 2-step: get this branch's JE IDs for current month, then fetch their lines
    const { data: monthJeData } = await supabase.from('journal_entries')
      .select('id').eq('branch_id', activeBranch.id).eq('status', 'posted').gte('entry_date', monthStart)
    const monthJeIds = (monthJeData ?? []).map((e: any) => e.id)
    const linesRes = monthJeIds.length > 0
      ? await supabase.from('journal_entry_lines')
          .select('debit, credit, account:chart_of_accounts(type)')
          .in('entry_id', monthJeIds)
      : { data: [] as any[] }
    const pettyCashBalance = (pcRes.data ?? []).reduce((s: number, t: any) => s + (t.transaction_type === 'in' ? Number(t.amount) : -Number(t.amount)), 0)
    const monthRevenue = (linesRes.data ?? []).filter((l: any) => l.account?.type === 'revenue').reduce((s: number, l: any) => s + Number(l.credit), 0)
    const monthExpenses = (linesRes.data ?? []).filter((l: any) => l.account?.type === 'expense').reduce((s: number, l: any) => s + Number(l.debit), 0)
    const arOutstanding = (arRes.data ?? []).reduce((s: number, inv: any) => s + (Number(inv.total) - Number(inv.amount_paid)), 0)
    const apOutstanding = (apRes.data ?? []).reduce((s: number, b: any) => s + (Number(b.total) - Number(b.amount_paid)), 0)
    setOverview({ pettyCashBalance, monthRevenue, monthExpenses, totalEntries: entryData.length, arOutstanding, apOutstanding })
  }

  // ── Bill number ────────────────────────────────────────────────

  async function generateBillNumber(): Promise<string> {
    const now = new Date()
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const prefix = `BILL-${yyyymm}-`
    const { data } = await supabase.from('bills')
      .select('bill_number').eq('branch_id', activeBranch!.id)
      .like('bill_number', `${prefix}%`).order('bill_number', { ascending: false }).limit(1).maybeSingle()
    let seq = 1
    if (data?.bill_number) {
      const n = parseInt((data.bill_number as string).slice(prefix.length), 10)
      if (!isNaN(n)) seq = n + 1
    }
    return `${prefix}${String(seq).padStart(3, '0')}`
  }

  // ── COA ────────────────────────────────────────────────────────

  function openAddAccount() { setEditAccountId(null); setCoaForm({ ...emptyCoaForm }); setCoaFormOpen(true) }
  function openEditAccount(a: ChartOfAccount) {
    setEditAccountId(a.id)
    setCoaForm({ code: a.code, name: a.name, type: a.type, category: a.category, is_active: a.is_active ?? true, opening_balance: '', opening_balance_date: todayStr(), offset_account_id: '' })
    setCoaFormOpen(true)
  }
  async function saveAccount() {
    if (!coaForm.code || !coaForm.name) { toast('Code and name required', 'error'); return }
    if (coaForm.opening_balance && Number(coaForm.opening_balance) > 0 && !coaForm.offset_account_id) { toast('Offset account required for opening balance', 'error'); return }
    setCoaSaving(true)
    const payload = { code: coaForm.code, name: coaForm.name, type: coaForm.type, category: coaForm.category, is_active: coaForm.is_active, updated_at: new Date().toISOString() }
    
    let savedAccountId = editAccountId
    if (editAccountId) {
      const { error } = await supabase.from('chart_of_accounts').update(payload)
        .eq('id', editAccountId).eq('branch_id', activeBranch!.id)
      if (error) { toast(error.message, 'error'); setCoaSaving(false); return }
      // Update local state directly to avoid race condition with branch switching
      setAccounts(prev => prev.map(a => a.id === editAccountId ? { ...a, ...payload } : a))
    } else {
      const { data, error } = await supabase.from('chart_of_accounts').insert({ ...payload, branch_id: activeBranch?.id ?? null }).select().single()
      if (error || !data) { toast(error?.message ?? 'Error', 'error'); setCoaSaving(false); return }
      savedAccountId = data.id
      setAccounts(prev => [...prev, data as ChartOfAccount])
    }
      
    if (coaForm.opening_balance && Number(coaForm.opening_balance) > 0 && coaForm.offset_account_id) {
      const bal = Number(coaForm.opening_balance)
      const isDebit = coaForm.type === 'asset' || coaForm.type === 'expense'
      const { data: entryReq } = await supabase.from('journal_entries').insert({
        entry_number: generateJournalEntryNumber(),
        entry_date: coaForm.opening_balance_date,
        reference: coaForm.code,
        reference_type: 'opening_balance',
        description: `Opening balance for ${coaForm.name}`,
        branch_id: activeBranch?.id ?? null
      }).select().single()
      
      if (entryReq) {
        await supabase.from('journal_entry_lines').insert([
          {
            entry_id: entryReq.id, account_id: savedAccountId,
            debit: isDebit ? bal : 0, credit: isDebit ? 0 : bal,
            description: 'Opening Balance'
          },
          {
            entry_id: entryReq.id, account_id: coaForm.offset_account_id,
            debit: isDebit ? 0 : bal, credit: isDebit ? bal : 0,
            description: 'Opening Balance Offset'
          }
        ])
      }
    }
    
    toast(editAccountId ? 'Account updated' : 'Account added')
    setCoaSaving(false); setCoaFormOpen(false)
  }
  async function toggleAccountActive(a: ChartOfAccount) {
    await supabase.from('chart_of_accounts').update({ is_active: !a.is_active })
      .eq('id', a.id).eq('branch_id', activeBranch!.id)
    setAccounts(prev => prev.map(ac => ac.id === a.id ? { ...ac, is_active: !a.is_active } : ac))
  }

  // ── Journal Entry ──────────────────────────────────────────────

  function openAddEntry() { openNewJe() }
  function updateJeLine(idx: number, field: string, value: string | number) {
    setJeLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }
  const jeTotalDebit  = jeLines.reduce((s, l) => s + Number(l.debit  || 0), 0)
  const jeTotalCredit = jeLines.reduce((s, l) => s + Number(l.credit || 0), 0)
  const jeBalanced    = Math.abs(jeTotalDebit - jeTotalCredit) < 0.001

  function openNewJe() {
    setEditJeId(null)
    setJeForm({ date: todayStr(), description: '', reference: '', reference_type: 'manual' })
    setJeLines([emptyJeLine(), emptyJeLine()])
    setJeFormOpen(true)
  }

  async function openEditJe(entry: JournalEntry) {
    setEditJeId(entry.id)
    setJeForm({ date: entry.entry_date, description: entry.description, reference: entry.reference ?? '', reference_type: entry.reference_type ?? 'manual' })
    let lines: any[] = entryLines[entry.id] ?? []
    if (lines.length === 0) {
      const { data } = await supabase.from('journal_entry_lines').select('*').eq('entry_id', entry.id)
      lines = data ?? []
    }
    setJeLines(lines.length >= 2
      ? lines.map(l => ({ account_id: l.account_id, description: l.description ?? '', debit: l.debit > 0 ? l.debit : '' as number | string, credit: l.credit > 0 ? l.credit : '' as number | string }))
      : [...lines.map(l => ({ account_id: l.account_id, description: l.description ?? '', debit: l.debit > 0 ? l.debit : '' as number | string, credit: l.credit > 0 ? l.credit : '' as number | string })), emptyJeLine()]
    )
    setJeFormOpen(true)
  }

  async function saveJournalEntry() {
    if (!jeForm.description) { toast('Description required', 'error'); return }
    if (!jeBalanced) { toast('Debits must equal credits', 'error'); return }
    const validLines = jeLines.filter(l => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
    if (validLines.length < 2) { toast('At least 2 lines required', 'error'); return }
    if (jeForm.date) {
      const d = new Date(jeForm.date)
      const ey = d.getFullYear(), em = d.getMonth() + 1
      const closed = periods.find(p => p.year === ey && p.month === em && p.status === 'closed')
      if (closed) { toast(`${MONTH_NAMES[em - 1]} ${ey} is a closed period. Reopen it first.`, 'error'); return }
    }
    setJeSaving(true)

    if (editJeId) {
      // Edit existing draft entry
      const { error: updErr } = await supabase.from('journal_entries').update({
        entry_date: jeForm.date,
        reference: jeForm.reference || null,
        reference_type: jeForm.reference_type || null,
        description: jeForm.description,
        updated_at: new Date().toISOString(),
      }).eq('id', editJeId).eq('status', 'draft')
      if (updErr) { toast(updErr.message, 'error'); setJeSaving(false); return }
      await supabase.from('journal_entry_lines').delete().eq('entry_id', editJeId)
      const { error: lineErr } = await supabase.from('journal_entry_lines').insert(
        validLines.map(l => ({
          entry_id: editJeId, account_id: l.account_id,
          description: l.description || null,
          debit: Number(l.debit || 0), credit: Number(l.credit || 0),
        }))
      )
      if (lineErr) { toast('Failed to save lines', 'error'); setJeSaving(false); return }
      setEntryLines(prev => ({ ...prev, [editJeId]: [] }))
      toast('Entry updated'); setJeSaving(false); setJeFormOpen(false); loadEntries()
    } else {
      // Create new entry as draft
      const { data: je, error: jeErr } = await supabase.from('journal_entries').insert({
        entry_number: generateJournalEntryNumber(), entry_date: jeForm.date,
        reference: jeForm.reference || null, reference_type: jeForm.reference_type || null,
        description: jeForm.description, branch_id: activeBranch?.id ?? null,
        status: 'draft',
      }).select().single()
      if (jeErr || !je) { toast(jeErr?.message ?? 'Error', 'error'); setJeSaving(false); return }
      const { error: lineErr } = await supabase.from('journal_entry_lines').insert(
        validLines.map(l => ({
          entry_id: je.id, account_id: l.account_id,
          description: l.description || null,
          debit: Number(l.debit || 0), credit: Number(l.credit || 0),
        }))
      )
      if (lineErr) {
        await supabase.from('journal_entries').delete().eq('id', je.id)
        toast('Failed to save lines, entry cancelled', 'error')
        setJeSaving(false); return
      }
      toast('Draft saved — Post it when ready'); setJeSaving(false); setJeFormOpen(false); loadEntries()
    }
  }

  async function postJournalEntry(entry: JournalEntry) {
    await supabase.from('journal_entries').update({ status: 'posted', updated_at: new Date().toISOString() }).eq('id', entry.id)
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'posted' } : e))
    toast(`${entry.entry_number} posted`)
  }

  async function unpostJournalEntry(entry: JournalEntry) {
    setConfirmDialog({
      title: `Unpost ${entry.entry_number}?`,
      message: 'Entry will return to draft and can be edited. It will be excluded from reports until re-posted.',
      confirmLabel: 'Unpost',
      variant: 'default',
      onConfirm: async () => {
        setConfirmDialog(null)
        await supabase.from('journal_entries').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', entry.id)
        setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'draft' } : e))
        toast(`${entry.entry_number} unposted — now editable`)
      },
    })
  }

  // ── Bills ──────────────────────────────────────────────────────

  async function saveBill() {
    if (!billForm.description || Number(billForm.subtotal) <= 0) {
      toast('Description and amount required', 'error'); return
    }
    if (!billForm.expense_account_id) {
      toast('Expense account is required', 'error'); return
    }
    setBillSaving(true)
    const subtotal = Number(billForm.subtotal)
    const taxAmt   = Number(billForm.tax_amount || 0)
    const total    = subtotal + taxAmt

    let jeId: string | null = null
    const apAcct  = accounts.find(a => a.code === '2100')
    const expAcct = billForm.expense_account_id ? accounts.find(a => a.id === billForm.expense_account_id) : null
    if (apAcct && expAcct) {
      const { data: je } = await supabase.from('journal_entries').insert({
        entry_number: generateJournalEntryNumber(), entry_date: billForm.bill_date,
        reference_type: 'bill', description: `Bill — ${billForm.description}`,
        branch_id: activeBranch?.id ?? null,
      }).select().single()
      if (je) {
        jeId = je.id
        const { error: lineErr } = await supabase.from('journal_entry_lines').insert([
          { entry_id: je.id, account_id: expAcct.id, description: billForm.description, debit: total, credit: 0 },
          { entry_id: je.id, account_id: apAcct.id,  description: billForm.description, debit: 0, credit: total },
        ])
        if (lineErr) {
          await supabase.from('journal_entries').delete().eq('id', je.id)
          toast('Failed to save journal lines', 'error'); setBillSaving(false); return
        }
      }
    }

    const { error } = await supabase.from('bills').insert({
      bill_number: await generateBillNumber(),
      vendor_id: billForm.vendor_id || null,
      bill_date: billForm.bill_date,
      due_date: billForm.due_date || null,
      expense_account_id: billForm.expense_account_id || null,
      description: billForm.description,
      subtotal, tax_amount: taxAmt, total,
      amount_paid: 0, status: 'unpaid',
      notes: billForm.notes || null,
      journal_entry_id: jeId,
      branch_id: activeBranch?.id ?? null,
    })
    if (error) { 
      if (jeId) await supabase.from('journal_entries').delete().eq('id', jeId)
      toast(error.message, 'error'); setBillSaving(false); return 
    }
    toast('Bill recorded')
    setBillSaving(false); setBillFormOpen(false)
    setBillForm({ vendor_id: '', bill_date: todayStr(), due_date: '', description: '', subtotal: '', tax_amount: '0', expense_account_id: '', notes: '' })
    loadBills(); loadEntries()
  }

  async function saveBillPayment() {
    if (!selectedBill || Number(billPayForm.amount) <= 0) { toast('Amount required', 'error'); return }
    setBillSaving(true)
    const payAmt  = Number(billPayForm.amount)
    const newPaid = Number(selectedBill.amount_paid) + payAmt
    const newStatus = newPaid >= Number(selectedBill.total) ? 'paid' : 'partial'

    const apAcct   = accounts.find(a => a.code === '2100')
    const cashCode = (() => {
      const pm = paymentMethods.find(m => m.value === billPayForm.payment_method)
      return (pm as any)?.account_code || ((pm?.is_cash ?? (billPayForm.payment_method === 'cash')) ? '1010' : '1020')
    })()
    const cashAcct = accounts.find(a => a.code === cashCode)
    let jeId: string | null = null
    if (apAcct && cashAcct) {
      const { data: je, error: jeErr } = await supabase.from('journal_entries').insert({
        entry_number: generateJournalEntryNumber(), entry_date: billPayForm.payment_date,
        reference: selectedBill.bill_number, reference_type: 'bill_payment',
        description: `Bill payment — ${selectedBill.description}`,
        branch_id: activeBranch?.id ?? null,
      }).select().single()
      if (jeErr) { toast(jeErr.message, 'error'); setBillSaving(false); return }
      if (je) {
        jeId = je.id
        const { error: lineErr } = await supabase.from('journal_entry_lines').insert([
          { entry_id: je.id, account_id: apAcct.id,   debit: payAmt, credit: 0 },
          { entry_id: je.id, account_id: cashAcct.id,  debit: 0, credit: payAmt },
        ])
        if (lineErr) {
          await supabase.from('journal_entries').delete().eq('id', je.id)
          toast('Failed to save journal lines', 'error'); setBillSaving(false); return
        }
      }
    }

    const { error: pmtErr } = await supabase.from('bill_payments').insert({
      bill_id: selectedBill.id, payment_date: billPayForm.payment_date,
      amount: payAmt, payment_method: billPayForm.payment_method,
      reference: billPayForm.reference || null, notes: billPayForm.notes || null,
      journal_entry_id: jeId, branch_id: activeBranch?.id ?? null,
    })
    if (pmtErr) {
      if (jeId) await supabase.from('journal_entries').delete().eq('id', jeId)
      toast(pmtErr.message, 'error'); setBillSaving(false); return
    }
    
    const { error: billErr } = await supabase.from('bills').update({
      amount_paid: newPaid, status: newStatus, updated_at: new Date().toISOString(),
    }).eq('id', selectedBill.id)
    if (billErr) {
      // rollback payment and JE on failure
      await supabase.from('bill_payments').delete().eq('bill_id', selectedBill.id).eq('amount', payAmt)
      if (jeId) await supabase.from('journal_entries').delete().eq('id', jeId)
      toast(billErr.message, 'error'); setBillSaving(false); return
    }

    toast('Payment recorded')
    setBillSaving(false); setBillPayOpen(false)
    setBillPayForm({ payment_date: todayStr(), amount: '', payment_method: 'cash', reference: '', notes: '' })
    setSelectedBill(null); loadBills(); loadEntries()
  }

  // ── Vendors ────────────────────────────────────────────────────

  function openAddVendor() {
    setEditVendorId(null)
    setVendorForm({ name: '', contact_name: '', email: '', phone: '', address: '', tax_id: '', payment_terms: '30', notes: '' })
    setVendorFormOpen(true)
  }
  function openEditVendor(v: Vendor) {
    setEditVendorId(v.id)
    setVendorForm({
      name: v.name, contact_name: v.contact_name ?? '', email: v.email ?? '',
      phone: v.phone ?? '', address: v.address ?? '', tax_id: v.tax_id ?? '',
      payment_terms: String(v.payment_terms), notes: v.notes ?? '',
    })
    setVendorFormOpen(true)
  }
  async function saveVendor() {
    if (!vendorForm.name) { toast('Vendor name required', 'error'); return }
    setVendorSaving(true)
    const payload = {
      name: vendorForm.name, contact_name: vendorForm.contact_name || null,
      email: vendorForm.email || null, phone: vendorForm.phone || null,
      address: vendorForm.address || null, tax_id: vendorForm.tax_id || null,
      payment_terms: Number(vendorForm.payment_terms) || 30,
      notes: vendorForm.notes || null, updated_at: new Date().toISOString(),
    }
    const { error } = editVendorId
      ? await supabase.from('vendors').update(payload).eq('id', editVendorId)
      : await supabase.from('vendors').insert({ ...payload, branch_id: activeBranch?.id ?? null })
    if (error) { toast(error.message, 'error'); setVendorSaving(false); return }
    toast(editVendorId ? 'Vendor updated' : 'Vendor added')
    setVendorSaving(false); setVendorFormOpen(false); loadVendors()
  }
  async function toggleVendorActive(v: Vendor) {
    await supabase.from('vendors').update({ is_active: !v.is_active }).eq('id', v.id); loadVendors()
  }

  // ── Petty Cash ─────────────────────────────────────────────────

  async function savePettyCash() {
    if (!pcForm.description || Number(pcForm.amount) <= 0) { toast('Description and amount required', 'error'); return }
    setPcSaving(true)
    let jeId: string | null = null
    try {
      const cashOnHandAcct = accounts.find(a => a.code === '1010')
      const cashAtBankAcct = accounts.find(a => a.code === '1020')
      const expenseAcct    = pcForm.expense_account_id
        ? accounts.find(a => a.id === pcForm.expense_account_id)
        : accounts.find(a => a.code === '5800')
      if (cashOnHandAcct) {
        let lines: any[] = []
        if (pcForm.type === 'out' && expenseAcct) {
          lines = [
            { account_id: expenseAcct.id,    description: pcForm.description,          debit: Number(pcForm.amount), credit: 0 },
            { account_id: cashOnHandAcct.id, description: pcForm.description,          debit: 0, credit: Number(pcForm.amount) },
          ]
        } else if (pcForm.type === 'in' && cashAtBankAcct) {
          lines = [
            { account_id: cashOnHandAcct.id, description: 'Petty cash replenishment', debit: Number(pcForm.amount), credit: 0 },
            { account_id: cashAtBankAcct.id, description: 'Transfer to petty cash',   debit: 0, credit: Number(pcForm.amount) },
          ]
        }
        if (lines.length > 0) {
          const { data: je, error: jeErr } = await supabase.from('journal_entries').insert({
            entry_number: generateJournalEntryNumber(), entry_date: pcForm.date,
            reference: pcForm.reference || null, reference_type: 'petty_cash',
            description: `Petty cash ${pcForm.type} — ${pcForm.description}`,
            branch_id: activeBranch?.id ?? null,
          }).select().single()
          if (jeErr) { toast(jeErr.message, 'error'); setPcSaving(false); return }
          if (je) { 
            jeId = je.id; 
            const { error: lineErr } = await supabase.from('journal_entry_lines').insert(lines.map(l => ({ ...l, entry_id: je.id }))) 
            if (lineErr) {
              await supabase.from('journal_entries').delete().eq('id', je.id)
              toast('Failed to save journal lines', 'error'); setPcSaving(false); return
            }
          }
        }
      }
    } catch (err) { console.error('[JE] failed:', err) }

    const { error } = await supabase.from('petty_cash_transactions').insert({
      transaction_date: pcForm.date, description: pcForm.description, category: pcForm.category,
      amount: Number(pcForm.amount), transaction_type: pcForm.type,
      reference: pcForm.reference || null, journal_entry_id: jeId,
      branch_id: activeBranch?.id ?? null,
    })
    if (error) { 
      if (jeId) await supabase.from('journal_entries').delete().eq('id', jeId)
      toast(error.message, 'error'); setPcSaving(false); return 
    }
    toast(`Petty cash ${pcForm.type} recorded`)
    setPcSaving(false); setPcFormOpen(false)
    setPcForm({ date: todayStr(), description: '', category: 'Miscellaneous', amount: '', type: 'out', reference: '', expense_account_id: '' })
    loadPetty(); loadEntries()
  }

  // ── Periods ────────────────────────────────────────────────────

  async function loadPeriods() {
    if (!activeBranch) return
    const { data } = await supabase.from('accounting_periods')
      .select('*').eq('branch_id', activeBranch.id)
      .order('year', { ascending: false }).order('month', { ascending: false })
    setPeriods(data ?? [])
  }

  async function closePeriod(year: number, month: number) {
    if (!activeBranch) return
    setPeriodSaving(true)
    const existing = periods.find(p => p.year === year && p.month === month)
    if (existing) {
      await supabase.from('accounting_periods')
        .update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('accounting_periods').insert({
        year, month, status: 'closed', closed_at: new Date().toISOString(), branch_id: activeBranch.id,
      })
    }
    toast(`${MONTH_NAMES[month - 1]} ${year} closed`)
    await loadPeriods()
    setPeriodSaving(false)
  }

  async function reopenPeriod(id: string, year: number, month: number) {
    await supabase.from('accounting_periods').update({ status: 'open', closed_at: null }).eq('id', id)
    toast(`${MONTH_NAMES[month - 1]} ${year} reopened`)
    loadPeriods()
  }

  // ── Recurring ──────────────────────────────────────────────────

  async function loadRecurring() {
    if (!activeBranch) return
    const { data } = await supabase.from('recurring_journal_entries')
      .select('*').eq('branch_id', activeBranch.id).order('next_due_date')
    setRecurring(data ?? [])
  }

  async function saveRecurring() {
    if (!recurForm.name || !recurForm.description) { toast('Name and description required', 'error'); return }
    const valid = recurLines.filter(l => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
    if (valid.length < 2) { toast('At least 2 lines required', 'error'); return }
    const dr = valid.reduce((s, l) => s + Number(l.debit || 0), 0)
    const cr = valid.reduce((s, l) => s + Number(l.credit || 0), 0)
    if (Math.abs(dr - cr) > 0.001) { toast('Lines must balance (DR = CR)', 'error'); return }
    setRecurSaving(true)
    const payload = {
      name: recurForm.name, description: recurForm.description,
      frequency: recurForm.frequency, next_due_date: recurForm.next_due_date,
      lines: valid.map(l => ({ account_id: l.account_id, description: l.description || null, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })),
      updated_at: new Date().toISOString(),
    }
    const { error } = editRecurId
      ? await supabase.from('recurring_journal_entries').update(payload).eq('id', editRecurId)
      : await supabase.from('recurring_journal_entries').insert({ ...payload, branch_id: activeBranch?.id })
    if (error) { toast(error.message, 'error'); setRecurSaving(false); return }
    toast(editRecurId ? 'Template updated' : 'Template saved')
    setRecurSaving(false); setRecurFormOpen(false); loadRecurring()
  }

  async function postRecurring(rec: any) {
    if (!activeBranch) return
    const { data: je, error } = await supabase.from('journal_entries').insert({
      entry_number: generateJournalEntryNumber(),
      entry_date: rec.next_due_date,
      description: rec.description,
      reference: rec.name,
      reference_type: 'recurring',
      branch_id: activeBranch.id,
    }).select().single()
    if (error || !je) { toast(error?.message ?? 'Error', 'error'); return }
    await supabase.from('journal_entry_lines').insert(
      rec.lines.map((l: any) => ({ ...l, entry_id: je.id }))
    )
    const next = new Date(rec.next_due_date)
    if (rec.frequency === 'monthly')   next.setMonth(next.getMonth() + 1)
    else if (rec.frequency === 'quarterly') next.setMonth(next.getMonth() + 3)
    else next.setFullYear(next.getFullYear() + 1)
    await supabase.from('recurring_journal_entries').update({
      next_due_date: next.toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    }).eq('id', rec.id)
    toast(`Posted: ${je.entry_number}`)
    loadRecurring(); loadEntries()
  }

  // ── Trial Balance ──────────────────────────────────────────────

  async function loadTrialBalance() {
    if (!activeBranch) return
    setTbLoading(true)
    let q = supabase.from('journal_entries').select('id').eq('branch_id', activeBranch.id).eq('status', 'posted')
    if (tbFrom) q = q.gte('entry_date', tbFrom)
    if (tbTo)   q = q.lte('entry_date', tbTo)
    const { data: jeData } = await q
    const ids = (jeData ?? []).map((e: any) => e.id)
    if (ids.length === 0) { setTbRows([]); setTbLoading(false); return }
    const { data: lines } = await supabase.from('journal_entry_lines')
      .select('account_id, debit, credit').in('entry_id', ids)
    const map: Record<string, { dr: number; cr: number }> = {}
    for (const l of lines ?? []) {
      if (!map[l.account_id]) map[l.account_id] = { dr: 0, cr: 0 }
      map[l.account_id].dr += Number(l.debit)
      map[l.account_id].cr += Number(l.credit)
    }
    const rows = accounts
      .filter(a => map[a.id])
      .map(a => {
        const { dr, cr } = map[a.id]
        const balance = ['asset', 'expense'].includes(a.type) ? dr - cr : cr - dr
        return { ...a, dr, cr, balance }
      })
      .sort((a, b) => a.code.localeCompare(b.code))
    setTbRows(rows)
    setTbLoading(false)
  }

  // ── Reports (P&L / Balance Sheet) ─────────────────────────────

  async function loadReport() {
    if (!activeBranch) return
    setReportLoading(true)
    let q = supabase.from('journal_entries').select('id').eq('branch_id', activeBranch.id).eq('status', 'posted')
    if (reportType === 'pl' && reportFrom) q = q.gte('entry_date', reportFrom)
    if (reportTo) q = q.lte('entry_date', reportTo)
    const { data: jeData } = await q
    const ids = (jeData ?? []).map((e: any) => e.id)
    const { data: lines } = ids.length > 0
      ? await supabase.from('journal_entry_lines').select('account_id, debit, credit').in('entry_id', ids)
      : { data: [] as any[] }
    const map: Record<string, { dr: number; cr: number }> = {}
    for (const l of lines ?? []) {
      if (!map[l.account_id]) map[l.account_id] = { dr: 0, cr: 0 }
      map[l.account_id].dr += Number(l.debit)
      map[l.account_id].cr += Number(l.credit)
    }
    const withBal = accounts.map(a => {
      const { dr = 0, cr = 0 } = map[a.id] ?? {}
      const balance = ['asset', 'expense'].includes(a.type) ? dr - cr : cr - dr
      return { ...a, dr, cr, balance }
    })
    if (reportType === 'pl') {
      const revenue  = withBal.filter(a => a.type === 'revenue' && (a.dr > 0 || a.cr > 0))
      const expenses = withBal.filter(a => a.type === 'expense' && (a.dr > 0 || a.cr > 0))
      setReportData({ type: 'pl', revenue, expenses, totalRev: revenue.reduce((s, a) => s + a.balance, 0), totalExp: expenses.reduce((s, a) => s + a.balance, 0) })
    } else {
      const revAccts = withBal.filter(a => a.type === 'revenue')
      const expAccts = withBal.filter(a => a.type === 'expense')
      const netIncome = revAccts.reduce((s, a) => s + a.balance, 0) - expAccts.reduce((s, a) => s + a.balance, 0)
      setReportData({
        type: 'bs',
        assets:      withBal.filter(a => a.type === 'asset'),
        liabilities: withBal.filter(a => a.type === 'liability'),
        equity:      withBal.filter(a => a.type === 'equity'),
        totalAssets: withBal.filter(a => a.type === 'asset').reduce((s, a) => s + a.balance, 0),
        totalLiab:   withBal.filter(a => a.type === 'liability').reduce((s, a) => s + a.balance, 0),
        totalEquity: withBal.filter(a => a.type === 'equity').reduce((s, a) => s + a.balance, 0) + netIncome,
        netIncome,
      })
    }
    setReportLoading(false)
  }

  // ── Bank Reconciliation ────────────────────────────────────────

  async function loadReconciliation() {
    if (!activeBranch) return
    setReconLoading(true)
    const cashAcct = accounts.find(a => a.code === '1020')
    if (!cashAcct) { toast('Account 1020 (Cash at Bank) not found in COA', 'error'); setReconLoading(false); return }
    const { data: jeData } = await supabase.from('journal_entries')
      .select('id').eq('branch_id', activeBranch.id).eq('status', 'posted')
    const ids = (jeData ?? []).map((e: any) => e.id)
    if (ids.length === 0) { setReconLines([]); setReconLoading(false); return }
    const { data } = await supabase.from('journal_entry_lines')
      .select('*, entry:journal_entries(entry_number, entry_date, description)')
      .eq('account_id', cashAcct.id).in('entry_id', ids)
    setReconLines(
      (data ?? [])
        .filter((r: any) => r.entry)
        .sort((a: any, b: any) => a.entry.entry_date.localeCompare(b.entry.entry_date))
    )
    setReconLoading(false)
  }

  async function toggleReconciled(lineId: string, current: boolean) {
    await supabase.from('journal_entry_lines').update({ is_reconciled: !current }).eq('id', lineId)
    setReconLines(prev => prev.map(r => r.id === lineId ? { ...r, is_reconciled: !current } : r))
  }

  // ── Derived ────────────────────────────────────────────────────

  const pettyCashBalance = petty.reduce((s, t) => s + (t.transaction_type === 'in' ? Number(t.amount) : -Number(t.amount)), 0)
  const filteredPetty    = pcFilter === 'all' ? petty : petty.filter(t => t.transaction_type === pcFilter)
  const accountsByType   = ACCOUNT_TYPES.reduce((acc, type) => { acc[type] = accounts.filter(a => a.type === type); return acc }, {} as Record<AccountType, ChartOfAccount[]>)
  const expenseAccounts  = accounts.filter(a => a.type === 'expense' && a.is_active)
  const filteredAR       = arFilter === 'all' ? arInvoices : arInvoices.filter(inv => inv.status === arFilter)
  const filteredBills    = billFilter === 'all' ? bills : bills.filter(b => b.status === billFilter)
  const vendorBalance    = (vendorId: string) => bills
    .filter(b => b.vendor_id === vendorId && ['unpaid', 'partial'].includes(b.status))
    .reduce((s, b) => s + (Number(b.total) - Number(b.amount_paid)), 0)

  // ── Excel exports ──────────────────────────────────────────────

  function exportAR() {
    exportXlsx(`Receivables_${todayStr()}`, [{ name: 'Receivables', rows: filteredAR.map(inv => ({
      'Invoice #': inv.invoice_number,
      'Guest': (inv.guest as any)?.full_name ?? '',
      'Phone': (inv.guest as any)?.phone ?? '',
      'Issue Date': inv.invoice_date ?? inv.created_at,
      'Total': Number(inv.total),
      'Paid': Number(inv.amount_paid),
      'Balance': Number(inv.total) - Number(inv.amount_paid),
      'Status': inv.status,
      'Aging': agingLabel(daysPastDue(inv.invoice_date ?? inv.created_at)),
    })) }])
  }

  function exportBills() {
    exportXlsx(`Bills_AP_${todayStr()}`, [{ name: 'Bills', rows: filteredBills.map(b => ({
      'Bill #': b.bill_number,
      'Vendor': (b.vendor as any)?.name ?? '',
      'Bill Date': b.bill_date,
      'Due Date': b.due_date ?? '',
      'Description': b.description,
      'Subtotal': Number(b.subtotal),
      'Tax': Number(b.tax_amount),
      'Total': Number(b.total),
      'Paid': Number(b.amount_paid),
      'Balance': Number(b.total) - Number(b.amount_paid),
      'Status': b.status,
    })) }])
  }

  function exportVendors() {
    exportXlsx(`Vendors_${todayStr()}`, [{ name: 'Vendors', rows: vendors.map(v => ({
      'Name': v.name,
      'Contact': v.contact_name ?? '',
      'Email': v.email ?? '',
      'Phone': v.phone ?? '',
      'Payment Terms (days)': v.payment_terms,
      'Tax ID': v.tax_id ?? '',
      'Outstanding Balance': vendorBalance(v.id),
      'Active': v.is_active ? 'Yes' : 'No',
      'Notes': v.notes ?? '',
    })) }])
  }

  function exportJournalEntries() {
    exportXlsx(`Journal_Entries_${todayStr()}`, [{ name: 'Journal Entries', rows: entries.map(e => ({
      'Entry #': e.entry_number,
      'Date': e.entry_date,
      'Description': e.description,
      'Reference': e.reference ?? '',
      'Type': e.reference_type ?? '',
      'Status': e.is_void ? 'Void' : (e.status ?? 'posted'),
    })) }])
  }

  function exportLedger() {
    if (ledgerRows.length === 0) { toast('Load the ledger first', 'error'); return }
    const acct = accounts.find(a => a.id === ledgerAccountId)
    exportXlsx(`Ledger_${acct?.code ?? ''}_${todayStr()}`, [{ name: 'General Ledger', rows: ledgerRows.map(r => ({
      'Entry #': r.entry?.entry_number ?? '',
      'Date': r.entry?.entry_date ?? '',
      'Description': r.entry?.description ?? '',
      'Reference': r.entry?.reference ?? '',
      'Debit': Number(r.debit),
      'Credit': Number(r.credit),
      'Balance': Number(r.running_balance ?? 0),
    })) }])
  }

  function exportTrialBalance() {
    if (tbRows.length === 0) { toast('Load the trial balance first', 'error'); return }
    exportXlsx(`Trial_Balance_${todayStr()}`, [{ name: 'Trial Balance', rows: tbRows.map(r => ({
      'Code': r.code,
      'Account': r.name,
      'Type': r.type,
      'Category': r.category,
      'Debit': Number(r.dr),
      'Credit': Number(r.cr),
      'Balance': Number(r.balance),
    })) }])
  }

  function exportReport() {
    if (!reportData) { toast('Load the report first', 'error'); return }
    if (reportData.type === 'pl') {
      const rows = [
        { 'Section': 'REVENUE', 'Code': '', 'Account': '', 'Amount': '' },
        ...reportData.revenue.map((a: any) => ({ 'Section': '', 'Code': a.code, 'Account': a.name, 'Amount': Number(a.balance) })),
        { 'Section': '', 'Code': '', 'Account': 'Total Revenue', 'Amount': Number(reportData.totalRev) },
        { 'Section': '', 'Code': '', 'Account': '', 'Amount': '' },
        { 'Section': 'EXPENSES', 'Code': '', 'Account': '', 'Amount': '' },
        ...reportData.expenses.map((a: any) => ({ 'Section': '', 'Code': a.code, 'Account': a.name, 'Amount': Number(a.balance) })),
        { 'Section': '', 'Code': '', 'Account': 'Total Expenses', 'Amount': Number(reportData.totalExp) },
        { 'Section': '', 'Code': '', 'Account': '', 'Amount': '' },
        { 'Section': '', 'Code': '', 'Account': 'NET INCOME', 'Amount': Number(reportData.totalRev) - Number(reportData.totalExp) },
      ]
      exportXlsx(`PL_${reportFrom}_${reportTo}`, [{ name: 'P&L', rows }])
    } else {
      const rows = [
        { 'Section': 'ASSETS', 'Code': '', 'Account': '', 'Amount': '' },
        ...reportData.assets.map((a: any) => ({ 'Section': '', 'Code': a.code, 'Account': a.name, 'Amount': Number(a.balance) })),
        { 'Section': '', 'Code': '', 'Account': 'Total Assets', 'Amount': Number(reportData.totalAssets) },
        { 'Section': '', 'Code': '', 'Account': '', 'Amount': '' },
        { 'Section': 'LIABILITIES', 'Code': '', 'Account': '', 'Amount': '' },
        ...reportData.liabilities.map((a: any) => ({ 'Section': '', 'Code': a.code, 'Account': a.name, 'Amount': Number(a.balance) })),
        { 'Section': '', 'Code': '', 'Account': 'Total Liabilities', 'Amount': Number(reportData.totalLiab) },
        { 'Section': '', 'Code': '', 'Account': '', 'Amount': '' },
        { 'Section': 'EQUITY', 'Code': '', 'Account': '', 'Amount': '' },
        ...reportData.equity.map((a: any) => ({ 'Section': '', 'Code': a.code, 'Account': a.name, 'Amount': Number(a.balance) })),
        { 'Section': '', 'Code': '', 'Account': 'Net Income', 'Amount': Number(reportData.netIncome) },
        { 'Section': '', 'Code': '', 'Account': 'Total Equity', 'Amount': Number(reportData.totalEquity) },
      ]
      exportXlsx(`Balance_Sheet_${reportTo}`, [{ name: 'Balance Sheet', rows }])
    }
  }

  function exportCOA() {
    exportXlsx(`Chart_of_Accounts_${todayStr()}`, [{ name: 'Chart of Accounts', rows: accounts.map(a => ({
      'Code': a.code,
      'Name': a.name,
      'Type': a.type,
      'Category': a.category,
      'Active': a.is_active ? 'Yes' : 'No',
    })) }])
  }

  function exportPettyCash() {
    exportXlsx(`Petty_Cash_${todayStr()}`, [{ name: 'Petty Cash', rows: filteredPetty.map(t => ({
      'Date': t.transaction_date,
      'Description': t.description,
      'Category': t.category,
      'Type': t.transaction_type === 'in' ? 'Cash In' : 'Cash Out',
      'Amount': Number(t.amount),
      'In': t.transaction_type === 'in' ? Number(t.amount) : 0,
      'Out': t.transaction_type === 'out' ? Number(t.amount) : 0,
      'Reference': t.reference ?? '',
    })) }])
  }

  // ── Render ─────────────────────────────────────────────────────

  const input = 'w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg'

  return (
    <>
      <TopBar title="Accounting" subtitle={`Double-entry bookkeeping — ${activeBranch?.location ?? ''}`} />
      <div className="p-8 flex-1 section-enter">

        {/* Tab bar */}
        <div className="flex gap-1 bg-hsurface2 rounded-xl p-1 mb-6 flex-wrap w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                tab === t.key ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted hover:text-htext'
              )}
            >{t.label}</button>
          ))}
        </div>

        {/* ══ OVERVIEW ══════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'AR Outstanding',    value: formatCurrency(overview.arOutstanding),  color: '#004AAD', sub: 'Unpaid customer invoices' },
                { label: 'AP Outstanding',    value: formatCurrency(overview.apOutstanding),  color: '#B83232', sub: 'Unpaid supplier bills' },
                { label: 'Petty Cash',        value: formatCurrency(pettyCashBalance),         color: '#C89B3C', sub: '1010 — Cash on Hand' },
              ].map(s => (
                <div key={s.label} className="bg-white border border-hborder rounded-2xl p-4 shadow-card relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: s.color }} />
                  <p className="text-[11px] text-hmuted uppercase tracking-wide pl-2">{s.label}</p>
                  <p className="font-serif text-2xl text-dark-navy mt-1 pl-2">{s.value}</p>
                  <p className="text-[10px] text-hmuted pl-2 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Revenue This Month',  value: formatCurrency(overview.monthRevenue),                              color: '#1A7A4A', sub: 'From GL entries' },
                { label: 'Expenses This Month', value: formatCurrency(overview.monthExpenses),                             color: '#B83232', sub: 'From GL entries' },
                { label: 'Net Income',          value: formatCurrency(overview.monthRevenue - overview.monthExpenses),     color: '#004AAD', sub: `${overview.totalEntries} total entries` },
              ].map(s => (
                <div key={s.label} className="bg-white border border-hborder rounded-2xl p-4 shadow-card relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: s.color }} />
                  <p className="text-[11px] text-hmuted uppercase tracking-wide pl-2">{s.label}</p>
                  <p className="font-serif text-2xl text-dark-navy mt-1 pl-2">{s.value}</p>
                  <p className="text-[10px] text-hmuted pl-2 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-hborder flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-[17px] text-dark-navy">Recent Journal Entries</h3>
                  <p className="text-xs text-hmuted">Latest 10 posted entries</p>
                </div>
                <Button size="sm" onClick={() => setTab('journal')}>View All</Button>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="bg-hsurface2">
                  {['Entry #', 'Date', 'Description', 'Reference', 'Type'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {entries.slice(0, 10).map(e => (
                    <tr key={e.id} className="border-t border-hborder hover:bg-hbg/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-hmuted">{e.entry_number}</td>
                      <td className="px-4 py-2.5 text-xs text-hmuted">{formatDate(e.entry_date)}</td>
                      <td className="px-4 py-2.5 text-htext">{e.description}</td>
                      <td className="px-4 py-2.5 text-xs text-hmuted font-mono">{e.reference ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="bg-hsurface2 text-hmuted text-[10px] px-2 py-0.5 rounded-full capitalize">
                          {(e.reference_type ?? 'manual').replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-hmuted">No entries yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ RECEIVABLES (AR) ══════════════════════════════════════ */}
        {tab === 'ar' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1 bg-hsurface2 rounded-xl p-1">
                {(['all', 'unpaid', 'partial', 'paid'] as const).map(f => (
                  <button key={f} onClick={() => setArFilter(f)}
                    className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize',
                      arFilter === f ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted hover:text-htext'
                    )}
                  >{f === 'all' ? 'All' : capitalize(f)}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setShowAgingReport(true)}>Aging Report</Button>
                <Button variant="ghost" onClick={exportAR}>↓ Export</Button>
              </div>
            </div>
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-hborder">
                <h3 className="font-serif text-[17px] text-dark-navy">Accounts Receivable</h3>
                <p className="text-xs text-hmuted">
                  {filteredAR.filter((i: any) => i.status !== 'paid' && i.status !== 'void').length} outstanding ·{' '}
                  {formatCurrency(filteredAR.filter((i: any) => i.status !== 'paid' && i.status !== 'void').reduce((s: number, i: any) => s + (Number(i.total) - Number(i.amount_paid)), 0))} balance
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-hsurface2">
                    {['Invoice #', 'Guest', 'House', 'Date Issued', 'Due Date', 'Total', 'Paid', 'Balance', 'Aging', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredAR.length === 0 ? (
                      <tr><td colSpan={10} className="px-5 py-10 text-center text-hmuted">No invoices found</td></tr>
                    ) : filteredAR.map((inv: any) => {
                      const issueDate = inv.invoice_date ?? inv.created_at
                      const od        = daysPastDue(issueDate)
                      const due       = new Date(issueDate); due.setDate(due.getDate() + 30)
                      const balance   = Number(inv.total) - Number(inv.amount_paid)
                      return (
                        <tr key={inv.id} className="border-t border-hborder hover:bg-hbg/40">
                          <td className="px-4 py-2.5 font-mono text-xs text-hmuted whitespace-nowrap">{inv.invoice_number}</td>
                          <td className="px-4 py-2.5 text-htext">{inv.guest?.full_name ?? '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-hmuted">{inv.house?.name ?? '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-hmuted whitespace-nowrap">{formatDate(issueDate)}</td>
                          <td className="px-4 py-2.5 text-xs text-hmuted whitespace-nowrap">{formatDate(due.toISOString())}</td>
                          <td className="px-4 py-2.5 font-medium text-right">{formatCurrency(inv.total)}</td>
                          <td className="px-4 py-2.5 text-right text-green-700">{formatCurrency(inv.amount_paid)}</td>
                          <td className="px-4 py-2.5 font-semibold text-right text-dark-navy">{formatCurrency(balance)}</td>
                          <td className="px-4 py-2.5">
                            {inv.status !== 'paid' && inv.status !== 'void' && (
                              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap', agingColor(od))}>
                                {agingLabel(od)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize',
                              inv.status === 'paid'    ? 'bg-green-100 text-green-700' :
                              inv.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                              inv.status === 'void'    ? 'bg-gray-100 text-gray-500' :
                              'bg-red-100 text-red-700'
                            )}>{inv.status}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ BILLS (AP) ════════════════════════════════════════════ */}
        {tab === 'bills' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1 bg-hsurface2 rounded-xl p-1">
                {(['all', 'unpaid', 'partial', 'paid'] as const).map(f => (
                  <button key={f} onClick={() => setBillFilter(f)}
                    className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize',
                      billFilter === f ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted hover:text-htext'
                    )}
                  >{f === 'all' ? 'All' : capitalize(f)}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={exportBills}>↓ Export</Button>
                <Button onClick={() => setBillFormOpen(true)}>+ New Bill</Button>
              </div>
            </div>
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-hborder">
                <h3 className="font-serif text-[17px] text-dark-navy">Bills — Accounts Payable</h3>
                <p className="text-xs text-hmuted">
                  {filteredBills.filter(b => b.status !== 'paid' && b.status !== 'void').length} outstanding ·{' '}
                  {formatCurrency(filteredBills.filter(b => b.status !== 'paid' && b.status !== 'void').reduce((s, b) => s + (Number(b.total) - Number(b.amount_paid)), 0))} balance
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-hsurface2">
                    {['Bill #', 'Vendor', 'Description', 'Account', 'Bill Date', 'Due Date', 'Total', 'Paid', 'Balance', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredBills.length === 0 ? (
                      <tr><td colSpan={11} className="px-5 py-10 text-center text-hmuted">No bills found. Click + New Bill to record a supplier bill.</td></tr>
                    ) : filteredBills.map(b => {
                      const balance = Number(b.total) - Number(b.amount_paid)
                      const vendor  = (b as any).vendor
                      const expAcct = (b as any).expense_account
                      return (
                        <tr key={b.id} className="border-t border-hborder hover:bg-hbg/40">
                          <td className="px-4 py-2.5 font-mono text-xs text-hmuted whitespace-nowrap">{b.bill_number}</td>
                          <td className="px-4 py-2.5 text-htext">{vendor?.name ?? '—'}</td>
                          <td className="px-4 py-2.5 text-htext max-w-[180px] truncate">{b.description}</td>
                          <td className="px-4 py-2.5 text-xs text-hmuted font-mono">{expAcct ? `${expAcct.code}` : '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-hmuted whitespace-nowrap">{formatDate(b.bill_date)}</td>
                          <td className="px-4 py-2.5 text-xs text-hmuted whitespace-nowrap">{b.due_date ? formatDate(b.due_date) : '—'}</td>
                          <td className="px-4 py-2.5 font-medium text-right">{formatCurrency(b.total)}</td>
                          <td className="px-4 py-2.5 text-right text-green-700">{formatCurrency(b.amount_paid)}</td>
                          <td className="px-4 py-2.5 font-semibold text-right">{formatCurrency(balance)}</td>
                          <td className="px-4 py-2.5">
                            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize',
                              b.status === 'paid'    ? 'bg-green-100 text-green-700' :
                              b.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                              b.status === 'void'    ? 'bg-gray-100 text-gray-500' :
                              'bg-red-100 text-red-700'
                            )}>{b.status}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            {b.status !== 'paid' && b.status !== 'void' && (
                              <button
                                onClick={() => { setSelectedBill(b); setBillPayForm(f => ({ ...f, amount: String(balance) })); setBillPayOpen(true) }}
                                className="text-xs text-navy hover:underline font-medium"
                              >Pay</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ VENDORS ═══════════════════════════════════════════════ */}
        {tab === 'vendors' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-hmuted">{vendors.length} vendors · {vendors.filter(v => v.is_active).length} active</p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={exportVendors}>↓ Export</Button>
                <Button onClick={openAddVendor}>+ Add Vendor</Button>
              </div>
            </div>
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-hsurface2">
                  {['Vendor Name', 'Contact', 'Phone', 'Email', 'Terms', 'Outstanding', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {vendors.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-hmuted">No vendors yet. Add the suppliers you regularly pay.</td></tr>
                  ) : vendors.map(v => (
                    <tr key={v.id} className={cn('border-t border-hborder hover:bg-hbg/40', !v.is_active && 'opacity-50')}>
                      <td className="px-4 py-2.5 font-medium text-htext">{v.name}</td>
                      <td className="px-4 py-2.5 text-xs text-hmuted">{v.contact_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-hmuted">{v.phone ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-hmuted">{v.email ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-hmuted">Net {v.payment_terms}</td>
                      <td className="px-4 py-2.5 font-semibold text-dark-navy">{formatCurrency(vendorBalance(v.id))}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium',
                          v.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        )}>{v.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2">
                          <button onClick={() => openEditVendor(v)} className="text-xs text-navy hover:underline">Edit</button>
                          <button onClick={() => toggleVendorActive(v)} className="text-xs text-hmuted hover:text-htext hover:underline">
                            {v.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ JOURNAL ENTRIES ═══════════════════════════════════════ */}
        {tab === 'journal' && (
          <div>
            <div className="flex justify-end gap-2 mb-4">
              <Button variant="ghost" onClick={exportJournalEntries}>↓ Export</Button>
              <Button onClick={openAddEntry}>+ New Entry</Button>
            </div>
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-hsurface2">
                  {['', 'Entry #', 'Date', 'Description', 'Reference', 'Type', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-hmuted">No journal entries. Entries auto-post when transactions are recorded.</td></tr>
                  ) : entries.map(e => (
                    <>
                      <tr key={e.id} className={cn('border-t border-hborder hover:bg-hbg/40 cursor-pointer', e.is_void && 'opacity-50 bg-gray-50/60', e.status === 'draft' && !e.is_void && 'bg-amber-50/40')}
                        onClick={async () => {
                          if (expandedEntryId === e.id) { setExpandedEntryId(null); return }
                          setExpandedEntryId(e.id); await loadEntryLines(e.id)
                        }}
                      >
                        <td className="px-3 py-2.5 text-hmuted text-xs">{expandedEntryId === e.id ? '▾' : '▸'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-hmuted">
                          <span className={e.is_void ? 'line-through' : ''}>{e.entry_number}</span>
                          {e.is_void && <span className="ml-1.5 text-[9px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-bold uppercase">VOID</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-hmuted whitespace-nowrap">{formatDate(e.entry_date)}</td>
                        <td className="px-4 py-2.5 text-htext">{e.description}</td>
                        <td className="px-4 py-2.5 text-xs text-hmuted font-mono">{e.reference ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className="bg-hsurface2 text-hmuted text-[10px] px-2 py-0.5 rounded-full capitalize">
                            {(e.reference_type ?? 'manual').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {e.is_void
                            ? <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold uppercase">Void</span>
                            : e.status === 'draft'
                              ? <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase">Draft</span>
                              : <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase">Posted</span>
                          }
                        </td>
                        <td className="px-4 py-2.5" onClick={ev => ev.stopPropagation()}>
                          {!e.is_void && (
                            <div className="flex items-center gap-1.5">
                              {e.status === 'draft' && (
                                <>
                                  <button
                                    onClick={() => openEditJe(e)}
                                    className="text-[11px] font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
                                  >Edit</button>
                                  <button
                                    onClick={() => postJournalEntry(e)}
                                    className="text-[11px] font-medium text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 px-2 py-1 rounded transition-colors"
                                  >Post</button>
                                </>
                              )}
                              {e.status === 'posted' && (
                                <button
                                  onClick={() => unpostJournalEntry(e)}
                                  className="text-[11px] font-medium text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded transition-colors"
                                >Unpost</button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                      {expandedEntryId === e.id && entryLines[e.id] && (
                        <tr key={`${e.id}-lines`} className="bg-hbg/50">
                          <td colSpan={7} className="px-8 py-3">
                            <table className="w-full text-xs">
                              <thead><tr>
                                {['Account', 'Description', 'Debit', 'Credit'].map(h => (
                                  <th key={h} className={cn('pb-1.5 font-semibold text-hmuted', h.match(/Debit|Credit/) ? 'text-right' : 'text-left')}>{h}</th>
                                ))}
                              </tr></thead>
                              <tbody>
                                {entryLines[e.id].map((l: any) => (
                                  <tr key={l.id} className="border-t border-hborder/40">
                                    <td className="py-1.5 text-navy font-mono">{l.account?.code} — {l.account?.name}</td>
                                    <td className="py-1.5 text-hmuted">{l.description ?? ''}</td>
                                    <td className="py-1.5 text-right font-medium">{Number(l.debit)  > 0 ? formatCurrency(l.debit)  : ''}</td>
                                    <td className="py-1.5 text-right font-medium">{Number(l.credit) > 0 ? formatCurrency(l.credit) : ''}</td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-hborder">
                                  <td colSpan={2} className="py-1.5 font-semibold text-hmuted">Totals</td>
                                  <td className="py-1.5 text-right font-bold">{formatCurrency(entryLines[e.id].reduce((s: number, l: any) => s + Number(l.debit), 0))}</td>
                                  <td className="py-1.5 text-right font-bold">{formatCurrency(entryLines[e.id].reduce((s: number, l: any) => s + Number(l.credit), 0))}</td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ GENERAL LEDGER ════════════════════════════════════════ */}
        {tab === 'ledger' && (
          <div>
            <div className="flex items-end gap-3 mb-5 bg-white border border-hborder rounded-2xl p-4 shadow-card">
              <div className="flex-1">
                <label className="block text-xs text-hmuted mb-1">Account</label>
                <select value={ledgerAccountId} onChange={e => setLedgerAccountId(e.target.value)} className={input}>
                  <option value="">Select account…</option>
                  {ACCOUNT_TYPES.map(type => (
                    <optgroup key={type} label={capitalize(type)}>
                      {accountsByType[type].filter(a => a.is_active).map(a => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">From</label>
                <input type="date" value={ledgerFrom} onChange={e => setLedgerFrom(e.target.value)} className={input} />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">To</label>
                <input type="date" value={ledgerTo} onChange={e => setLedgerTo(e.target.value)} className={input} />
              </div>
              <Button onClick={loadLedger} disabled={!ledgerAccountId}>Load Ledger</Button>
              {ledgerRows.length > 0 && <Button variant="ghost" onClick={exportLedger}>↓ Export</Button>}
            </div>

            {ledgerLoading ? (
              <p className="text-center text-hmuted py-10">Loading…</p>
            ) : ledgerAccountId && ledgerRows.length === 0 ? (
              <p className="text-center text-hmuted py-10">No transactions for this account in the selected period.</p>
            ) : ledgerRows.length > 0 && (() => {
              const acct = accounts.find(a => a.id === ledgerAccountId)!
              return (
                <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-hborder">
                    <h3 className="font-serif text-[17px] text-dark-navy">{acct.code} — {acct.name}</h3>
                    <p className="text-xs text-hmuted capitalize">{acct.type} · Normal balance: {normalBalance(acct.type)}</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-hsurface2">
                      {['Date', 'Entry #', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {ledgerRows.map((r: any, i) => (
                        <tr key={r.id} className={cn('border-t border-hborder', i % 2 === 1 ? 'bg-hbg/30' : '')}>
                          <td className="px-4 py-2.5 text-xs text-hmuted whitespace-nowrap">{formatDate(r.entry.entry_date)}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-hmuted">{r.entry.entry_number}</td>
                          <td className="px-4 py-2.5 text-htext">{r.entry.description}</td>
                          <td className="px-4 py-2.5 text-xs text-hmuted font-mono">{r.entry.reference ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right font-medium">{Number(r.debit)  > 0 ? formatCurrency(r.debit)  : ''}</td>
                          <td className="px-4 py-2.5 text-right font-medium">{Number(r.credit) > 0 ? formatCurrency(r.credit) : ''}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-dark-navy whitespace-nowrap">{formatCurrency(r.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-dark-navy text-white">
                        <td colSpan={4} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Totals</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(ledgerRows.reduce((s, r) => s + Number(r.debit), 0))}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(ledgerRows.reduce((s, r) => s + Number(r.credit), 0))}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(ledgerRows[ledgerRows.length - 1]?.running_balance ?? 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })()}
          </div>
        )}

        {/* ══ TRIAL BALANCE ═════════════════════════════════════════ */}
        {tab === 'trial_balance' && (
          <div>
            <div className="flex items-end gap-3 mb-5 bg-white border border-hborder rounded-2xl p-4 shadow-card flex-wrap">
              <div>
                <label className="block text-xs text-hmuted mb-1">From</label>
                <input type="date" value={tbFrom} onChange={e => setTbFrom(e.target.value)} className={input} />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">To</label>
                <input type="date" value={tbTo} onChange={e => setTbTo(e.target.value)} className={input} />
              </div>
              <Button onClick={loadTrialBalance} disabled={tbLoading}>{tbLoading ? 'Computing…' : 'Generate'}</Button>
              {tbRows.length > 0 && <Button variant="ghost" onClick={() => window.print()}>Print</Button>}
              {tbRows.length > 0 && <Button variant="ghost" onClick={exportTrialBalance}>↓ Export</Button>}
            </div>
            {tbRows.length > 0 ? (
              <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-hborder">
                  <h3 className="font-serif text-[17px] text-dark-navy">Trial Balance</h3>
                  <p className="text-xs text-hmuted">{tbFrom} — {tbTo} · {activeBranch?.location}</p>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="bg-hsurface2">
                    {['Code','Account Name','Type','Debit ($)','Credit ($)','Balance ($)'].map(h => (
                      <th key={h} className={cn('px-4 py-3 text-[11px] font-semibold text-hmuted uppercase tracking-wide', h.includes('$') ? 'text-right' : 'text-left')}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {tbRows.map((r, i) => (
                      <tr key={r.id} className={cn('border-t border-hborder', i % 2 === 1 ? 'bg-hbg/30' : '')}>
                        <td className="px-4 py-2 font-mono text-xs text-navy">{r.code}</td>
                        <td className="px-4 py-2 text-htext">{r.name}</td>
                        <td className="px-4 py-2"><span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', TYPE_COLOR[r.type as AccountType])}>{r.type}</span></td>
                        <td className="px-4 py-2 text-right text-hmuted">{r.dr > 0 ? formatCurrency(r.dr) : ''}</td>
                        <td className="px-4 py-2 text-right text-hmuted">{r.cr > 0 ? formatCurrency(r.cr) : ''}</td>
                        <td className={cn('px-4 py-2 text-right font-semibold', r.balance < 0 ? 'text-red-600' : 'text-dark-navy')}>{formatCurrency(Math.abs(r.balance))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const totDr = tbRows.reduce((s, r) => s + r.dr, 0)
                      const totCr = tbRows.reduce((s, r) => s + r.cr, 0)
                      const balanced = Math.abs(totDr - totCr) < 0.01
                      return (
                        <tr className="bg-dark-navy text-white">
                          <td colSpan={3} className="px-4 py-3 font-bold text-sm uppercase tracking-wide">Totals</td>
                          <td className="px-4 py-3 text-right font-bold">{formatCurrency(totDr)}</td>
                          <td className="px-4 py-3 text-right font-bold">{formatCurrency(totCr)}</td>
                          <td className="px-4 py-3 text-right font-bold">
                            {balanced ? <span className="text-green-300">✓ Balanced</span> : <span className="text-red-300">⚠ Unbalanced</span>}
                          </td>
                        </tr>
                      )
                    })()}
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-center text-hmuted py-16">Select a date range and click Generate.</p>
            )}
          </div>
        )}

        {/* ══ P&L / BALANCE SHEET ═══════════════════════════════════ */}
        {tab === 'reports' && (
          <div>
            <div className="flex items-end gap-3 mb-5 bg-white border border-hborder rounded-2xl p-4 shadow-card flex-wrap">
              <div className="flex gap-1 bg-hsurface2 rounded-xl p-1">
                {(['pl', 'bs'] as const).map(t => (
                  <button key={t} onClick={() => { setReportType(t); setReportData(null) }}
                    className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                      reportType === t ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted hover:text-htext'
                    )}>{t === 'pl' ? 'Income Statement' : 'Balance Sheet'}</button>
                ))}
              </div>
              {reportType === 'pl' && (
                <div>
                  <label className="block text-xs text-hmuted mb-1">From</label>
                  <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className={input} />
                </div>
              )}
              <div>
                <label className="block text-xs text-hmuted mb-1">{reportType === 'pl' ? 'To' : 'As of'}</label>
                <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className={input} />
              </div>
              <Button onClick={loadReport} disabled={reportLoading}>{reportLoading ? 'Computing…' : 'Generate'}</Button>
              {reportData && <Button variant="ghost" onClick={() => window.print()}>Print</Button>}
              {reportData && <Button variant="ghost" onClick={exportReport}>↓ Export</Button>}
            </div>

            {reportData?.type === 'pl' && (
              <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-hborder">
                  <h3 className="font-serif text-[17px] text-dark-navy">Income Statement</h3>
                  <p className="text-xs text-hmuted">{reportFrom} — {reportTo} · {activeBranch?.location}</p>
                </div>
                <div className="p-5 space-y-5">
                  <div>
                    <p className="text-xs font-bold text-hmuted uppercase tracking-wide mb-2">Revenue</p>
                    {reportData.revenue.map((a: any) => (
                      <div key={a.id} className="flex justify-between py-1.5 border-b border-hborder/40 text-sm">
                        <span className="text-htext">{a.code} — {a.name}</span>
                        <span className="font-medium text-green-700">{formatCurrency(a.balance)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 font-bold text-dark-navy">
                      <span>Total Revenue</span><span>{formatCurrency(reportData.totalRev)}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-hmuted uppercase tracking-wide mb-2">Expenses</p>
                    {reportData.expenses.map((a: any) => (
                      <div key={a.id} className="flex justify-between py-1.5 border-b border-hborder/40 text-sm">
                        <span className="text-htext">{a.code} — {a.name}</span>
                        <span className="font-medium text-red-600">{formatCurrency(a.balance)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 font-bold text-dark-navy">
                      <span>Total Expenses</span><span>{formatCurrency(reportData.totalExp)}</span>
                    </div>
                  </div>
                  <div className={cn('flex justify-between p-4 rounded-xl font-bold text-lg', reportData.totalRev - reportData.totalExp >= 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700')}>
                    <span>Net {reportData.totalRev - reportData.totalExp >= 0 ? 'Income' : 'Loss'}</span>
                    <span>{formatCurrency(Math.abs(reportData.totalRev - reportData.totalExp))}</span>
                  </div>
                </div>
              </div>
            )}

            {reportData?.type === 'bs' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-hborder bg-green-50">
                    <p className="font-bold text-green-800 text-sm uppercase tracking-wide">Assets</p>
                  </div>
                  <div className="p-4 space-y-1">
                    {reportData.assets.map((a: any) => (
                      <div key={a.id} className="flex justify-between py-1 text-sm border-b border-hborder/30">
                        <span className="text-htext">{a.code} — {a.name}</span>
                        <span className={cn('font-medium', a.balance < 0 ? 'text-red-500' : '')}>{formatCurrency(a.balance)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-3 font-bold text-dark-navy border-t-2 border-hborder">
                      <span>Total Assets</span><span>{formatCurrency(reportData.totalAssets)}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-hborder bg-red-50">
                      <p className="font-bold text-red-800 text-sm uppercase tracking-wide">Liabilities</p>
                    </div>
                    <div className="p-4 space-y-1">
                      {reportData.liabilities.map((a: any) => (
                        <div key={a.id} className="flex justify-between py-1 text-sm border-b border-hborder/30">
                          <span className="text-htext">{a.code} — {a.name}</span>
                          <span className="font-medium">{formatCurrency(a.balance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 font-semibold text-dark-navy border-t border-hborder">
                        <span>Total Liabilities</span><span>{formatCurrency(reportData.totalLiab)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-hborder bg-purple-50">
                      <p className="font-bold text-purple-800 text-sm uppercase tracking-wide">Equity</p>
                    </div>
                    <div className="p-4 space-y-1">
                      {reportData.equity.map((a: any) => (
                        <div key={a.id} className="flex justify-between py-1 text-sm border-b border-hborder/30">
                          <span className="text-htext">{a.code} — {a.name}</span>
                          <span className="font-medium">{formatCurrency(a.balance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-1 text-sm border-b border-hborder/30">
                        <span className="text-htext italic">Current Period Net Income</span>
                        <span className={cn('font-medium', reportData.netIncome < 0 ? 'text-red-500' : 'text-green-700')}>{formatCurrency(reportData.netIncome)}</span>
                      </div>
                      <div className="flex justify-between pt-2 font-semibold text-dark-navy border-t border-hborder">
                        <span>Total Equity</span><span>{formatCurrency(reportData.totalEquity)}</span>
                      </div>
                    </div>
                  </div>
                  <div className={cn('p-4 rounded-xl font-bold text-sm flex justify-between', Math.abs(reportData.totalAssets - reportData.totalLiab - reportData.totalEquity) < 0.01 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700')}>
                    <span>Balance Check (Assets = Liab + Equity)</span>
                    <span>{Math.abs(reportData.totalAssets - reportData.totalLiab - reportData.totalEquity) < 0.01 ? '✓ Balanced' : `⚠ Off by ${formatCurrency(Math.abs(reportData.totalAssets - reportData.totalLiab - reportData.totalEquity))}`}</span>
                  </div>
                </div>
              </div>
            )}

            {!reportData && !reportLoading && (
              <p className="text-center text-hmuted py-16">Select a report type and date range, then click Generate.</p>
            )}
          </div>
        )}

        {/* ══ BANK RECONCILIATION ═══════════════════════════════════ */}
        {tab === 'reconciliation' && (
          <div>
            <div className="flex items-end gap-4 mb-5 bg-white border border-hborder rounded-2xl p-4 shadow-card flex-wrap">
              <div>
                <label className="block text-xs text-hmuted mb-1">Statement Balance ($)</label>
                <input type="number" step="0.01" value={reconStmtBal} onChange={e => setReconStmtBal(e.target.value)} placeholder="0.00" className={input} style={{ width: 160 }} />
              </div>
              <Button onClick={loadReconciliation} disabled={reconLoading}>{reconLoading ? 'Loading…' : 'Load Transactions'}</Button>
              <p className="text-xs text-hmuted self-end pb-2">Loads all 1020 Cash at Bank transactions. Check off items that appear on the bank statement.</p>
            </div>

            {reconLines.length > 0 && (() => {
              const bookBal     = reconLines.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0)
              const clearedBal  = reconLines.filter(r => r.is_reconciled).reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0)
              const stmtBal     = Number(reconStmtBal) || 0
              const diff        = clearedBal - stmtBal
              return (
                <>
                  <div className="grid grid-cols-4 gap-4 mb-5">
                    {[
                      { label: 'Book Balance',     value: bookBal,    color: 'text-dark-navy' },
                      { label: 'Cleared Balance',  value: clearedBal, color: 'text-dark-navy' },
                      { label: 'Statement Balance',value: stmtBal,    color: 'text-dark-navy' },
                      { label: 'Difference',       value: diff,       color: Math.abs(diff) < 0.01 ? 'text-green-700' : 'text-red-600' },
                    ].map(c => (
                      <div key={c.label} className="bg-white border border-hborder rounded-2xl p-4 shadow-card">
                        <p className="text-xs text-hmuted">{c.label}</p>
                        <p className={cn('font-serif text-xl mt-1', c.color)}>{formatCurrency(c.value)}</p>
                        {c.label === 'Difference' && Math.abs(diff) < 0.01 && <p className="text-xs text-green-600 mt-0.5">✓ Reconciled</p>}
                      </div>
                    ))}
                  </div>
                  <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-hsurface2">
                        <th className="px-3 py-3 w-10" />
                        {['Date','Entry #','Description','Debit','Credit','Cleared'].map(h => (
                          <th key={h} className={cn('px-4 py-3 text-[11px] font-semibold text-hmuted uppercase tracking-wide', h.match(/Debit|Credit/) ? 'text-right' : 'text-left')}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {reconLines.map((r: any) => (
                          <tr key={r.id} className={cn('border-t border-hborder transition-colors', r.is_reconciled ? 'bg-green-50/60' : 'hover:bg-hbg/40')}>
                            <td className="px-3 py-2.5 text-center">
                              <input type="checkbox" checked={r.is_reconciled} onChange={() => toggleReconciled(r.id, r.is_reconciled)}
                                className="w-4 h-4 accent-green-600 cursor-pointer" />
                            </td>
                            <td className="px-4 py-2.5 text-xs text-hmuted whitespace-nowrap">{formatDate(r.entry?.entry_date)}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-hmuted">{r.entry?.entry_number}</td>
                            <td className="px-4 py-2.5 text-htext max-w-[240px] truncate">{r.entry?.description}</td>
                            <td className="px-4 py-2.5 text-right font-medium">{Number(r.debit) > 0 ? formatCurrency(r.debit) : ''}</td>
                            <td className="px-4 py-2.5 text-right font-medium">{Number(r.credit) > 0 ? formatCurrency(r.credit) : ''}</td>
                            <td className="px-4 py-2.5 text-center">{r.is_reconciled ? <span className="text-green-600 font-bold">✓</span> : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            })()}
            {reconLines.length === 0 && !reconLoading && (
              <p className="text-center text-hmuted py-16">Click Load Transactions to begin reconciliation of account 1020 Cash at Bank.</p>
            )}
          </div>
        )}

        {/* ══ RECURRING ENTRIES ═════════════════════════════════════ */}
        {tab === 'recurring' && (
          <div>
            <div className="flex justify-end mb-4">
              <Button onClick={() => {
                setEditRecurId(null)
                setRecurForm({ name: '', description: '', frequency: 'monthly', next_due_date: todayStr() })
                setRecurLines([emptyJeLine(), emptyJeLine()])
                setRecurFormOpen(true)
              }}>+ New Template</Button>
            </div>
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-hsurface2">
                  {['Template Name','Description','Frequency','Next Due','Active','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {recurring.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-hmuted">No recurring templates yet. Create one for monthly salary, rent, utilities, etc.</td></tr>
                  ) : recurring.map(rec => (
                    <tr key={rec.id} className={cn('border-t border-hborder hover:bg-hbg/40', !rec.is_active && 'opacity-50')}>
                      <td className="px-4 py-2.5 font-medium text-htext">{rec.name}</td>
                      <td className="px-4 py-2.5 text-xs text-hmuted max-w-[200px] truncate">{rec.description}</td>
                      <td className="px-4 py-2.5 text-xs text-hmuted capitalize">{rec.frequency}</td>
                      <td className="px-4 py-2.5 text-xs text-hmuted whitespace-nowrap">{formatDate(rec.next_due_date)}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', rec.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                          {rec.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-3">
                          <button onClick={() => postRecurring(rec)} className="text-xs text-navy hover:underline font-medium">Post Now</button>
                          <button onClick={() => {
                            setEditRecurId(rec.id)
                            setRecurForm({ name: rec.name, description: rec.description, frequency: rec.frequency, next_due_date: rec.next_due_date })
                            setRecurLines(rec.lines.length > 0 ? rec.lines.map((l: any) => ({ ...l, debit: l.debit || '', credit: l.credit || '' })) : [emptyJeLine(), emptyJeLine()])
                            setRecurFormOpen(true)
                          }} className="text-xs text-hmuted hover:text-htext hover:underline">Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ ACCOUNTING PERIODS ════════════════════════════════════ */}
        {tab === 'periods' && (
          <div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
              <strong>Period Close:</strong> Closing a period blocks new journal entries dated in that month. Reopen to make corrections. Year-end close entries (transferring P&L to Retained Earnings) should be posted manually as a closing-type journal entry.
            </div>
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-hsurface2">
                  {['Period','Status','Closed At','Action'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {Array.from({ length: 24 }, (_, i) => {
                    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
                    const year = d.getFullYear(), month = d.getMonth() + 1
                    const period = periods.find(p => p.year === year && p.month === month)
                    const isClosed = period?.status === 'closed'
                    return (
                      <tr key={`${year}-${month}`} className={cn('border-t border-hborder', isClosed ? 'bg-gray-50/60' : 'hover:bg-hbg/40')}>
                        <td className="px-5 py-3 font-medium text-htext">{MONTH_NAMES[month - 1]} {year}</td>
                        <td className="px-5 py-3">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', isClosed ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700')}>
                            {isClosed ? '🔒 Closed' : '🔓 Open'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-hmuted">{period?.closed_at ? formatDate(period.closed_at) : '—'}</td>
                        <td className="px-5 py-3">
                          {isClosed ? (
                            <button onClick={() => reopenPeriod(period!.id, year, month)} className="text-xs text-navy hover:underline">Reopen</button>
                          ) : (
                            <button onClick={() => closePeriod(year, month)} disabled={periodSaving} className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50">Close Period</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ CHART OF ACCOUNTS ═════════════════════════════════════ */}
        {tab === 'coa' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-hmuted">{accounts.length} accounts · {accounts.filter(a => a.is_active).length} active</p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={exportCOA}>↓ Export</Button>
                <Button onClick={openAddAccount}>+ Add Account</Button>
              </div>
            </div>
            <div className="space-y-4">
              {ACCOUNT_TYPES.map(type => {
                const group = accountsByType[type]
                if (group.length === 0) return null
                return (
                  <div key={type} className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-hborder flex items-center gap-2">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide', TYPE_COLOR[type])}>{type}</span>
                      <span className="text-xs text-hmuted">{group.length} accounts</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-hsurface2/50">
                        {['Code', 'Name', 'Category', 'Status', 'Actions'].map(h => (
                          <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {group.map(acct => (
                          <tr key={acct.id} className={cn('border-t border-hborder', !acct.is_active && 'opacity-50')}>
                            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-navy">{acct.code}</td>
                            <td className="px-4 py-2.5 font-medium text-htext">{acct.name}</td>
                            <td className="px-4 py-2.5 text-xs text-hmuted capitalize">{acct.category.replace(/_/g, ' ')}</td>
                            <td className="px-4 py-2.5">
                              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', acct.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                                {acct.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex gap-2">
                                <button onClick={() => openEditAccount(acct)} className="text-xs text-navy hover:underline">Edit</button>
                                <button onClick={() => toggleAccountActive(acct)} className="text-xs text-hmuted hover:text-htext hover:underline">
                                  {acct.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══ PETTY CASH ════════════════════════════════════════════ */}
        {tab === 'petty' && (
          <div>
            <div className="grid grid-cols-4 gap-4 mb-5">
              <div className="col-span-1 bg-white border border-hborder rounded-2xl p-5 shadow-card relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl bg-gold" />
                <p className="text-xs text-hmuted uppercase tracking-wide pl-2">Petty Cash Balance</p>
                <p className={cn('font-serif text-3xl mt-1 pl-2', pettyCashBalance < 0 ? 'text-red-600' : 'text-dark-navy')}>
                  {formatCurrency(pettyCashBalance)}
                </p>
                <p className="text-[10px] text-hmuted pl-2 mt-1">1010 — Cash on Hand</p>
              </div>
              <div className="bg-white border border-hborder rounded-2xl p-4 shadow-card">
                <p className="text-xs text-hmuted uppercase tracking-wide">Total In</p>
                <p className="font-serif text-xl text-green-700 mt-1">
                  {formatCurrency(petty.filter(t => t.transaction_type === 'in').reduce((s, t) => s + Number(t.amount), 0))}
                </p>
              </div>
              <div className="bg-white border border-hborder rounded-2xl p-4 shadow-card">
                <p className="text-xs text-hmuted uppercase tracking-wide">Total Out</p>
                <p className="font-serif text-xl text-red-600 mt-1">
                  {formatCurrency(petty.filter(t => t.transaction_type === 'out').reduce((s, t) => s + Number(t.amount), 0))}
                </p>
              </div>
              <div className="bg-white border border-hborder rounded-2xl p-4 shadow-card flex items-end justify-end">
                <Button onClick={() => { setPcForm(f => ({ ...f, type: 'out' })); setPcFormOpen(true) }}>+ Record Transaction</Button>
              </div>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1 bg-hsurface2 rounded-xl p-1">
                {(['all', 'in', 'out'] as const).map(f => (
                  <button key={f} onClick={() => setPcFilter(f)}
                    className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize',
                      pcFilter === f ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted hover:text-htext'
                    )}
                  >{f === 'all' ? 'All' : f === 'in' ? 'Cash In' : 'Cash Out'}</button>
                ))}
              </div>
              <Button variant="ghost" onClick={exportPettyCash}>↓ Export</Button>
            </div>
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-hsurface2">
                  {['Date', 'Description', 'Category', 'Type', 'Amount', 'Reference'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredPetty.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-hmuted">No petty cash transactions yet</td></tr>
                  ) : filteredPetty.map(t => (
                    <tr key={t.id} className="border-t border-hborder hover:bg-hbg/40">
                      <td className="px-4 py-3 text-xs text-hmuted whitespace-nowrap">{formatDate(t.transaction_date)}</td>
                      <td className="px-4 py-3 text-htext">{t.description}</td>
                      <td className="px-4 py-3 text-xs text-hmuted">{t.category}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', t.transaction_type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
                          {t.transaction_type === 'in' ? '↑ In' : '↓ Out'}
                        </span>
                      </td>
                      <td className={cn('px-4 py-3 font-semibold', t.transaction_type === 'in' ? 'text-green-700' : 'text-red-600')}>
                        {t.transaction_type === 'out' ? '-' : '+'}{formatCurrency(t.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs text-hmuted font-mono">{t.reference ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── COA Modal ── */}
      <Modal open={coaFormOpen} onClose={() => setCoaFormOpen(false)} title={editAccountId ? 'Edit Account' : 'Add Account'} size="sm">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Account Code *</label>
              <input value={coaForm.code} onChange={e => setCoaForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. 5900" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Type</label>
              <select value={coaForm.type} onChange={e => setCoaForm(f => ({ ...f, type: e.target.value as AccountType }))} className={input}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{capitalize(t)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Account Name *</label>
            <input value={coaForm.name} onChange={e => setCoaForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Internet & Subscriptions" className={input} />
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Category</label>
            <input value={coaForm.category} onChange={e => setCoaForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. operating_expense" className={input} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input type="checkbox" checked={coaForm.is_active} onChange={e => setCoaForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-navy cursor-pointer" />
            <label className="text-sm font-medium text-htext">Active Account</label>
          </div>
          
          <div className="mt-4 pt-4 border-t border-hborder/50 space-y-3">
            <p className="text-xs font-semibold text-navy uppercase tracking-wide">Opening Balance</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-hmuted mb-1">Amount ($)</label>
                <input type="number" min={0} step={0.01} value={coaForm.opening_balance} onChange={e => setCoaForm(f => ({ ...f, opening_balance: e.target.value }))} placeholder="0.00" className={input} />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">As Of Date</label>
                <input type="date" value={coaForm.opening_balance_date} onChange={e => setCoaForm(f => ({ ...f, opening_balance_date: e.target.value }))} className={input} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Offset Account (Equity)</label>
              <select value={coaForm.offset_account_id} onChange={e => setCoaForm(f => ({ ...f, offset_account_id: e.target.value }))} className={input}>
                <option value="">Select offset account…</option>
                {accounts.filter(a => a.is_active && a.type === 'equity').map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setCoaFormOpen(false)}>Cancel</Button>
            <Button onClick={saveAccount} disabled={coaSaving}>{coaSaving ? 'Saving…' : editAccountId ? 'Update' : 'Add Account'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message}
        confirmLabel={confirmDialog?.confirmLabel}
        variant={confirmDialog?.variant}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />

      {/* ── Journal Entry Modal ── */}
      <Modal open={jeFormOpen} onClose={() => setJeFormOpen(false)} title={editJeId ? 'Edit Journal Entry' : 'New Journal Entry'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Entry Date</label>
              <input type="date" value={jeForm.date} onChange={e => setJeForm(f => ({ ...f, date: e.target.value }))} className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Reference</label>
              <input value={jeForm.reference} onChange={e => setJeForm(f => ({ ...f, reference: e.target.value }))} placeholder="INV-xxx, RES-xxx…" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Type</label>
              <select value={jeForm.reference_type} onChange={e => setJeForm(f => ({ ...f, reference_type: e.target.value }))} className={input}>
                {['manual', 'invoice', 'bill', 'reservation', 'petty_cash', 'adjustment', 'opening_balance', 'closing'].map(t => (
                  <option key={t} value={t}>{capitalize(t.replace(/_/g, ' '))}</option>
                ))}
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-xs text-hmuted mb-1">Description *</label>
              <input value={jeForm.description} onChange={e => setJeForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Salary payment for June…" className={input} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Debit / Credit Lines</p>
              <button onClick={() => setJeLines(prev => [...prev, emptyJeLine()])} className="text-xs text-navy hover:underline font-medium">+ Add Line</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-0.5 text-[10px] text-hmuted uppercase tracking-wide font-semibold">
                <span className="col-span-4">Account</span><span className="col-span-3">Description</span>
                <span className="col-span-2 text-right">Debit ($)</span><span className="col-span-2 text-right">Credit ($)</span>
              </div>
              {jeLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select value={line.account_id} onChange={e => updateJeLine(idx, 'account_id', e.target.value)} className="col-span-4 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg">
                    <option value="">Select account…</option>
                    {ACCOUNT_TYPES.map(type => (
                      <optgroup key={type} label={capitalize(type)}>
                        {accountsByType[type].filter(a => a.is_active).map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <input value={line.description} onChange={e => updateJeLine(idx, 'description', e.target.value)} placeholder="Note" className="col-span-3 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg" />
                  <input type="number" min={0} step={0.01} value={line.debit}  onChange={e => updateJeLine(idx, 'debit',  e.target.value)} placeholder="0.00" className="col-span-2 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg text-right" />
                  <input type="number" min={0} step={0.01} value={line.credit} onChange={e => updateJeLine(idx, 'credit', e.target.value)} placeholder="0.00" className="col-span-2 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg text-right" />
                  {jeLines.length > 2
                    ? <button onClick={() => setJeLines(prev => prev.filter((_, i) => i !== idx))} className="col-span-1 text-red-400 hover:text-red-600 text-center text-lg">×</button>
                    : <span className="col-span-1" />}
                </div>
              ))}
            </div>
            <div className={cn('mt-3 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm', jeBalanced ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200')}>
              <span className={jeBalanced ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                {jeBalanced ? '✓ Balanced' : '⚠ Debits must equal credits'}
              </span>
              <div className="flex gap-6 text-xs">
                <span className="text-hmuted">DR: <strong>{formatCurrency(jeTotalDebit)}</strong></span>
                <span className="text-hmuted">CR: <strong>{formatCurrency(jeTotalCredit)}</strong></span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setJeFormOpen(false)}>Cancel</Button>
            <Button onClick={saveJournalEntry} disabled={jeSaving || !jeBalanced}>{jeSaving ? 'Saving…' : editJeId ? 'Save Changes' : 'Save as Draft'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── New Bill Modal ── */}
      <Modal open={billFormOpen} onClose={() => setBillFormOpen(false)} title="Record New Bill" size="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Vendor</label>
              <select value={billForm.vendor_id} onChange={e => setBillForm(f => ({ ...f, vendor_id: e.target.value }))} className={input}>
                <option value="">No vendor / one-off</option>
                {vendors.filter(v => v.is_active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Expense Account *</label>
              <select value={billForm.expense_account_id} onChange={e => setBillForm(f => ({ ...f, expense_account_id: e.target.value }))} className={input}>
                <option value="">Select account…</option>
                {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Bill Date</label>
              <input type="date" value={billForm.bill_date} onChange={e => setBillForm(f => ({ ...f, bill_date: e.target.value }))} className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Due Date</label>
              <input type="date" value={billForm.due_date} onChange={e => setBillForm(f => ({ ...f, due_date: e.target.value }))} className={input} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Description *</label>
            <input value={billForm.description} onChange={e => setBillForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Electricity bill June 2026, ABA bank fee…" className={input} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Subtotal ($) *</label>
              <input type="number" min={0} step={0.01} value={billForm.subtotal} onChange={e => setBillForm(f => ({ ...f, subtotal: e.target.value }))} placeholder="0.00" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Tax / VAT ($)</label>
              <input type="number" min={0} step={0.01} value={billForm.tax_amount} onChange={e => setBillForm(f => ({ ...f, tax_amount: e.target.value }))} placeholder="0.00" className={input} />
            </div>
          </div>
          {Number(billForm.subtotal) > 0 && (
            <div className="bg-hsurface2 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="text-hmuted">Total</span>
              <span className="font-bold text-dark-navy">{formatCurrency(Number(billForm.subtotal) + Number(billForm.tax_amount || 0))}</span>
            </div>
          )}
          <div>
            <label className="block text-xs text-hmuted mb-1">Notes</label>
            <input value={billForm.notes} onChange={e => setBillForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={input} />
          </div>
          {billForm.expense_account_id && accounts.find(a => a.id === billForm.expense_account_id) && (
            <p className="text-[10px] text-hmuted bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              Auto journal: DR {accounts.find(a => a.id === billForm.expense_account_id)?.code} {accounts.find(a => a.id === billForm.expense_account_id)?.name} / CR 2100 Accounts Payable
            </p>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setBillFormOpen(false)}>Cancel</Button>
            <Button onClick={saveBill} disabled={billSaving}>{billSaving ? 'Saving…' : 'Record Bill'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Pay Bill Modal ── */}
      <Modal open={billPayOpen} onClose={() => { setBillPayOpen(false); setSelectedBill(null) }} title="Record Bill Payment" size="sm">
        {selectedBill && (
          <div className="space-y-3">
            <div className="bg-hsurface2 rounded-xl px-4 py-3 text-sm">
              <p className="font-medium text-htext">{selectedBill.description}</p>
              <p className="text-xs text-hmuted mt-1">
                {selectedBill.bill_number} · Balance: <strong>{formatCurrency(Number(selectedBill.total) - Number(selectedBill.amount_paid))}</strong>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-hmuted mb-1">Payment Date</label>
                <input type="date" value={billPayForm.payment_date} onChange={e => setBillPayForm(f => ({ ...f, payment_date: e.target.value }))} className={input} />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Amount ($) *</label>
                <input type="number" min={0} step={0.01} value={billPayForm.amount} onChange={e => setBillPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={input} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Payment Method</label>
              <select value={billPayForm.payment_method} onChange={e => setBillPayForm(f => ({ ...f, payment_method: e.target.value }))} className={input}>
                {paymentMethods.map(m => (
                  <option key={m.value} value={m.value}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Reference</label>
              <input value={billPayForm.reference} onChange={e => setBillPayForm(f => ({ ...f, reference: e.target.value }))} placeholder="Transfer ref, receipt #…" className={input} />
            </div>
            <p className="text-[10px] text-hmuted bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              Auto journal: DR 2100 Accounts Payable / CR {(paymentMethods.find(m => m.value === billPayForm.payment_method)?.is_cash ?? (billPayForm.payment_method === 'cash')) ? '1010 Cash on Hand' : '1020 Cash at Bank'}
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="ghost" onClick={() => { setBillPayOpen(false); setSelectedBill(null) }}>Cancel</Button>
              <Button onClick={saveBillPayment} disabled={billSaving}>{billSaving ? 'Saving…' : 'Record Payment'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Vendor Modal ── */}
      <Modal open={vendorFormOpen} onClose={() => setVendorFormOpen(false)} title={editVendorId ? 'Edit Vendor' : 'Add Vendor'} size="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-hmuted mb-1">Vendor / Company Name *</label>
              <input value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. EDC Electricity, ABA Bank…" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Contact Person</label>
              <input value={vendorForm.contact_name} onChange={e => setVendorForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Full name" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Phone</label>
              <input value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone: e.target.value }))} placeholder="+855…" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Email</label>
              <input type="email" value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email: e.target.value }))} placeholder="vendor@example.com" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Payment Terms (days)</label>
              <input type="number" min={0} value={vendorForm.payment_terms} onChange={e => setVendorForm(f => ({ ...f, payment_terms: e.target.value }))} placeholder="30" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Tax ID / VAT #</label>
              <input value={vendorForm.tax_id} onChange={e => setVendorForm(f => ({ ...f, tax_id: e.target.value }))} placeholder="Optional" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Address</label>
              <input value={vendorForm.address} onChange={e => setVendorForm(f => ({ ...f, address: e.target.value }))} placeholder="Street, city…" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Notes</label>
              <input value={vendorForm.notes} onChange={e => setVendorForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={input} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setVendorFormOpen(false)}>Cancel</Button>
            <Button onClick={saveVendor} disabled={vendorSaving}>{vendorSaving ? 'Saving…' : editVendorId ? 'Update Vendor' : 'Add Vendor'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Recurring Entry Modal ── */}
      <Modal open={recurFormOpen} onClose={() => setRecurFormOpen(false)} title={editRecurId ? 'Edit Template' : 'New Recurring Template'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-hmuted mb-1">Template Name *</label>
              <input value={recurForm.name} onChange={e => setRecurForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly Rent, Staff Salary…" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Frequency</label>
              <select value={recurForm.frequency} onChange={e => setRecurForm(f => ({ ...f, frequency: e.target.value }))} className={input}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Next Due Date</label>
              <input type="date" value={recurForm.next_due_date} onChange={e => setRecurForm(f => ({ ...f, next_due_date: e.target.value }))} className={input} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-hmuted mb-1">Description (used as JE description when posted) *</label>
              <input value={recurForm.description} onChange={e => setRecurForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Monthly office rent payment" className={input} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Debit / Credit Lines</p>
              <button onClick={() => setRecurLines(prev => [...prev, emptyJeLine()])} className="text-xs text-navy hover:underline font-medium">+ Add Line</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-0.5 text-[10px] text-hmuted uppercase tracking-wide font-semibold">
                <span className="col-span-4">Account</span><span className="col-span-3">Note</span>
                <span className="col-span-2 text-right">Debit ($)</span><span className="col-span-2 text-right">Credit ($)</span>
              </div>
              {recurLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select value={line.account_id} onChange={e => setRecurLines(prev => prev.map((l, i) => i === idx ? { ...l, account_id: e.target.value } : l))}
                    className="col-span-4 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg">
                    <option value="">Select account…</option>
                    {ACCOUNT_TYPES.map(type => (
                      <optgroup key={type} label={capitalize(type)}>
                        {accountsByType[type].filter(a => a.is_active).map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <input value={line.description} onChange={e => setRecurLines(prev => prev.map((l, i) => i === idx ? { ...l, description: e.target.value } : l))}
                    placeholder="Note" className="col-span-3 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg" />
                  <input type="number" min={0} step={0.01} value={line.debit} onChange={e => setRecurLines(prev => prev.map((l, i) => i === idx ? { ...l, debit: e.target.value } : l))}
                    placeholder="0.00" className="col-span-2 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg text-right" />
                  <input type="number" min={0} step={0.01} value={line.credit} onChange={e => setRecurLines(prev => prev.map((l, i) => i === idx ? { ...l, credit: e.target.value } : l))}
                    placeholder="0.00" className="col-span-2 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg text-right" />
                  {recurLines.length > 2
                    ? <button onClick={() => setRecurLines(prev => prev.filter((_, i) => i !== idx))} className="col-span-1 text-red-400 hover:text-red-600 text-lg text-center">×</button>
                    : <span className="col-span-1" />}
                </div>
              ))}
            </div>
            {(() => {
              const dr = recurLines.reduce((s, l) => s + Number(l.debit || 0), 0)
              const cr = recurLines.reduce((s, l) => s + Number(l.credit || 0), 0)
              const ok = Math.abs(dr - cr) < 0.001
              return (
                <div className={cn('mt-3 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm', ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200')}>
                  <span className={ok ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>{ok ? '✓ Balanced' : '⚠ Debits must equal credits'}</span>
                  <div className="flex gap-6 text-xs">
                    <span className="text-hmuted">DR: <strong>{formatCurrency(dr)}</strong></span>
                    <span className="text-hmuted">CR: <strong>{formatCurrency(cr)}</strong></span>
                  </div>
                </div>
              )
            })()}
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setRecurFormOpen(false)}>Cancel</Button>
            <Button onClick={saveRecurring} disabled={recurSaving}>{recurSaving ? 'Saving…' : editRecurId ? 'Update Template' : 'Save Template'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── AR Aging Report Modal ── */}
      <Modal open={showAgingReport} onClose={() => setShowAgingReport(false)} title="AR Aging Report" size="lg">
        {(() => {
          const buckets: Record<string, { current: number; d30: number; d60: number; d60p: number }> = {}
          arInvoices
            .filter((inv: any) => inv.status !== 'paid' && inv.status !== 'void')
            .forEach((inv: any) => {
              const name = inv.guest?.full_name ?? 'No Guest'
              if (!buckets[name]) buckets[name] = { current: 0, d30: 0, d60: 0, d60p: 0 }
              const od = daysPastDue(inv.invoice_date ?? inv.created_at)
              const bal = Number(inv.total) - Number(inv.amount_paid)
              if (od <= 0) buckets[name].current += bal
              else if (od <= 30) buckets[name].d30 += bal
              else if (od <= 60) buckets[name].d60 += bal
              else buckets[name].d60p += bal
            })
          const rows = Object.entries(buckets)
          const tot = (key: 'current' | 'd30' | 'd60' | 'd60p') => rows.reduce((s, [, v]) => s + v[key], 0)
          return (
            <div>
              <div className="flex justify-end mb-3">
                <Button variant="ghost" onClick={() => window.print()}>Print</Button>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="bg-hsurface2">
                  {['Customer','Current','1–30 days','31–60 days','60+ days','Total'].map(h => (
                    <th key={h} className={cn('px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide', h === 'Customer' ? 'text-left' : 'text-right')}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.map(([name, v]) => {
                    const total = v.current + v.d30 + v.d60 + v.d60p
                    return (
                      <tr key={name} className="border-t border-hborder hover:bg-hbg/40">
                        <td className="px-3 py-2 text-htext font-medium">{name}</td>
                        <td className="px-3 py-2 text-right text-green-700">{v.current > 0 ? formatCurrency(v.current) : '—'}</td>
                        <td className="px-3 py-2 text-right text-yellow-700">{v.d30 > 0 ? formatCurrency(v.d30) : '—'}</td>
                        <td className="px-3 py-2 text-right text-orange-600">{v.d60 > 0 ? formatCurrency(v.d60) : '—'}</td>
                        <td className="px-3 py-2 text-right text-red-600">{v.d60p > 0 ? formatCurrency(v.d60p) : '—'}</td>
                        <td className="px-3 py-2 text-right font-bold text-dark-navy">{formatCurrency(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-dark-navy text-white">
                    <td className="px-3 py-2.5 font-bold">Total</td>
                    <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(tot('current'))}</td>
                    <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(tot('d30'))}</td>
                    <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(tot('d60'))}</td>
                    <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(tot('d60p'))}</td>
                    <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(tot('current') + tot('d30') + tot('d60') + tot('d60p'))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        })()}
      </Modal>

      {/* ── Petty Cash Modal ── */}
      <Modal open={pcFormOpen} onClose={() => setPcFormOpen(false)} title="Record Petty Cash" size="sm">
        <div className="space-y-3">
          <div className="flex gap-1 bg-hsurface2 rounded-xl p-1">
            {(['out', 'in'] as const).map(t => (
              <button key={t} onClick={() => setPcForm(f => ({ ...f, type: t }))}
                className={cn('flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors', pcForm.type === t ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted')}
              >{t === 'out' ? '↓ Cash Out (Expense)' : '↑ Cash In (Replenishment)'}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Date</label>
              <input type="date" value={pcForm.date} onChange={e => setPcForm(f => ({ ...f, date: e.target.value }))} className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Amount ($)</label>
              <input type="number" min={0} step={0.01} value={pcForm.amount} onChange={e => setPcForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={input} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Description *</label>
            <input value={pcForm.description} onChange={e => setPcForm(f => ({ ...f, description: e.target.value }))} placeholder="What was this for?" className={input} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Category</label>
              <select value={pcForm.category} onChange={e => setPcForm(f => ({ ...f, category: e.target.value }))} className={input}>
                {PETTY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Reference</label>
              <input value={pcForm.reference} onChange={e => setPcForm(f => ({ ...f, reference: e.target.value }))} placeholder="Receipt #, note…" className={input} />
            </div>
          </div>
          {pcForm.type === 'out' && expenseAccounts.length > 0 && (
            <div>
              <label className="block text-xs text-hmuted mb-1">Post to GL Account (optional)</label>
              <select value={pcForm.expense_account_id} onChange={e => setPcForm(f => ({ ...f, expense_account_id: e.target.value }))} className={input}>
                <option value="">Auto (5800 Miscellaneous)</option>
                {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
              <p className="text-[10px] text-hmuted mt-1">Creates DR Expense / CR 1010 Cash on Hand</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setPcFormOpen(false)}>Cancel</Button>
            <Button onClick={savePettyCash} disabled={pcSaving}>{pcSaving ? 'Saving…' : 'Record Transaction'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
