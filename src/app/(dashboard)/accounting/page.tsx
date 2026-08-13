'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, generateJournalEntryNumber, capitalize, branchLogo, branchBrandLabel } from '@/lib/utils'
import { exportXlsx } from '@/lib/excel'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import { cn } from '@/lib/utils'
import type { ChartOfAccount, AccountType, JournalEntry, PettyCashTransaction, Vendor, Bill } from '@/types'

// ── Types & constants ──────────────────────────────────────────
type Tab = 'overview' | 'ar' | 'bills' | 'vendors' | 'journal' | 'ledger' | 'trial_balance' | 'reports' | 'reconciliation' | 'recurring' | 'periods' | 'coa' | 'petty'

const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense']
const COA_CATEGORIES: Record<AccountType, { value: string; label: string }[]> = {
  asset: [
    { value: 'Bank',             label: 'Bank / Cash' },
    { value: 'current_asset',    label: 'Current Asset' },
    { value: 'fixed_asset',      label: 'Fixed Asset' },
    { value: 'other_asset',      label: 'Other Asset' },
  ],
  liability: [
    { value: 'current_liability',   label: 'Current Liability' },
    { value: 'long_term_liability', label: 'Long-Term Liability' },
    { value: 'other_liability',     label: 'Other Liability' },
  ],
  equity: [
    { value: 'equity', label: 'Equity' },
  ],
  revenue: [
    { value: 'operating_revenue', label: 'Operating Revenue' },
    { value: 'other_revenue',     label: 'Other Revenue' },
  ],
  expense: [
    { value: 'operating_expense', label: 'Operating Expense' },
    { value: 'other_expense',     label: 'Other Expense' },
  ],
}
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
// Auto-generated from an invoice/reservation event — unposting+editing these would
// desync the ledger from the invoice/reservation record that has its own copy of
// the numbers. Reverse or correct these by voiding the invoice/reservation instead.
const AUTO_JE_REFERENCE_TYPES = ['invoice', 'deposit', 'deposit_applied', 'deposit_refund', 'check_in', 'invoice_correction']
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
  const { activeBranch, hotelSettings } = useBranch()
  const [tab, setTab] = useState<Tab>('overview')

  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message?: string; confirmLabel?: string; variant?: 'default' | 'danger'; onConfirm: () => void } | null>(null)

  // COA
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([])
  const [coaFormOpen, setCoaFormOpen] = useState(false)
  const [editAccountId, setEditAccountId] = useState<string | null>(null)
  const [coaForm, setCoaForm] = useState({ ...emptyCoaForm })
  const [coaSaving, setCoaSaving] = useState(false)

  // Current user role — admins may override the auto-JE unpost/edit guardrail.
  const [isAdmin, setIsAdmin] = useState(false)

  // Journal Entries
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [jeFormOpen, setJeFormOpen] = useState(false)
  const [editJeId, setEditJeId] = useState<string | null>(null)
  const [jeForm, setJeForm] = useState({ date: '', description: '', reference: '', reference_type: 'manual' })
  const [jeLines, setJeLines] = useState([emptyJeLine(), emptyJeLine()])
  const [jeSaving, setJeSaving] = useState(false)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())
  const [entryLines, setEntryLines] = useState<Record<string, any[]>>({})
  const [jeFrom, setJeFrom] = useState('')
  const [jeTo, setJeTo] = useState('')
  const [jeSearch, setJeSearch] = useState('')
  const [jeStatus, setJeStatus] = useState<'all' | 'draft' | 'posted' | 'void'>('all')

  // Correct Entry Date (for auto-generated JEs — historical backfill corrections)
  const [correctDateOpen, setCorrectDateOpen] = useState(false)
  const [correctDateEntry, setCorrectDateEntry] = useState<JournalEntry | null>(null)
  const [correctDateValue, setCorrectDateValue] = useState('')
  const [correctDateSiblings, setCorrectDateSiblings] = useState<JournalEntry[]>([])
  const [correctDateSelected, setCorrectDateSelected] = useState<Set<string>>(new Set())
  const [correctDateSaving, setCorrectDateSaving] = useState(false)

  // Correct COA (for auto-generated JEs — fixes a wrong account picked at posting time)
  const [correctCoaOpen, setCorrectCoaOpen] = useState(false)
  const [correctCoaEntry, setCorrectCoaEntry] = useState<JournalEntry | null>(null)
  const [correctCoaLines, setCorrectCoaLines] = useState<any[]>([])
  const [correctCoaSaving, setCorrectCoaSaving] = useState(false)

  // General Ledger
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState('')
  const [ledgerFrom, setLedgerFrom] = useState('')
  const [ledgerTo, setLedgerTo] = useState(todayStr())
  const [ledgerGroups, setLedgerGroups] = useState<{ account: any, rows: any[] }[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

  // Petty Cash
  const [petty, setPetty] = useState<PettyCashTransaction[]>([])
  const [pcFormOpen, setPcFormOpen] = useState(false)
  const [pcForm, setPcForm] = useState({
    date: todayStr(), description: '', category: 'Miscellaneous', amount: '',
    type: 'out' as 'in' | 'out', reference: '', expense_account_id: '',
    reservation_id: '', reservation_line_item_id: '',
  })
  const [pcSaving, setPcSaving] = useState(false)
  const [pcFilter, setPcFilter] = useState<'all' | 'in' | 'out'>('all')
  const [pcReservations, setPcReservations] = useState<any[]>([])
  const [pcEditId, setPcEditId] = useState<string | null>(null)
  const [pcEditJeId, setPcEditJeId] = useState<string | null>(null)

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
  const [receiptBill, setReceiptBill] = useState<Bill | null>(null)
  const [receiptPayments, setReceiptPayments] = useState<{ payment_date: string; amount: number; payment_method: string; notes?: string }[]>([])
  const [billSaving, setBillSaving] = useState(false)
  const [billForm, setBillForm] = useState({
    vendor_id: '', bill_date: todayStr(), due_date: '',
    description: '', tax_amount: '0', notes: '',
    paid_from: '', // '' = record as unpaid (CR Accounts Payable); a code = pay immediately from that account
    lines: [{ expense_account_id: '', amount: '', description: '' }] as { expense_account_id: string; amount: string; description: string }[],
  })
  const [billPayForm, setBillPayForm] = useState({
    payment_date: todayStr(), amount: '', account_code: '1010', reference: '', notes: '',
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

  // Account drill-down (shared by Trial Balance, P&L, Balance Sheet — click an
  // account line to see the journal entries behind its balance)
  const [expandedReportAccts, setExpandedReportAccts] = useState<Set<string>>(new Set())
  const [reportAcctLines, setReportAcctLines] = useState<Record<string, any[]>>({})
  const [reportAcctLoading, setReportAcctLoading] = useState<Set<string>>(new Set())
  const [discountDetailsOpen, setDiscountDetailsOpen] = useState(false)

  // Bank Reconciliation
  const [reconLines,     setReconLines]     = useState<any[]>([])
  const [reconStmtBal,   setReconStmtBal]   = useState('')
  const [reconLoading,   setReconLoading]   = useState(false)
  const [reconAccountId, setReconAccountId] = useState('')

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
  const [paymentMethods, setPaymentMethods] = useState<{ name: string; value: string; is_cash: boolean; account_code?: string }[]>([
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
      loadPaymentMethods(); loadPcReservations()
    }
  }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'ledger' && activeBranch) loadLedger()
  }, [tab, activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('staff').select('role').eq('auth_user_id', user.id).maybeSingle()
      setIsAdmin(data?.role === 'admin')
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPaymentMethods() {
    if (!activeBranch) return
    const { data } = await supabase.from('payment_methods').select('name, value, is_cash, account_code').eq('branch_id', activeBranch.id).eq('is_active', true).order('sort_order')
    if (data && data.length > 0) setPaymentMethods(data as { name: string; value: string; is_cash: boolean; account_code?: string }[])
  }

  // ── Load ───────────────────────────────────────────────────────

  async function loadAccounts() {
    if (!activeBranch) return
    const { data } = await supabase.from('chart_of_accounts')
      .select('*').eq('branch_id', activeBranch.id).order('code')
    const accts = (data ?? []) as ChartOfAccount[]
    setAccounts(accts)
    const requiredCodes = ['1010', '1011', '1020', '2100', '5800']
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
    const fetched = (data ?? []) as JournalEntry[]
    setEntries(fetched)
    computeOverview(data ?? [])
    if (fetched.length > 0) {
      const ids = fetched.map(e => e.id)
      const { data: linesData } = await supabase.from('journal_entry_lines')
        .select('*, account:chart_of_accounts(code, name, type)')
        .in('entry_id', ids).order('debit', { ascending: false })
      const byEntry: Record<string, any[]> = {}
      for (const line of (linesData ?? [])) {
        if (!byEntry[line.entry_id]) byEntry[line.entry_id] = []
        byEntry[line.entry_id].push(line)
      }
      setEntryLines(byEntry)
      setExpandedEntries(new Set(ids))
    }
  }

  async function loadPetty() {
    if (!activeBranch) return
    const { data } = await supabase.from('petty_cash_transactions')
      .select('*, reservation:reservations(reservation_number, guest:guests(full_name))')
      .eq('branch_id', activeBranch.id)
      .order('transaction_date', { ascending: false })
    setPetty((data ?? []) as PettyCashTransaction[])
  }

  async function loadPcReservations() {
    if (!activeBranch) return
    const { data } = await supabase
      .from('reservations')
      .select('id, reservation_number, check_in_date, guest:guests(full_name), line_items:reservation_line_items(id, label)')
      .eq('branch_id', activeBranch.id)
      .order('check_in_date', { ascending: false })
      .limit(120)
    setPcReservations((data ?? []) as any[])
  }

  async function openEditPc(t: PettyCashTransaction) {
    setPcEditId(t.id)
    setPcEditJeId(t.journal_entry_id ?? null)
    let expenseAccountId = ''
    if (t.transaction_type === 'out' && t.journal_entry_id) {
      const { data: debitLine } = await supabase
        .from('journal_entry_lines')
        .select('account_id')
        .eq('entry_id', t.journal_entry_id)
        .gt('debit', 0)
        .maybeSingle()
      if (debitLine) expenseAccountId = debitLine.account_id
    }
    setPcForm({
      date: t.transaction_date,
      description: t.description,
      category: t.category,
      amount: String(t.amount),
      type: t.transaction_type,
      reference: t.reference ?? '',
      expense_account_id: expenseAccountId,
      reservation_id: t.reservation_id ?? '',
      reservation_line_item_id: t.reservation_line_item_id ?? '',
    })
    setPcFormOpen(true)
  }

  function deletePettyCash(t: PettyCashTransaction) {
    setConfirmDialog({
      title: 'Delete Transaction',
      message: `Delete "${t.description}" (${formatCurrency(t.amount)})?${t.journal_entry_id ? ' The associated journal entry will also be removed.' : ''}`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        const { error } = await supabase.from('petty_cash_transactions').delete().eq('id', t.id)
        if (error) { toast(error.message, 'error'); return }
        if (t.journal_entry_id) {
          await supabase.from('journal_entry_lines').delete().eq('entry_id', t.journal_entry_id)
          await supabase.from('journal_entries').delete().eq('id', t.journal_entry_id)
        }
        toast('Transaction deleted')
        loadPetty(); loadEntries()
      },
    })
  }

  async function loadAR() {
    if (!activeBranch) return
    const { data } = await supabase.from('invoices')
      .select('*, guest:guests(full_name), house:houses(name, code)')
      .eq('branch_id', activeBranch.id)
      .order('invoice_date', { ascending: false })
    setArInvoices(data ?? [])
  }

  async function loadBills() {
    if (!activeBranch) return
    const { data } = await supabase.from('bills')
      .select('*, vendor:vendors(name, contact_name, phone, email, address, payment_terms), expense_account:chart_of_accounts(code, name)')
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
    if (!activeBranch) return
    setLedgerLoading(true)
    // Step 1: get posted, non-void entry IDs in date range
    let jeQ = supabase.from('journal_entries')
      .select('id').eq('branch_id', activeBranch.id).eq('status', 'posted').eq('is_void', false)
    if (ledgerFrom) jeQ = jeQ.gte('entry_date', ledgerFrom)
    if (ledgerTo)   jeQ = jeQ.lte('entry_date', ledgerTo)
    const { data: jeData } = await jeQ
    const ids = (jeData ?? []).map((e: any) => e.id)
    if (ids.length === 0) { setLedgerGroups([]); setLedgerLoading(false); return }
    // Step 2: get lines — optionally filtered to one account
    let linesQ = supabase.from('journal_entry_lines')
      .select('*, entry:journal_entries(entry_number, entry_date, description, reference), account:chart_of_accounts(id, code, name, type)')
      .in('entry_id', ids)
    if (ledgerAccountFilter) linesQ = linesQ.eq('account_id', ledgerAccountFilter)
    const { data } = await linesQ
    // Step 3: group by account, compute per-account running balance
    const accountMap: Record<string, { account: any; lines: any[] }> = {}
    for (const line of (data ?? [])) {
      if (!line.entry || !line.account) continue
      const key = line.account.id
      if (!accountMap[key]) accountMap[key] = { account: line.account, lines: [] }
      accountMap[key].lines.push(line)
    }
    const groups = Object.values(accountMap)
      .sort((a, b) => a.account.code.localeCompare(b.account.code))
      .map(({ account, lines }) => {
        const nb = normalBalance(account.type)
        let balance = 0
        const rows = lines
          .sort((a: any, b: any) => a.entry.entry_date.localeCompare(b.entry.entry_date))
          .map((r: any) => {
            const net = nb === 'debit' ? Number(r.debit) - Number(r.credit) : Number(r.credit) - Number(r.debit)
            balance += net
            return { ...r, running_balance: balance }
          })
        return { account, rows }
      })
    setLedgerGroups(groups)
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
      .select('id').eq('branch_id', activeBranch.id).eq('status', 'posted').eq('is_void', false).gte('entry_date', monthStart)
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
    const isAuto = !!(entry.reference_type && AUTO_JE_REFERENCE_TYPES.includes(entry.reference_type))
    if (isAuto && !isAdmin) {
      toast(
        `This entry was generated automatically from a ${entry.reference_type!.replace(/_/g, ' ')} and is linked to an invoice or reservation record. To fix amounts/accounts, void or correct the invoice/reservation instead — that reverses both together. To fix just the date, use "Correct Date" instead of Unpost.`,
        'error'
      )
      return
    }
    setConfirmDialog({
      title: `Unpost ${entry.entry_number}?`,
      message: isAuto
        ? `⚠️  Admin override — this is an auto-generated ${entry.reference_type!.replace(/_/g, ' ')} entry linked to an invoice/reservation. Editing it here will NOT update that source record, so the two can go out of sync. Only proceed if you know what you're doing; otherwise use Correct Date / Correct COA or void the source document.`
        : 'Entry will return to draft and can be edited. It will be excluded from reports until re-posted.',
      confirmLabel: 'Unpost',
      variant: isAuto ? 'danger' : 'default',
      onConfirm: async () => {
        setConfirmDialog(null)
        await supabase.from('journal_entries').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', entry.id)
        setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'draft' } : e))
        toast(`${entry.entry_number} unposted — now editable`)
      },
    })
  }

  // ── Correct Entry Date ────────────────────────────────────────
  // For auto-generated JEs, where Unpost+Edit is blocked. A pure date
  // correction (historical backfill) doesn't touch amounts/accounts, so it
  // doesn't need to go through void — but it does need to keep the linked
  // invoice/payment/deposit records' dates in sync, or we'd introduce the
  // exact desync the guardrail exists to prevent.

  async function openCorrectDate(entry: JournalEntry) {
    setCorrectDateEntry(entry)
    setCorrectDateValue(entry.entry_date)
    if (entry.reference && activeBranch) {
      const { data } = await supabase.from('journal_entries').select('*')
        .eq('reference', entry.reference).eq('branch_id', activeBranch.id).neq('id', entry.id)
      const siblings = (data ?? []) as JournalEntry[]
      setCorrectDateSiblings(siblings)
      setCorrectDateSelected(new Set(siblings.map(s => s.id)))
    } else {
      setCorrectDateSiblings([])
      setCorrectDateSelected(new Set())
    }
    setCorrectDateOpen(true)
  }

  function toggleCorrectDateSibling(id: string) {
    setCorrectDateSelected(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  async function saveCorrectDate() {
    if (!correctDateEntry || !correctDateValue || !activeBranch) return
    setCorrectDateSaving(true)

    const targetEntries = [correctDateEntry, ...correctDateSiblings.filter(s => correctDateSelected.has(s.id))]
    const targetIds = targetEntries.map(e => e.id)

    const { error: jeErr } = await supabase.from('journal_entries')
      .update({ entry_date: correctDateValue, updated_at: new Date().toISOString() })
      .in('id', targetIds)
    if (jeErr) { toast(jeErr.message, 'error'); setCorrectDateSaving(false); return }

    const isoTimestamp = `${correctDateValue}T12:00:00Z`
    const invoiceNumbers = new Set(
      targetEntries.filter(e => ['invoice', 'deposit_applied', 'invoice_correction'].includes(e.reference_type ?? '')).map(e => e.reference).filter(Boolean) as string[]
    )
    const reservationNumbers = new Set(
      targetEntries.filter(e => ['deposit', 'deposit_refund'].includes(e.reference_type ?? '')).map(e => e.reference).filter(Boolean) as string[]
    )

    for (const invNumber of invoiceNumbers) {
      const { data: inv } = await supabase.from('invoices').select('id, paid_at').eq('invoice_number', invNumber).eq('branch_id', activeBranch.id).maybeSingle()
      if (inv) {
        if (inv.paid_at) await supabase.from('invoices').update({ paid_at: isoTimestamp, updated_at: new Date().toISOString() }).eq('id', inv.id)
        await supabase.from('payment_transactions').update({ payment_date: isoTimestamp }).eq('invoice_id', inv.id)
      }
    }
    for (const resNumber of reservationNumbers) {
      const { data: res } = await supabase.from('reservations').select('id').eq('reservation_number', resNumber).eq('branch_id', activeBranch.id).maybeSingle()
      if (res) await supabase.from('deposit_receipts').update({ receipt_date: correctDateValue, updated_at: new Date().toISOString() }).eq('reservation_id', res.id)
    }

    toast(`Date corrected to ${correctDateValue}${targetIds.length > 1 ? ` for ${targetIds.length} linked entries` : ''}`)
    setCorrectDateSaving(false)
    setCorrectDateOpen(false)
    setCorrectDateEntry(null)
    loadEntries()
  }

  // Correct COA — for auto-generated JEs, where a user picked the wrong
  // account at posting time. Only lets each line move to another account of
  // the SAME type (revenue↔revenue, expense↔expense, etc.) so the entry's
  // debit/credit structure can't be broken by the correction. For revenue
  // lines on invoice-linked JEs, also re-points the invoice's item(s) that
  // drove that line so buildRevenueLines() stays consistent on future
  // payments instead of silently reverting to the old account.

  async function openCorrectCoa(entry: JournalEntry) {
    setCorrectCoaEntry(entry)
    let lines: any[] = entryLines[entry.id] ?? []
    if (lines.length === 0) {
      const { data } = await supabase.from('journal_entry_lines')
        .select('*, account:chart_of_accounts(id, code, name, type)')
        .eq('entry_id', entry.id).order('debit', { ascending: false })
      lines = data ?? []
    }
    setCorrectCoaLines(lines.map(l => ({ ...l, newAccountId: l.account_id })))
    setCorrectCoaOpen(true)
  }

  function setCorrectCoaLineAccount(lineId: string, accountId: string) {
    setCorrectCoaLines(prev => prev.map(l => l.id === lineId ? { ...l, newAccountId: accountId } : l))
  }

  async function saveCorrectCoa() {
    if (!correctCoaEntry || !activeBranch) return
    const changed = correctCoaLines.filter(l => l.newAccountId && l.newAccountId !== l.account_id)
    if (changed.length === 0) { setCorrectCoaOpen(false); return }
    setCorrectCoaSaving(true)

    for (const line of changed) {
      const { error } = await supabase.from('journal_entry_lines').update({ account_id: line.newAccountId }).eq('id', line.id)
      if (error) { toast(error.message, 'error'); setCorrectCoaSaving(false); return }
    }

    const isInvoiceLinked = ['invoice', 'deposit_applied', 'invoice_correction'].includes(correctCoaEntry.reference_type ?? '')
    const revenueChanges = changed.filter(l => l.account?.type === 'revenue')
    if (isInvoiceLinked && revenueChanges.length > 0 && correctCoaEntry.reference) {
      const { data: inv } = await supabase.from('invoices').select('id, items').eq('invoice_number', correctCoaEntry.reference).eq('branch_id', activeBranch.id).maybeSingle()
      if (inv?.items) {
        const newAccounts = accounts.filter(a => revenueChanges.some(l => l.newAccountId === a.id))
        const oldCodes = new Set(revenueChanges.map(l => l.account?.code).filter(Boolean))
        const items = (inv.items as any[]).map(item => {
          if (oldCodes.has(item.account_code)) {
            const line = revenueChanges.find(l => l.account?.code === item.account_code)
            const newAcc = newAccounts.find(a => a.id === line?.newAccountId)
            if (newAcc) return { ...item, account_code: newAcc.code }
          }
          return item
        })
        await supabase.from('invoices').update({ items, updated_at: new Date().toISOString() }).eq('id', inv.id)
      }
    }

    setEntryLines(prev => { const next = { ...prev }; delete next[correctCoaEntry.id]; return next })
    toast(`Account corrected for ${changed.length} line${changed.length > 1 ? 's' : ''} on ${correctCoaEntry.entry_number}`)
    setCorrectCoaSaving(false)
    setCorrectCoaOpen(false)
    setCorrectCoaEntry(null)
    loadEntries()
  }

  // ── Bills ──────────────────────────────────────────────────────

  function addBillLine() {
    setBillForm(f => ({ ...f, lines: [...f.lines, { expense_account_id: '', amount: '', description: '' }] }))
  }
  function removeBillLine(idx: number) {
    setBillForm(f => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== idx) : f.lines }))
  }
  function updateBillLine(idx: number, field: 'expense_account_id' | 'amount' | 'description', value: string) {
    setBillForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, [field]: value } : l) }))
  }

  async function saveBill() {
    const validLines = billForm.lines.filter(l => l.expense_account_id && Number(l.amount) > 0)
    if (!billForm.description) { toast('Description is required', 'error'); return }
    if (validLines.length === 0) { toast('Add at least one expense line with an account and amount', 'error'); return }
    // Guard against a half-filled line (account picked but no amount, or vice versa).
    const halfFilled = billForm.lines.some(l => (l.expense_account_id && !(Number(l.amount) > 0)) || (!l.expense_account_id && Number(l.amount) > 0))
    if (halfFilled) { toast('Every expense line needs both an account and an amount', 'error'); return }

    setBillSaving(true)
    const subtotal = validLines.reduce((s, l) => s + Number(l.amount), 0)
    const taxAmt   = Number(billForm.tax_amount || 0)
    const total    = subtotal + taxAmt

    const apAcct = accounts.find(a => a.code === '2100')
    if (!apAcct) { toast('Missing GL account 2100 Accounts Payable — add it first', 'error'); setBillSaving(false); return }

    // Pay From: empty = record as an unpaid payable (credit AP, settle later via
    // Record Bill Payment). A chosen cash/bank/2400 account = pay immediately, so
    // the single recording JE credits that account directly (DR expense / CR cash)
    // — no separate payment JE, no double entry — and the bill is marked paid.
    const payNow = billForm.paid_from !== ''
    const creditAcct = payNow ? accounts.find(a => a.code === billForm.paid_from) : apAcct
    if (payNow && !creditAcct) { toast(`Missing GL account ${billForm.paid_from} — add it first`, 'error'); setBillSaving(false); return }

    const lineItems = validLines.map(l => {
      const acc = accounts.find(a => a.id === l.expense_account_id)
      return { account_id: l.expense_account_id, account_code: acc?.code, account_name: acc?.name, description: l.description?.trim() || billForm.description, amount: Number(l.amount) }
    })

    const billNumber = await generateBillNumber()

    // Auto journal: one DR per expense line, tax folded onto the first line's
    // account (matches the prior single-line behaviour where tax was part of the
    // expense debit), balanced against a single CR to the settlement account
    // (Accounts Payable when unpaid, or the pay-from account when paying now).
    let jeId: string | null = null
    const { data: je } = await supabase.from('journal_entries').insert({
      entry_number: generateJournalEntryNumber(), entry_date: billForm.bill_date,
      reference: billNumber, reference_type: 'bill', description: `Bill — ${billForm.description}`,
      branch_id: activeBranch?.id ?? null,
    }).select().single()
    if (je) {
      jeId = je.id
      const jeLines = validLines.map(l => ({ entry_id: je.id, account_id: l.expense_account_id, description: l.description?.trim() || billForm.description, debit: Number(l.amount), credit: 0 }))
      if (taxAmt > 0) jeLines.push({ entry_id: je.id, account_id: validLines[0].expense_account_id, description: `${billForm.description} — Tax/VAT`, debit: taxAmt, credit: 0 })
      jeLines.push({ entry_id: je.id, account_id: creditAcct!.id, description: billForm.description, debit: 0, credit: total })
      const { error: lineErr } = await supabase.from('journal_entry_lines').insert(jeLines)
      if (lineErr) {
        await supabase.from('journal_entries').delete().eq('id', je.id)
        toast('Failed to save journal lines', 'error'); setBillSaving(false); return
      }
    }

    const { data: newBill, error } = await supabase.from('bills').insert({
      bill_number: billNumber,
      vendor_id: billForm.vendor_id || null,
      bill_date: billForm.bill_date,
      due_date: billForm.due_date || null,
      expense_account_id: validLines[0].expense_account_id, // primary account (first line) for list display
      line_items: lineItems,
      description: billForm.description,
      subtotal, tax_amount: taxAmt, total,
      amount_paid: payNow ? total : 0,
      status: payNow ? 'paid' : 'unpaid',
      notes: billForm.notes || null,
      journal_entry_id: jeId,
      branch_id: activeBranch?.id ?? null,
    }).select().single()
    if (error) {
      if (jeId) await supabase.from('journal_entries').delete().eq('id', jeId)
      toast(error.message, 'error'); setBillSaving(false); return
    }

    // Paid-immediately: log the payment against the bill so it shows on the
    // receipt and payment history. The GL side is already in the recording JE
    // above (no second JE), so link this payment row to that same entry.
    if (payNow && newBill) {
      await supabase.from('bill_payments').insert({
        bill_id: newBill.id, payment_date: billForm.bill_date,
        amount: total, payment_method: `${creditAcct!.code} ${creditAcct!.name.trim()}`,
        reference: null, notes: 'Paid at recording', journal_entry_id: jeId, branch_id: activeBranch?.id ?? null,
      })
    }

    toast(payNow ? 'Bill recorded & paid' : 'Bill recorded')
    setBillSaving(false); setBillFormOpen(false)
    setBillForm({ vendor_id: '', bill_date: todayStr(), due_date: '', description: '', tax_amount: '0', notes: '', paid_from: '', lines: [{ expense_account_id: '', amount: '', description: '' }] })
    loadBills(); loadEntries()
  }

  async function openBillReceipt(bill: Bill) {
    setReceiptBill(bill)
    const { data } = await supabase.from('bill_payments')
      .select('payment_date, amount, payment_method, notes')
      .eq('bill_id', bill.id).order('payment_date', { ascending: true })
    setReceiptPayments((data ?? []) as any[])
  }

  async function saveBillPayment() {
    if (!selectedBill || Number(billPayForm.amount) <= 0) { toast('Amount required', 'error'); return }
    setBillSaving(true)
    const payAmt  = Number(billPayForm.amount)

    // Guard against double-paying / overpaying. The "Pay From Account" selector
    // also exists on Record New Bill (pay-at-recording) — a bill paid there is
    // already 'paid', so it must never accept another payment here. Re-read the
    // bill's LIVE state (not the possibly-stale row the modal was opened with,
    // e.g. paid in another tab or at recording) before posting anything.
    const { data: fresh } = await supabase.from('bills').select('status, amount_paid, total').eq('id', selectedBill.id).single()
    if (!fresh) { toast('Bill not found', 'error'); setBillSaving(false); return }
    if (fresh.status === 'paid' || fresh.status === 'void') {
      toast(`This bill is already ${fresh.status === 'void' ? 'voided' : 'fully paid'} — no further payment can be recorded.`, 'error')
      setBillSaving(false); loadBills(); return
    }
    const remaining = Math.round((Number(fresh.total) - Number(fresh.amount_paid)) * 100) / 100
    if (payAmt > remaining + 0.001) {
      toast(`Amount ${formatCurrency(payAmt)} exceeds the remaining balance of ${formatCurrency(remaining)}.`, 'error')
      setBillSaving(false); return
    }

    const newPaid = Math.round((Number(fresh.amount_paid) + payAmt) * 100) / 100
    const newStatus = newPaid >= Number(fresh.total) - 0.001 ? 'paid' : 'partial'

    const apAcct   = accounts.find(a => a.code === '2100')
    // A bill is settled FROM a GL account the user picks — a cash/bank account,
    // or 2400 Loan From ITC (ITC covers it, increasing the loan). The JE is
    // always DR 2100 Accounts Payable / CR <selected account>.
    const creditCode = billPayForm.account_code
    const creditAcct = accounts.find(a => a.code === creditCode)
    if (!apAcct || !creditAcct) {
      toast(`Missing GL account (${!apAcct ? '2100 Accounts Payable' : creditCode}) — add it in Chart of Accounts first`, 'error')
      setBillSaving(false); return
    }
    let jeId: string | null = null
    {
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
          { entry_id: je.id, account_id: apAcct.id,     debit: payAmt, credit: 0 },
          { entry_id: je.id, account_id: creditAcct.id, debit: 0, credit: payAmt },
        ])
        if (lineErr) {
          await supabase.from('journal_entries').delete().eq('id', je.id)
          toast('Failed to save journal lines', 'error'); setBillSaving(false); return
        }
      }
    }

    const { error: pmtErr } = await supabase.from('bill_payments').insert({
      bill_id: selectedBill.id, payment_date: billPayForm.payment_date,
      amount: payAmt, payment_method: `${creditAcct.code} ${creditAcct.name.trim()}`,
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
    setBillPayForm({ payment_date: todayStr(), amount: '', account_code: '1010', reference: '', notes: '' })
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

    // ── Edit existing ──────────────────────────────────────────────
    if (pcEditId) {
      const { error } = await supabase.from('petty_cash_transactions').update({
        transaction_date: pcForm.date, description: pcForm.description, category: pcForm.category,
        amount: Number(pcForm.amount), transaction_type: pcForm.type,
        reference: pcForm.reference || null,
        reservation_id: pcForm.reservation_id || null,
        reservation_line_item_id: pcForm.reservation_line_item_id || null,
      }).eq('id', pcEditId)
      if (error) { toast(error.message, 'error'); setPcSaving(false); return }
      if (pcEditJeId) {
        await supabase.from('journal_entries').update({
          entry_date: pcForm.date,
          description: `Petty cash ${pcForm.type} — ${pcForm.description}`,
        }).eq('id', pcEditJeId)
        const { data: lines } = await supabase.from('journal_entry_lines').select('id, debit, credit').eq('entry_id', pcEditJeId)
        const newExpenseAcctId = pcForm.type === 'out'
          ? (pcForm.expense_account_id || accounts.find(a => a.code === '5800')?.id)
          : null
        for (const line of lines ?? []) {
          if (line.debit > 0) {
            const update: Record<string, any> = { debit: Number(pcForm.amount), description: pcForm.description }
            if (newExpenseAcctId) update.account_id = newExpenseAcctId
            await supabase.from('journal_entry_lines').update(update).eq('id', line.id)
          } else {
            await supabase.from('journal_entry_lines').update({ credit: Number(pcForm.amount), description: pcForm.description }).eq('id', line.id)
          }
        }
      }
      toast('Transaction updated')
      setPcSaving(false); setPcFormOpen(false); setPcEditId(null); setPcEditJeId(null)
      setPcForm({ date: todayStr(), description: '', category: 'Miscellaneous', amount: '', type: 'out', reference: '', expense_account_id: '', reservation_id: '', reservation_line_item_id: '' })
      loadPetty(); loadEntries()
      return
    }

    // ── Insert new ─────────────────────────────────────────────────
    let jeId: string | null = null
    try {
      const cashOnHandAcct = accounts.find(a => a.code === '1011') ?? accounts.find(a => a.code === '1010')
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
      reservation_id: pcForm.reservation_id || null,
      reservation_line_item_id: pcForm.reservation_line_item_id || null,
      branch_id: activeBranch?.id ?? null,
    })
    if (error) {
      if (jeId) await supabase.from('journal_entries').delete().eq('id', jeId)
      toast(error.message, 'error'); setPcSaving(false); return
    }
    toast(`Petty cash ${pcForm.type} recorded`)
    setPcSaving(false); setPcFormOpen(false)
    setPcForm({ date: todayStr(), description: '', category: 'Miscellaneous', amount: '', type: 'out', reference: '', expense_account_id: '', reservation_id: '', reservation_line_item_id: '' })
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

  // ── Account drill-down ────────────────────────────────────────
  // Click an account line on Trial Balance / P&L / Balance Sheet to see the
  // journal entries that make up its balance for that report's period.

  async function toggleAcctDrilldown(accountId: string, from: string | undefined, to: string | undefined) {
    if (expandedReportAccts.has(accountId)) {
      setExpandedReportAccts(prev => { const s = new Set(prev); s.delete(accountId); return s })
      return
    }
    setExpandedReportAccts(prev => new Set([...prev, accountId]))
    if (reportAcctLines[accountId] || !activeBranch) return
    setReportAcctLoading(prev => new Set([...prev, accountId]))
    let jeQ = supabase.from('journal_entries').select('id').eq('branch_id', activeBranch.id).eq('status', 'posted').eq('is_void', false)
    if (from) jeQ = jeQ.gte('entry_date', from)
    if (to) jeQ = jeQ.lte('entry_date', to)
    const { data: jeIdRows } = await jeQ
    const ids = (jeIdRows ?? []).map((e: any) => e.id)
    let lines: any[] = []
    if (ids.length > 0) {
      const { data } = await supabase.from('journal_entry_lines')
        .select('*, entry:journal_entries(entry_number, entry_date, description, reference)')
        .eq('account_id', accountId).in('entry_id', ids)
      lines = (data ?? []).sort((a: any, b: any) => (a.entry?.entry_date ?? '').localeCompare(b.entry?.entry_date ?? ''))
    }
    setReportAcctLines(prev => ({ ...prev, [accountId]: lines }))
    setReportAcctLoading(prev => { const s = new Set(prev); s.delete(accountId); return s })
  }

  function AcctDrilldown({ accountId }: { accountId: string }) {
    const lines = reportAcctLines[accountId]
    const loading = reportAcctLoading.has(accountId)
    if (loading) return <p className="text-xs text-hmuted py-2 pl-4">Loading entries…</p>
    if (!lines || lines.length === 0) return <p className="text-xs text-hmuted py-2 pl-4">No entries in this period.</p>
    return (
      <div className="pl-4 py-2 space-y-1 bg-hbg/60 rounded-lg my-1">
        {lines.map((l: any) => (
          <div key={l.id} className="flex items-center justify-between text-xs py-1 border-b border-hborder/30 last:border-0 pr-2">
            <div className="min-w-0 flex-1">
              <span className="font-mono text-hmuted whitespace-nowrap">{l.entry?.entry_number}</span>
              <span className="text-hmuted whitespace-nowrap ml-2">{l.entry?.entry_date ? formatDate(l.entry.entry_date) : ''}</span>
              <span className="text-htext ml-2 truncate">{l.entry?.description}</span>
            </div>
            <span className="tabular-nums whitespace-nowrap ml-3">
              {Number(l.debit) > 0 ? <span className="text-htext">DR {formatCurrency(l.debit)}</span> : <span className="text-hmuted">CR {formatCurrency(l.credit)}</span>}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // ── Trial Balance ──────────────────────────────────────────────

  async function loadTrialBalance() {
    if (!activeBranch) return
    setTbLoading(true)
    setExpandedReportAccts(new Set())
    setReportAcctLines({})
    let q = supabase.from('journal_entries').select('id').eq('branch_id', activeBranch.id).eq('status', 'posted').eq('is_void', false)
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
    setExpandedReportAccts(new Set())
    setReportAcctLines({})
    setDiscountDetailsOpen(false)
    let q = supabase.from('journal_entries').select('id, reference, reference_type').eq('branch_id', activeBranch.id).eq('status', 'posted').eq('is_void', false)
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

      // Revenue lines above are already net of discounts (the JE only ever
      // recognizes the post-discount amount) — surface how much was given
      // away as a separate figure rather than restating the account lines.
      const invoiceNumbers = [...new Set(
        (jeData ?? [])
          .filter((e: any) => ['invoice', 'deposit_applied', 'invoice_correction'].includes(e.reference_type))
          .map((e: any) => e.reference)
          .filter(Boolean)
      )] as string[]
      let totalDiscounts = 0
      let discountDetails: { invoice_number: string; guest_name: string; discount_amount: number }[] = []
      if (invoiceNumbers.length > 0) {
        const { data: invRows } = await supabase.from('invoices')
          .select('invoice_number, discount_amount, guest:guests(full_name)')
          .eq('branch_id', activeBranch.id).in('invoice_number', invoiceNumbers)
        discountDetails = (invRows ?? [])
          .filter((i: any) => Number(i.discount_amount) > 0)
          .map((i: any) => ({ invoice_number: i.invoice_number, guest_name: i.guest?.full_name ?? 'Guest', discount_amount: Number(i.discount_amount) }))
          .sort((a, b) => a.invoice_number.localeCompare(b.invoice_number))
        totalDiscounts = discountDetails.reduce((s, i) => s + i.discount_amount, 0)
      }

      setReportData({ type: 'pl', revenue, expenses, totalRev: revenue.reduce((s, a) => s + a.balance, 0), totalExp: expenses.reduce((s, a) => s + a.balance, 0), totalDiscounts, discountDetails })
    } else {
      const revAccts  = withBal.filter(a => a.type === 'revenue')
      const expAccts  = withBal.filter(a => a.type === 'expense')
      const incomeRevenue  = revAccts.reduce((s, a) => s + a.balance, 0)
      const incomeExpenses = expAccts.reduce((s, a) => s + a.balance, 0)
      const netIncome = incomeRevenue - incomeExpenses
      const isRelevant = (a: any) => a.is_active || Math.abs(a.balance) > 0.001
      const assetAccts = withBal.filter(a => a.type === 'asset' && isRelevant(a))
      const liabAccts  = withBal.filter(a => a.type === 'liability' && isRelevant(a))
      const equityAccts = withBal.filter(a => a.type === 'equity' && isRelevant(a))
      setReportData({
        type: 'bs',
        assets:         assetAccts,
        liabilities:    liabAccts,
        equity:         equityAccts,
        totalAssets:    assetAccts.reduce((s, a) => s + a.balance, 0),
        totalLiab:      liabAccts.reduce((s, a) => s + a.balance, 0),
        totalEquity:    equityAccts.reduce((s, a) => s + a.balance, 0) + netIncome,
        netIncome,
        incomeRevenue,
        incomeExpenses,
      })
    }
    setReportLoading(false)
  }

  // ── Bank Reconciliation ────────────────────────────────────────

  async function loadReconciliation() {
    if (!activeBranch) return
    if (!reconAccountId) { toast('Select an account to reconcile', 'error'); return }
    setReconLoading(true)
    const { data: jeData } = await supabase.from('journal_entries')
      .select('id').eq('branch_id', activeBranch.id).eq('status', 'posted').eq('is_void', false)
    const ids = (jeData ?? []).map((e: any) => e.id)
    if (ids.length === 0) { setReconLines([]); setReconLoading(false); return }
    const { data } = await supabase.from('journal_entry_lines')
      .select('*, entry:journal_entries(entry_number, entry_date, description)')
      .eq('account_id', reconAccountId).in('entry_id', ids)
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
    if (ledgerGroups.length === 0) { toast('Load the ledger first', 'error'); return }
    const sheets = ledgerGroups.map(({ account, rows }) => ({
      name: `${account.code} ${account.name}`.slice(0, 31),
      rows: rows.map((r: any) => ({
        'Account': `${account.code} — ${account.name}`,
        'Entry #': r.entry?.entry_number ?? '',
        'Date': r.entry?.entry_date ?? '',
        'Description': r.entry?.description ?? '',
        'Reference': r.entry?.reference ?? '',
        'Debit': Number(r.debit),
        'Credit': Number(r.credit),
        'Balance': Number(r.running_balance ?? 0),
      }))
    }))
    exportXlsx(`Ledger_${todayStr()}`, sheets)
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

  async function exportReport() {
    if (!reportData || !activeBranch) { toast('Load the report first', 'error'); return }

    // Fetch the drill-down journal entries for every account in the report, so
    // the export carries the full detail — not just account totals. Same period
    // + posted/non-void filter the on-screen drill-down uses.
    const from = reportType === 'pl' ? reportFrom : undefined
    let jeQ = supabase.from('journal_entries').select('id').eq('branch_id', activeBranch.id).eq('status', 'posted').eq('is_void', false)
    if (from) jeQ = jeQ.gte('entry_date', from)
    if (reportTo) jeQ = jeQ.lte('entry_date', reportTo)
    const { data: jeIdRows } = await jeQ
    const jeIds = (jeIdRows ?? []).map((e: any) => e.id)
    const { data: allLines } = jeIds.length > 0
      ? await supabase.from('journal_entry_lines')
          .select('account_id, debit, credit, entry:journal_entries(entry_number, entry_date, description, reference)')
          .in('entry_id', jeIds)
      : { data: [] as any[] }
    const byAcct: Record<string, any[]> = {}
    for (const l of allLines ?? []) { (byAcct[l.account_id] ||= []).push(l) }

    const COLS = ['Section', 'Code', 'Account', 'Entry #', 'Date', 'Description', 'Debit', 'Credit', 'Amount'] as const
    const blank = () => Object.fromEntries(COLS.map(c => [c, ''])) as Record<string, any>
    const sectionRow = (label: string) => ({ ...blank(), Section: label })
    const totalRow = (label: string, amount: number) => ({ ...blank(), Account: label, Amount: Number(amount) })
    // An account's summary line followed by each of its journal entries.
    const acctBlock = (a: any) => {
      const out: Record<string, any>[] = [{ ...blank(), Code: a.code, Account: a.name, Amount: Number(a.balance) }]
      const lines = (byAcct[a.id] ?? []).slice().sort((x, y) => (x.entry?.entry_date ?? '').localeCompare(y.entry?.entry_date ?? ''))
      for (const l of lines) {
        out.push({
          ...blank(),
          'Entry #': l.entry?.entry_number ?? '',
          Date: l.entry?.entry_date ?? '',
          Description: l.entry?.description ?? '',
          Debit: Number(l.debit) || '',
          Credit: Number(l.credit) || '',
        })
      }
      return out
    }

    if (reportData.type === 'pl') {
      const rows = [
        sectionRow('REVENUE'),
        ...reportData.revenue.flatMap(acctBlock),
        totalRow('Total Revenue', reportData.totalRev),
        blank(),
        sectionRow('EXPENSES'),
        ...reportData.expenses.flatMap(acctBlock),
        totalRow('Total Expenses', reportData.totalExp),
        blank(),
        totalRow('NET INCOME', Number(reportData.totalRev) - Number(reportData.totalExp)),
      ]
      exportXlsx(`PL_${reportFrom}_${reportTo}`, [{ name: 'Income Statement', rows }])
    } else {
      const diff = Number(reportData.totalAssets) - (Number(reportData.totalLiab) + Number(reportData.totalEquity))
      const rows = [
        sectionRow('ASSETS'),
        ...reportData.assets.flatMap(acctBlock),
        totalRow('Total Assets', reportData.totalAssets),
        blank(),
        sectionRow('LIABILITIES'),
        ...reportData.liabilities.flatMap(acctBlock),
        totalRow('Total Liabilities', reportData.totalLiab),
        blank(),
        sectionRow('EQUITY'),
        ...reportData.equity.flatMap(acctBlock),
        totalRow('Net Income', reportData.netIncome),
        totalRow('Total Equity', reportData.totalEquity),
        blank(),
        totalRow('Total Liabilities + Equity', Number(reportData.totalLiab) + Number(reportData.totalEquity)),
        { ...blank(), Account: 'BALANCE CHECK (Assets − Liab − Equity)', Amount: Number(diff.toFixed(2)) },
        { ...blank(), Account: 'Status', Description: Math.abs(diff) < 0.01 ? 'BALANCED' : 'OUT OF BALANCE' },
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
      'Reservation': (t as any).reservation?.reservation_number ?? '',
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
                { label: 'Petty Cash',        value: formatCurrency(pettyCashBalance),         color: '#C89B3C', sub: (() => { const a = accounts.find(x => x.code === '1011') ?? accounts.find(x => x.code === '1010'); return a ? `${a.code} — ${a.name}` : '1011 — Petty Cash' })() },
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
              <table className="w-full text-sm table-fixed">
                <thead><tr className="bg-hsurface2">
                  {([['Entry #', 'w-[20%]'], ['Date', 'w-[14%]'], ['Description', 'w-[32%]'], ['Reference', 'w-[20%]'], ['Type', 'w-[14%]']] as const).map(([h, w]) => (
                    <th key={h} className={cn('px-3 py-2.5 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide', w)}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {entries.slice(0, 10).map(e => (
                    <tr key={e.id} className="border-t border-hborder hover:bg-hbg/40">
                      <td className="px-3 py-2 font-mono text-xs text-hmuted whitespace-nowrap truncate">{e.entry_number}</td>
                      <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{formatDate(e.entry_date)}</td>
                      <td className="px-3 py-2 text-htext truncate" title={e.description}>{e.description}</td>
                      <td className="px-3 py-2 text-xs text-hmuted font-mono whitespace-nowrap truncate">{e.reference ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className="bg-hsurface2 text-hmuted text-[10px] px-2 py-0.5 rounded-full capitalize whitespace-nowrap">
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
                <table className="w-full text-sm table-fixed">
                  <thead><tr className="bg-hsurface2">
                    {([['Invoice #', 'w-[10%]'], ['Guest', 'w-[24%]'], ['House', 'w-[8%]'], ['Date Issued', 'w-[8%]'], ['Due Date', 'w-[8%]'], ['Total', 'w-[8%]'], ['Paid', 'w-[8%]'], ['Balance', 'w-[8%]'], ['Aging', 'w-[10%]'], ['Status', 'w-[8%]']] as const).map(([h, w]) => (
                      <th key={h} className={cn('px-3 py-2.5 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap', w)}>{h}</th>
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
                          <td className="px-3 py-2 font-mono text-xs text-hmuted whitespace-nowrap truncate">{inv.invoice_number}</td>
                          <td className="px-3 py-2 text-htext truncate" title={inv.guest?.full_name ?? undefined}>{inv.guest?.full_name ?? '—'}</td>
                          <td className="px-3 py-2 text-xs text-hmuted font-mono whitespace-nowrap truncate" title={inv.house?.name ?? undefined}>{inv.house?.code || inv.house?.name || '—'}</td>
                          <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{formatDate(issueDate)}</td>
                          <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{formatDate(due.toISOString())}</td>
                          <td className="px-3 py-2 font-medium text-right whitespace-nowrap">{formatCurrency(inv.total)}</td>
                          <td className="px-3 py-2 text-right text-green-700 whitespace-nowrap">{formatCurrency(inv.amount_paid)}</td>
                          <td className="px-3 py-2 font-semibold text-right text-dark-navy whitespace-nowrap">{formatCurrency(balance)}</td>
                          <td className="px-3 py-2">
                            {inv.status !== 'paid' && inv.status !== 'void' && (
                              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap', agingColor(od))}>
                                {agingLabel(od)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
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
                <table className="w-full text-sm table-fixed">
                  <thead><tr className="bg-hsurface2">
                    {([['Bill #', 'w-[9%]'], ['Vendor', 'w-[11%]'], ['Description', 'w-[20%]'], ['Account', 'w-[7%]'], ['Bill Date', 'w-[8%]'], ['Due Date', 'w-[8%]'], ['Total', 'w-[8%]'], ['Paid', 'w-[8%]'], ['Balance', 'w-[8%]'], ['Status', 'w-[6%]'], ['Actions', 'w-[7%]']] as const).map(([h, w]) => (
                      <th key={h} className={cn('px-3 py-2.5 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap', w)}>{h}</th>
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
                          <td className="px-3 py-2 font-mono text-xs text-hmuted whitespace-nowrap truncate">{b.bill_number}</td>
                          <td className="px-3 py-2 text-htext truncate" title={vendor?.name ?? undefined}>{vendor?.name ?? '—'}</td>
                          <td className="px-3 py-2 text-htext truncate" title={b.description ?? undefined}>{b.description}</td>
                          <td className="px-3 py-2 text-xs text-hmuted font-mono whitespace-nowrap truncate" title={(b as any).line_items?.length > 1 ? (b as any).line_items.map((li: any) => `${li.account_code} ${formatCurrency(li.amount)}`).join(', ') : undefined}>
                            {(b as any).line_items?.length > 1 ? `Split (${(b as any).line_items.length})` : (expAcct ? expAcct.code : '—')}
                          </td>
                          <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{formatDate(b.bill_date)}</td>
                          <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{b.due_date ? formatDate(b.due_date) : '—'}</td>
                          <td className="px-3 py-2 font-medium text-right whitespace-nowrap">{formatCurrency(b.total)}</td>
                          <td className="px-3 py-2 text-right text-green-700 whitespace-nowrap">{formatCurrency(b.amount_paid)}</td>
                          <td className="px-3 py-2 font-semibold text-right whitespace-nowrap">{formatCurrency(balance)}</td>
                          <td className="px-3 py-2">
                            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize',
                              b.status === 'paid'    ? 'bg-green-100 text-green-700' :
                              b.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                              b.status === 'void'    ? 'bg-gray-100 text-gray-500' :
                              'bg-red-100 text-red-700'
                            )}>{b.status}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {b.status !== 'paid' && b.status !== 'void' && (
                                <button
                                  onClick={() => { setSelectedBill(b); setBillPayForm(f => ({ ...f, amount: String(balance) })); setBillPayOpen(true) }}
                                  className="text-xs text-navy hover:underline font-medium"
                                >Pay</button>
                              )}
                              {b.status !== 'void' && (
                                <button
                                  onClick={() => openBillReceipt(b)}
                                  className="text-xs text-hmuted hover:text-navy hover:underline font-medium"
                                >Receipt</button>
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
              <table className="w-full text-sm table-fixed">
                <thead><tr className="bg-hsurface2">
                  {([['Vendor Name', 'w-[24%]'], ['Contact', 'w-[13%]'], ['Phone', 'w-[11%]'], ['Email', 'w-[17%]'], ['Terms', 'w-[8%]'], ['Outstanding', 'w-[10%]'], ['Status', 'w-[7%]'], ['Actions', 'w-[10%]']] as const).map(([h, w]) => (
                    <th key={h} className={cn('px-3 py-2.5 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide', w)}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {vendors.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-hmuted">No vendors yet. Add the suppliers you regularly pay.</td></tr>
                  ) : vendors.map(v => (
                    <tr key={v.id} className={cn('border-t border-hborder hover:bg-hbg/40', !v.is_active && 'opacity-50')}>
                      <td className="px-3 py-2 font-medium text-htext truncate" title={v.name}>{v.name}</td>
                      <td className="px-3 py-2 text-xs text-hmuted truncate">{v.contact_name ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap truncate">{v.phone ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-hmuted truncate" title={v.email ?? undefined}>{v.email ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">Net {v.payment_terms}</td>
                      <td className="px-3 py-2 font-semibold text-dark-navy whitespace-nowrap truncate">{formatCurrency(vendorBalance(v.id))}</td>
                      <td className="px-3 py-2">
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium',
                          v.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        )}>{v.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td className="px-3 py-2">
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
        {tab === 'journal' && (() => {
          const filteredEntries = entries.filter(e => {
            if (jeFrom && e.entry_date < jeFrom) return false
            if (jeTo   && e.entry_date > jeTo)   return false
            if (jeStatus === 'void'   && !e.is_void) return false
            if (jeStatus === 'draft'  && (e.is_void || e.status !== 'draft'))  return false
            if (jeStatus === 'posted' && (e.is_void || e.status !== 'posted')) return false
            if (jeSearch) {
              const q = jeSearch.toLowerCase()
              if (
                !e.entry_number.toLowerCase().includes(q) &&
                !(e.description ?? '').toLowerCase().includes(q) &&
                !(e.reference   ?? '').toLowerCase().includes(q) &&
                !(e.reference_type ?? '').toLowerCase().includes(q)
              ) return false
            }
            return true
          })
          return (
          <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <input type="date" value={jeFrom} onChange={e => setJeFrom(e.target.value)} className={cn(input, 'w-auto')} />
              <span className="text-hmuted text-sm">–</span>
              <input type="date" value={jeTo} onChange={e => setJeTo(e.target.value)} className={cn(input, 'w-auto')} />
              <select value={jeStatus} onChange={e => setJeStatus(e.target.value as typeof jeStatus)} className={cn(input, 'w-auto')}>
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="posted">Posted</option>
                <option value="void">Void</option>
              </select>
              <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-hmuted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
                <input type="text" placeholder="Search entries…" value={jeSearch} onChange={e => setJeSearch(e.target.value)}
                  className={cn(input, 'pl-8')} />
              </div>
              <div className="flex gap-2 ml-auto">
                <Button variant="ghost" onClick={exportJournalEntries}>↓ Export</Button>
                <Button onClick={openAddEntry}>+ New Entry</Button>
              </div>
            </div>
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <thead><tr className="bg-hsurface2">
                  {([['', 'w-[3%]'], ['Entry #', 'w-[11%]'], ['Date', 'w-[7%]'], ['Description', 'w-[26%]'], ['Reference', 'w-[10%]'], ['Type', 'w-[9%]'], ['Status', 'w-[8%]'], ['', 'w-[26%]']] as const).map(([h, w], i) => (
                    <th key={i} className={cn('px-3 py-2.5 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide', w)}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-hmuted">
                      {entries.length === 0 ? 'No journal entries. Entries auto-post when transactions are recorded.' : 'No entries match the current filters.'}
                    </td></tr>
                  ) : filteredEntries.map(e => (
                    <>
                      <tr key={e.id} className={cn('border-t border-hborder hover:bg-hbg/40 cursor-pointer', e.is_void && 'opacity-50 bg-gray-50/60', e.status === 'draft' && !e.is_void && 'bg-amber-50/40')}
                        onClick={async () => {
                          if (expandedEntries.has(e.id)) {
                            setExpandedEntries(prev => { const s = new Set(prev); s.delete(e.id); return s })
                          } else {
                            setExpandedEntries(prev => new Set([...prev, e.id]))
                            if (!entryLines[e.id]) await loadEntryLines(e.id)
                          }
                        }}
                      >
                        <td className="px-3 py-2.5 text-hmuted text-xs">{expandedEntries.has(e.id) ? '▾' : '▸'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-hmuted truncate">
                          <span className={e.is_void ? 'line-through' : ''}>{e.entry_number}</span>
                          {e.is_void && <span className="ml-1.5 text-[9px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-bold uppercase">VOID</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{formatDate(e.entry_date)}</td>
                        <td className="px-3 py-2 text-htext truncate" title={e.description}>{e.description}</td>
                        <td className="px-3 py-2 text-xs text-hmuted font-mono whitespace-nowrap truncate">{e.reference ?? '—'}</td>
                        <td className="px-3 py-2">
                          <span className="bg-hsurface2 text-hmuted text-[10px] px-2 py-0.5 rounded-full capitalize whitespace-nowrap">
                            {(e.reference_type ?? 'manual').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {e.is_void
                            ? <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold uppercase">Void</span>
                            : e.status === 'draft'
                              ? <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase">Draft</span>
                              : <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase">Posted</span>
                          }
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap" onClick={ev => ev.stopPropagation()}>
                          {!e.is_void && (
                            <div className="flex items-center gap-1.5">
                              {e.status === 'draft' && (
                                <>
                                  {(isAdmin || !(e.reference_type && AUTO_JE_REFERENCE_TYPES.includes(e.reference_type))) && (
                                    <button
                                      onClick={() => openEditJe(e)}
                                      className="text-[11px] font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
                                    >Edit</button>
                                  )}
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
                              <button
                                onClick={() => openCorrectDate(e)}
                                className="text-[11px] font-medium text-navy border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
                              >Correct Date</button>
                              <button
                                onClick={() => openCorrectCoa(e)}
                                className="text-[11px] font-medium text-purple-700 border border-purple-200 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded transition-colors"
                              >Correct COA</button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {expandedEntries.has(e.id) && entryLines[e.id] && (
                        <>
                          <tr key={`${e.id}-lhdr`} className="bg-hsurface2/70 border-t border-hborder/40">
                            <td />
                            <td className="px-4 py-1.5 text-[10px] font-semibold text-hmuted uppercase tracking-wide">Account</td>
                            <td />
                            <td className="px-4 py-1.5 text-[10px] font-semibold text-hmuted uppercase tracking-wide">Memo</td>
                            <td colSpan={2} />
                            <td className="px-4 py-1.5 text-[10px] font-semibold text-hmuted uppercase tracking-wide text-right">Debit</td>
                            <td className="px-4 py-1.5 text-[10px] font-semibold text-hmuted uppercase tracking-wide text-right">Credit</td>
                          </tr>
                          {entryLines[e.id].map((l: any) => (
                            <tr key={l.id} className="border-t border-hborder/20 bg-hbg/40">
                              <td />
                              <td className="px-3 py-2 text-xs font-mono text-navy max-w-[220px] truncate" title={l.account?.name}>{l.account?.code} — {l.account?.name}</td>
                              <td />
                              <td className="px-3 py-2 text-xs text-hmuted max-w-[180px] truncate" title={l.description ?? undefined}>{l.description ?? ''}</td>
                              <td colSpan={2} />
                              <td className="px-3 py-2 text-xs text-right font-medium tabular-nums">{Number(l.debit)  > 0 ? formatCurrency(l.debit)  : ''}</td>
                              <td className="px-3 py-2 text-xs text-right font-medium tabular-nums">{Number(l.credit) > 0 ? formatCurrency(l.credit) : ''}</td>
                            </tr>
                          ))}
                          <tr key={`${e.id}-ltot`} className="border-t-2 border-hborder/60 bg-hsurface2/40">
                            <td colSpan={6} className="px-4 py-2 text-right text-[11px] font-semibold text-hmuted uppercase tracking-wide">Totals</td>
                            <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">{formatCurrency(entryLines[e.id].reduce((s: number, l: any) => s + Number(l.debit), 0))}</td>
                            <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">{formatCurrency(entryLines[e.id].reduce((s: number, l: any) => s + Number(l.credit), 0))}</td>
                          </tr>
                        </>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )
        })()}

        {/* ══ GENERAL LEDGER ════════════════════════════════════════ */}
        {tab === 'ledger' && (
          <div>
            <div className="flex items-end gap-3 mb-5 bg-white border border-hborder rounded-2xl p-4 shadow-card flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-hmuted mb-1">Account (optional)</label>
                <select value={ledgerAccountFilter} onChange={e => setLedgerAccountFilter(e.target.value)} className={input}>
                  <option value="">All accounts</option>
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
              <Button onClick={loadLedger}>Apply Filters</Button>
              {ledgerGroups.length > 0 && <Button variant="ghost" onClick={exportLedger}>↓ Export</Button>}
            </div>

            {ledgerLoading ? (
              <p className="text-center text-hmuted py-10">Loading…</p>
            ) : ledgerGroups.length === 0 ? (
              <p className="text-center text-hmuted py-10">No posted transactions in the selected period.</p>
            ) : (
              <div className="space-y-5">
                {ledgerGroups.map(({ account, rows }) => (
                  <div key={account.id} className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                    <div className="px-5 py-4 border-b border-hborder">
                      <h3 className="font-serif text-[17px] text-dark-navy">{account.code} — {account.name}</h3>
                      <p className="text-xs text-hmuted capitalize">{account.type} · Normal balance: {normalBalance(account.type)}</p>
                    </div>
                    <table className="w-full text-sm table-fixed">
                      <thead><tr className="bg-hsurface2">
                        {([['Date', 'w-[10%]'], ['Entry #', 'w-[16%]'], ['Description', 'w-[30%]'], ['Reference', 'w-[16%]'], ['Debit', 'w-[10%]'], ['Credit', 'w-[10%]'], ['Balance', 'w-[8%]']] as const).map(([h, w]) => (
                          <th key={h} className={cn('px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide', ['Debit','Credit','Balance'].includes(h) ? 'text-right' : 'text-left', w)}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {rows.map((r: any, i: number) => (
                          <tr key={r.id} className={cn('border-t border-hborder', i % 2 === 1 ? 'bg-hbg/30' : '')}>
                            <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{formatDate(r.entry.entry_date)}</td>
                            <td className="px-3 py-2 font-mono text-xs text-hmuted whitespace-nowrap truncate">{r.entry.entry_number}</td>
                            <td className="px-3 py-2 text-htext truncate" title={r.entry.description}>{r.entry.description}</td>
                            <td className="px-3 py-2 text-xs text-hmuted font-mono whitespace-nowrap truncate">{r.entry.reference ?? '—'}</td>
                            <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{Number(r.debit)  > 0 ? formatCurrency(r.debit)  : ''}</td>
                            <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{Number(r.credit) > 0 ? formatCurrency(r.credit) : ''}</td>
                            <td className="px-3 py-2 text-right font-bold text-dark-navy whitespace-nowrap">{formatCurrency(r.running_balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-dark-navy text-white">
                          <td colSpan={4} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Totals</td>
                          <td className="px-3 py-2 text-right font-bold">{formatCurrency(rows.reduce((s: number, r: any) => s + Number(r.debit), 0))}</td>
                          <td className="px-3 py-2 text-right font-bold">{formatCurrency(rows.reduce((s: number, r: any) => s + Number(r.credit), 0))}</td>
                          <td className="px-3 py-2 text-right font-bold">{formatCurrency(rows[rows.length - 1]?.running_balance ?? 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}
              </div>
            )}
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
                <table className="w-full text-sm table-fixed">
                  <thead><tr className="bg-hsurface2">
                    {([['', 'w-[4%]'], ['Code','w-[10%]'],['Account Name','w-[34%]'],['Type','w-[14%]'],['Debit ($)','w-[13%]'],['Credit ($)','w-[13%]'],['Balance ($)','w-[12%]']] as const).map(([h, w]) => (
                      <th key={h} className={cn('px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide', h.includes('$') ? 'text-right' : 'text-left', w)}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {tbRows.map((r, i) => (
                      <>
                        <tr
                          key={r.id}
                          className={cn('border-t border-hborder cursor-pointer hover:bg-hbg/50', i % 2 === 1 ? 'bg-hbg/30' : '')}
                          onClick={() => toggleAcctDrilldown(r.id, tbFrom, tbTo)}
                        >
                          <td className="px-3 py-2 text-hmuted text-xs">{expandedReportAccts.has(r.id) ? '▾' : '▸'}</td>
                          <td className="px-3 py-2 font-mono text-xs text-navy whitespace-nowrap truncate">{r.code}</td>
                          <td className="px-3 py-2 text-htext truncate" title={r.name}>{r.name}</td>
                          <td className="px-3 py-2"><span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', TYPE_COLOR[r.type as AccountType])}>{r.type}</span></td>
                          <td className="px-3 py-2 text-right text-hmuted whitespace-nowrap">{r.dr > 0 ? formatCurrency(r.dr) : ''}</td>
                          <td className="px-3 py-2 text-right text-hmuted whitespace-nowrap">{r.cr > 0 ? formatCurrency(r.cr) : ''}</td>
                          <td className={cn('px-3 py-2 text-right font-semibold whitespace-nowrap', r.balance < 0 ? 'text-red-600' : 'text-dark-navy')}>{formatCurrency(Math.abs(r.balance))}</td>
                        </tr>
                        {expandedReportAccts.has(r.id) && (
                          <tr className="border-t border-hborder/40">
                            <td colSpan={7} className="px-3"><AcctDrilldown accountId={r.id} /></td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const totDr = tbRows.reduce((s, r) => s + r.dr, 0)
                      const totCr = tbRows.reduce((s, r) => s + r.cr, 0)
                      const balanced = Math.abs(totDr - totCr) < 0.01
                      return (
                        <tr className="bg-dark-navy text-white">
                          <td colSpan={4} className="px-4 py-3 font-bold text-sm uppercase tracking-wide">Totals</td>
                          <td className="px-3 py-2 text-right font-bold">{formatCurrency(totDr)}</td>
                          <td className="px-3 py-2 text-right font-bold">{formatCurrency(totCr)}</td>
                          <td className="px-3 py-2 text-right font-bold">
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
                      <div key={a.id}>
                        <div
                          className="flex justify-between py-1.5 border-b border-hborder/40 text-sm cursor-pointer hover:bg-hbg/50 -mx-1 px-1 rounded"
                          onClick={() => toggleAcctDrilldown(a.id, reportFrom, reportTo)}
                        >
                          <span className="text-htext">{expandedReportAccts.has(a.id) ? '▾' : '▸'} {a.code} — {a.name}</span>
                          <span className="font-medium text-green-700">{formatCurrency(a.balance)}</span>
                        </div>
                        {expandedReportAccts.has(a.id) && <AcctDrilldown accountId={a.id} />}
                      </div>
                    ))}
                    <div className="flex justify-between py-2 font-bold text-dark-navy">
                      <span>Total Revenue</span><span>{formatCurrency(reportData.totalRev)}</span>
                    </div>
                    {reportData.totalDiscounts > 0 && (
                      <div className="-mt-1">
                        <p
                          className="text-[11px] text-hmuted cursor-pointer hover:text-navy inline"
                          onClick={() => setDiscountDetailsOpen(o => !o)}
                        >
                          {discountDetailsOpen ? '▾' : '▸'} Already net of {formatCurrency(reportData.totalDiscounts)} in discounts given this period — revenue lines above reflect what was actually recognized, not the pre-discount amount.
                        </p>
                        {discountDetailsOpen && (
                          <div className="mt-2 bg-hbg/60 rounded-lg p-2 space-y-1">
                            {reportData.discountDetails.map((d: any) => (
                              <div key={d.invoice_number} className="flex items-center justify-between text-xs py-0.5">
                                <span className="text-htext">
                                  <span className="font-mono text-hmuted">{d.invoice_number}</span>
                                  <span className="ml-2">{d.guest_name}</span>
                                </span>
                                <span className="text-hmuted tabular-nums">{formatCurrency(d.discount_amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-hmuted uppercase tracking-wide mb-2">Expenses</p>
                    {reportData.expenses.map((a: any) => (
                      <div key={a.id}>
                        <div
                          className="flex justify-between py-1.5 border-b border-hborder/40 text-sm cursor-pointer hover:bg-hbg/50 -mx-1 px-1 rounded"
                          onClick={() => toggleAcctDrilldown(a.id, reportFrom, reportTo)}
                        >
                          <span className="text-htext">{expandedReportAccts.has(a.id) ? '▾' : '▸'} {a.code} — {a.name}</span>
                          <span className="font-medium text-red-600">{formatCurrency(a.balance)}</span>
                        </div>
                        {expandedReportAccts.has(a.id) && <AcctDrilldown accountId={a.id} />}
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

            {reportData?.type === 'bs' && (() => {
              // ── Group assets by code range (industry standard) ─────────────────
              // Robust against incorrect category assignments in the DB.
              // Category 'Bank' → Cash & Bank; otherwise by numeric code:
              //   code < 1500     → Current Assets (AR, inventory, prepaid…)
              //   1500 ≤ code < 1800 → Fixed Assets (PP&E + accumulated dep.)
              //   code ≥ 1800     → Other Assets
              const codeNum = (a: any) => Number(a.code)
              type BsGroup = { key: string; label: string; filter: (a: any) => boolean; totalLabel: string }
              const ASSET_GROUPS: BsGroup[] = [
                { key: 'bank',    label: 'Cash & Bank',    filter: (a) => (a.category ?? '').toLowerCase() === 'bank' || codeNum(a) < 1030,                        totalLabel: 'Total Cash & Bank' },
                { key: 'current', label: 'Current Assets', filter: (a) => (a.category ?? '').toLowerCase() !== 'bank' && codeNum(a) >= 1030 && codeNum(a) < 1500,  totalLabel: 'Total Current Assets' },
                { key: 'fixed',   label: 'Fixed Assets',   filter: (a) => (a.category ?? '').toLowerCase() !== 'bank' && codeNum(a) >= 1500 && codeNum(a) < 1800,  totalLabel: 'Total Fixed Assets' },
                { key: 'other',   label: 'Other Assets',   filter: (a) => (a.category ?? '').toLowerCase() !== 'bank' && codeNum(a) >= 1800,                       totalLabel: 'Total Other Assets' },
              ]
              const ungroupedAssets = reportData.assets.filter((a: any) =>
                !ASSET_GROUPS.some(g => g.filter(a))
              )
              // ── Group liabilities by category ────────────────────────────────
              // Detect AP accounts by name (case-insensitive) rather than code range
              const isApAccount = (a: any) =>
                /accounts?\s*payable/i.test(a.name) || (a.category === 'current_liability' && Number(a.code) < 2200)
              const apAccts   = reportData.liabilities.filter(isApAccount)
              const otherLiab = reportData.liabilities.filter((a: any) => !isApAccount(a))
              const totalAP   = apAccts.reduce((s: number, a: any) => s + a.balance, 0)
              // Income summary for bottom panel
              const incomeRevenue  = reportData.incomeRevenue  ?? 0
              const incomeExpenses = reportData.incomeExpenses ?? 0
              const netIncome      = reportData.netIncome       ?? 0

              function BsAcctRow({ a }: { a: any }) {
                return (
                  <div key={a.id}>
                    <div
                      className="flex justify-between py-1 text-sm border-b border-hborder/20 cursor-pointer hover:bg-hbg/50 -mx-1 px-1 rounded"
                      onClick={() => toggleAcctDrilldown(a.id, undefined, reportTo)}
                    >
                      <span className="flex items-center gap-1 text-htext">
                        <span className="text-hmuted text-[10px]">{expandedReportAccts.has(a.id) ? '▾' : '▸'}</span>
                        <span className="font-mono text-[11px] text-navy">{a.code}</span>
                        <span className="text-hmuted">·</span>
                        <span>{a.name}</span>
                      </span>
                      <span className={cn('font-medium tabular-nums', a.balance < 0 ? 'text-red-500' : '')}>
                        {a.balance < 0 ? `(${formatCurrency(Math.abs(a.balance))})` : formatCurrency(a.balance)}
                      </span>
                    </div>
                    {expandedReportAccts.has(a.id) && <AcctDrilldown accountId={a.id} />}
                  </div>
                )
              }

              return (
                <div className="grid grid-cols-2 gap-4">

                  {/* ── LEFT: ASSETS ── */}
                  <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-hborder flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#1A7A4A]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                      <p className="font-bold text-[#1A7A4A] text-sm uppercase tracking-wide">Assets</p>
                    </div>
                    <div className="p-4 space-y-4">

                      {ASSET_GROUPS.map(g => {
                        const accts = reportData.assets.filter((a: any) => g.filter(a))
                        if (accts.length === 0) return null
                        const subtotal = accts.reduce((s: number, a: any) => s + a.balance, 0)
                        return (
                          <div key={g.key}>
                            <p className="text-[10px] font-semibold tracking-widest text-hmuted uppercase mb-1.5">{g.label}</p>
                            <div className="space-y-0.5">
                              {accts.map((a: any) => <BsAcctRow key={a.id} a={a} />)}
                            </div>
                            <div className="flex justify-between pt-2 mt-1 border-t border-hborder font-semibold text-sm text-[#1A7A4A]">
                              <span>{g.totalLabel}</span>
                              <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                            </div>
                          </div>
                        )
                      })}

                      {/* Ungrouped assets fallback */}
                      {ungroupedAssets.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold tracking-widest text-hmuted uppercase mb-1.5">Other Assets</p>
                          <div className="space-y-0.5">
                            {ungroupedAssets.map((a: any) => <BsAcctRow key={a.id} a={a} />)}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between pt-2 font-bold text-dark-navy border-t-2 border-dark-navy text-[15px]">
                        <span>Total Assets</span>
                        <span className="tabular-nums">{formatCurrency(reportData.totalAssets)}</span>
                      </div>
                    </div>
                  </div>

                  {/* ── RIGHT: Liabilities + Equity ── */}
                  <div className="space-y-4">

                    {/* Liabilities */}
                    <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                      <div className="px-5 py-3 border-b border-hborder flex items-center gap-2">
                        <svg className="w-4 h-4 text-[#B83232]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
                        <p className="font-bold text-[#B83232] text-sm uppercase tracking-wide">Liabilities</p>
                      </div>
                      <div className="p-4 space-y-4">

                        {/* Accounts Payable */}
                        {apAccts.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold tracking-widest text-hmuted uppercase mb-1.5">Accounts Payable</p>
                            <div className="space-y-0.5">
                              {apAccts.map((a: any) => <BsAcctRow key={a.id} a={a} />)}
                            </div>
                            <div className="flex justify-between pt-2 mt-1 border-t border-hborder font-semibold text-sm text-[#B83232]">
                              <span>Total Payables</span>
                              <span className="tabular-nums">{formatCurrency(totalAP)}</span>
                            </div>
                          </div>
                        )}

                        {/* Other Current Liabilities */}
                        {otherLiab.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold tracking-widest text-hmuted uppercase mb-1.5">Other Current Liabilities</p>
                            <div className="space-y-0.5">
                              {otherLiab.map((a: any) => <BsAcctRow key={a.id} a={a} />)}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between pt-2 font-bold text-dark-navy border-t-2 border-dark-navy text-[15px]">
                          <span>Total Liabilities</span>
                          <span className="tabular-nums">{formatCurrency(reportData.totalLiab)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Equity */}
                    <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                      <div className="px-5 py-3 border-b border-hborder flex items-center gap-2">
                        <svg className="w-4 h-4 text-[#7C3AED]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-2.21 0-4 1.343-4 3s1.79 3 4 3 4 1.343 4 3-1.79 3-4 3m0-18v2m0 16v2" /></svg>
                        <p className="font-bold text-[#7C3AED] text-sm uppercase tracking-wide">Equity</p>
                      </div>
                      <div className="p-4 space-y-4">
                        {reportData.equity.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold tracking-widest text-hmuted uppercase mb-1.5">Share Capital</p>
                            <div className="space-y-0.5">
                              {reportData.equity.map((a: any) => <BsAcctRow key={a.id} a={a} />)}
                            </div>
                            <div className="flex justify-between pt-2 mt-1 border-t border-hborder font-semibold text-sm text-[#7C3AED]">
                              <span>Total Share Capital</span>
                              <span className="tabular-nums">{formatCurrency(reportData.equity.reduce((s: number, a: any) => s + a.balance, 0))}</span>
                            </div>
                          </div>
                        )}
                        <div className="flex justify-between py-1.5 text-sm border-b border-hborder/30">
                          <span className="text-htext font-medium italic">Net Income (Current Period)</span>
                          <span className={cn('font-semibold tabular-nums', reportData.netIncome < 0 ? 'text-red-500' : 'text-[#1A7A4A]')}>
                            {reportData.netIncome < 0 ? `(${formatCurrency(Math.abs(reportData.netIncome))})` : formatCurrency(reportData.netIncome)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 font-bold text-dark-navy border-t-2 border-dark-navy text-[15px]">
                          <span>Total Equity</span>
                          <span className="tabular-nums">{formatCurrency(reportData.totalEquity)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Liabilities + Equity check */}
                    {(() => {
                      const lhs = Number(reportData.totalAssets)
                      const rhs = Number(reportData.totalLiab) + Number(reportData.totalEquity)
                      const balanced = Math.abs(lhs - rhs) < 0.01
                      return (
                        <div className={cn('rounded-2xl border px-5 py-3.5 flex items-center justify-between', balanced ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-300')}>
                          <span className={cn('font-bold text-sm', balanced ? 'text-green-800' : 'text-red-800')}>Liabilities + Equity</span>
                          <div className="flex items-center gap-3">
                            <span className="font-bold tabular-nums text-[15px] text-dark-navy">{formatCurrency(rhs)}</span>
                            <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', balanced ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                              {balanced ? '✓ Balanced' : `Off by ${formatCurrency(Math.abs(lhs - rhs))}`}
                            </span>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Income Summary */}
                    <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                      <div className="px-5 py-3 border-b border-hborder">
                        <p className="font-bold text-dark-navy text-sm">Income Summary</p>
                      </div>
                      <div className="p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-hmuted">Revenue</span>
                          <span className="font-semibold text-[#1A7A4A] tabular-nums">{formatCurrency(incomeRevenue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-hmuted">Expenses</span>
                          <span className="font-semibold text-[#B83232] tabular-nums">
                            {incomeExpenses > 0 ? `(${formatCurrency(incomeExpenses)})` : formatCurrency(incomeExpenses)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-hborder font-bold">
                          <span className="text-dark-navy">Net Income</span>
                          <span className={cn('tabular-nums', netIncome < 0 ? 'text-red-600' : 'text-[#1A7A4A]')}>
                            {netIncome < 0 ? `(${formatCurrency(Math.abs(netIncome))})` : formatCurrency(netIncome)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )
            })()}

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
                <label className="block text-xs text-hmuted mb-1">Account</label>
                <select
                  value={reconAccountId}
                  onChange={e => { setReconAccountId(e.target.value); setReconLines([]) }}
                  className={input}
                  style={{ width: 240 }}
                >
                  <option value="">Select account…</option>
                  {accounts.filter(a => a.is_active && a.type === 'asset').map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">Statement Balance ($)</label>
                <input type="number" step="0.01" value={reconStmtBal} onChange={e => setReconStmtBal(e.target.value)} placeholder="0.00" className={input} style={{ width: 160 }} />
              </div>
              <Button onClick={loadReconciliation} disabled={reconLoading || !reconAccountId}>{reconLoading ? 'Loading…' : 'Load Transactions'}</Button>
              <p className="text-xs text-hmuted self-end pb-2">Check off items that appear on the bank statement.</p>
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
                    <table className="w-full text-sm table-fixed">
                      <thead><tr className="bg-hsurface2">
                        <th className="px-3 py-3 w-[5%]" />
                        {([['Date','w-[10%]'],['Entry #','w-[15%]'],['Description','w-[38%]'],['Debit','w-[11%]'],['Credit','w-[11%]'],['Cleared','w-[10%]']] as const).map(([h, w]) => (
                          <th key={h} className={cn('px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide', h.match(/Debit|Credit/) ? 'text-right' : 'text-left', w)}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {reconLines.map((r: any) => (
                          <tr key={r.id} className={cn('border-t border-hborder transition-colors', r.is_reconciled ? 'bg-green-50/60' : 'hover:bg-hbg/40')}>
                            <td className="px-3 py-2.5 text-center">
                              <input type="checkbox" checked={r.is_reconciled} onChange={() => toggleReconciled(r.id, r.is_reconciled)}
                                className="w-4 h-4 accent-green-600 cursor-pointer" />
                            </td>
                            <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{formatDate(r.entry?.entry_date)}</td>
                            <td className="px-3 py-2 font-mono text-xs text-hmuted truncate">{r.entry?.entry_number}</td>
                            <td className="px-3 py-2 text-htext truncate">{r.entry?.description}</td>
                            <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{Number(r.debit) > 0 ? formatCurrency(r.debit) : ''}</td>
                            <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{Number(r.credit) > 0 ? formatCurrency(r.credit) : ''}</td>
                            <td className="px-3 py-2 text-center">{r.is_reconciled ? <span className="text-green-600 font-bold">✓</span> : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            })()}
            {reconLines.length === 0 && !reconLoading && (
              <p className="text-center text-hmuted py-16">{reconAccountId ? 'Click Load Transactions to begin reconciliation.' : 'Select an account above, then click Load Transactions.'}</p>
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
              <table className="w-full text-sm table-fixed">
                <thead><tr className="bg-hsurface2">
                  {([['Template Name','w-[20%]'],['Description','w-[34%]'],['Frequency','w-[14%]'],['Next Due','w-[14%]'],['Active','w-[8%]'],['Actions','w-[10%]']] as const).map(([h, w]) => (
                    <th key={h} className={cn('px-3 py-2.5 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide', w)}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {recurring.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-hmuted">No recurring templates yet. Create one for monthly salary, rent, utilities, etc.</td></tr>
                  ) : recurring.map(rec => (
                    <tr key={rec.id} className={cn('border-t border-hborder hover:bg-hbg/40', !rec.is_active && 'opacity-50')}>
                      <td className="px-3 py-2 font-medium text-htext truncate" title={rec.name}>{rec.name}</td>
                      <td className="px-3 py-2 text-xs text-hmuted truncate">{rec.description}</td>
                      <td className="px-3 py-2 text-xs text-hmuted capitalize truncate">{rec.frequency}</td>
                      <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{formatDate(rec.next_due_date)}</td>
                      <td className="px-3 py-2">
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', rec.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                          {rec.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
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
        {tab === 'periods' && (() => {
          const allMonths = Array.from({ length: 24 }, (_, i) => {
            const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
            return { year: d.getFullYear(), month: d.getMonth() + 1 }
          })
          const columns = [allMonths.slice(0, 12), allMonths.slice(12, 24)]
          const renderPeriodsTable = (months: { year: number; month: number }[], key: string) => (
            <div key={key} className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <thead><tr className="bg-hsurface2">
                  {([['Period','w-1/3'],['Status','w-1/4'],['Closed At','w-1/4'],['Action','w-1/6']] as const).map(([h, w]) => (
                    <th key={h} className={cn('px-3 py-2.5 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide', w)}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {months.map(({ year, month }) => {
                    const period = periods.find(p => p.year === year && p.month === month)
                    const isClosed = period?.status === 'closed'
                    return (
                      <tr key={`${year}-${month}`} className={cn('border-t border-hborder', isClosed ? 'bg-gray-50/60' : 'hover:bg-hbg/40')}>
                        <td className="px-3 py-2 font-medium text-htext whitespace-nowrap truncate">{MONTH_NAMES[month - 1]} {year}</td>
                        <td className="px-3 py-2">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', isClosed ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700')}>
                            {isClosed ? '🔒 Closed' : '🔓 Open'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{period?.closed_at ? formatDate(period.closed_at) : '—'}</td>
                        <td className="px-3 py-2">
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
          )
          return (
            <div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
                <strong>Period Close:</strong> Closing a period blocks new journal entries dated in that month. Reopen to make corrections. Year-end close entries (transferring P&L to Retained Earnings) should be posted manually as a closing-type journal entry.
              </div>
              <div className="grid grid-cols-2 gap-4">
                {columns.map((months, i) => renderPeriodsTable(months, `col-${i}`))}
              </div>
            </div>
          )
        })()}

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
                    <table className="w-full text-sm table-fixed">
                      <thead><tr className="bg-hsurface2/50">
                        {([['Code', 'w-[12%]'], ['Name', 'w-[40%]'], ['Category', 'w-[24%]'], ['Status', 'w-[12%]'], ['Actions', 'w-[12%]']] as const).map(([h, w]) => (
                          <th key={h} className={cn('px-3 py-2 text-left text-[10px] font-semibold text-hmuted uppercase tracking-wide', w)}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {group.map(acct => (
                          <tr key={acct.id} className={cn('border-t border-hborder', !acct.is_active && 'opacity-50')}>
                            <td className="px-3 py-2 font-mono text-xs font-semibold text-navy whitespace-nowrap truncate">{acct.code}</td>
                            <td className="px-3 py-2 font-medium text-htext truncate" title={acct.name}>{acct.name}</td>
                            <td className="px-3 py-2 text-xs text-hmuted capitalize whitespace-nowrap truncate">{acct.category.replace(/_/g, ' ')}</td>
                            <td className="px-3 py-2">
                              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', acct.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                                {acct.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
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
        {tab === 'petty' && (() => {
          const pcTotalIn  = petty.filter(t => t.transaction_type === 'in').reduce((s, t) => s + Number(t.amount), 0)
          const pcTotalOut = petty.filter(t => t.transaction_type === 'out').reduce((s, t) => s + Number(t.amount), 0)
          const pcLinked   = petty.filter(t => (t as any).reservation).length
          return (
          <div>
            {/* ── Stats row ── */}
            <div className="grid grid-cols-4 gap-4 mb-5">
              <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl bg-gold" />
                <p className="text-[11px] text-hmuted uppercase tracking-wide font-semibold pl-2">Balance</p>
                <p className={cn('font-serif text-3xl mt-1 pl-2', pettyCashBalance < 0 ? 'text-red-600' : 'text-dark-navy')}>
                  {formatCurrency(pettyCashBalance)}
                </p>
                <p className="text-[10px] text-hmuted pl-2 mt-1">{(() => { const a = accounts.find(x => x.code === '1011') ?? accounts.find(x => x.code === '1010'); return a ? `${a.code} — ${a.name}` : '1011 — Petty Cash' })()}</p>
              </div>
              <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl bg-green-400" />
                <p className="text-[11px] text-hmuted uppercase tracking-wide font-semibold pl-2">Total In</p>
                <p className="font-serif text-2xl text-green-700 mt-1 pl-2">+{formatCurrency(pcTotalIn)}</p>
                <p className="text-[10px] text-hmuted pl-2 mt-1">Replenishments</p>
              </div>
              <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl bg-red-400" />
                <p className="text-[11px] text-hmuted uppercase tracking-wide font-semibold pl-2">Total Out</p>
                <p className="font-serif text-2xl text-red-600 mt-1 pl-2">-{formatCurrency(pcTotalOut)}</p>
                <p className="text-[10px] text-hmuted pl-2 mt-1">Expenses</p>
              </div>
              <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl bg-blue-400" />
                <p className="text-[11px] text-hmuted uppercase tracking-wide font-semibold pl-2">Linked</p>
                <p className="font-serif text-2xl text-dark-navy mt-1 pl-2">{pcLinked}</p>
                <p className="text-[10px] text-hmuted pl-2 mt-1">of {petty.length} tagged to reservation</p>
              </div>
            </div>

            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1 bg-hsurface2 rounded-xl p-1">
                {(['all', 'in', 'out'] as const).map(f => (
                  <button key={f} onClick={() => setPcFilter(f)}
                    className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                      pcFilter === f ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted hover:text-htext'
                    )}
                  >{f === 'all' ? 'All' : f === 'in' ? 'Cash In' : 'Cash Out'}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={exportPettyCash}>↓ Export</Button>
                <Button onClick={() => { setPcForm(f => ({ ...f, type: 'out' })); setPcFormOpen(true) }}>+ Record Transaction</Button>
              </div>
            </div>

            {/* ── Table ── */}
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-hsurface2 border-b border-hborder">
                    {([['Date', 'w-[10%]'], ['Description', 'w-[26%]'], ['Category', 'w-[13%]'], ['Type', 'w-[9%]'], ['Amount', 'w-[11%]'], ['Reference', 'w-[11%]'], ['Reservation', 'w-[13%]'], ['', 'w-[7%]']] as const).map(([h, w], i) => (
                      <th key={i} className={cn('px-3 py-2.5 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide', w)}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPetty.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-12 text-center text-hmuted text-sm">No petty cash transactions yet</td></tr>
                  ) : filteredPetty.map(t => {
                    const isIn  = t.transaction_type === 'in'
                    const res   = (t as any).reservation
                    return (
                      <tr key={t.id} className="border-t border-hborder hover:bg-hbg/50 transition-colors">
                        <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{formatDate(t.transaction_date)}</td>
                        <td className="px-3 py-2 text-htext font-medium truncate" title={t.description}>{t.description}</td>
                        <td className="px-3 py-2">
                          <span className="text-xs bg-hsurface2 text-hmuted px-2 py-0.5 rounded-full whitespace-nowrap">{t.category}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap',
                            isIn ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                          )}>
                            {isIn ? '↑' : '↓'} {isIn ? 'In' : 'Out'}
                          </span>
                        </td>
                        <td className={cn('px-3 py-2 font-semibold tabular-nums whitespace-nowrap', isIn ? 'text-green-700' : 'text-red-600')}>
                          {isIn ? '+' : '−'}{formatCurrency(t.amount)}
                        </td>
                        <td className="px-3 py-2 text-xs text-hmuted font-mono whitespace-nowrap truncate">{t.reference || '—'}</td>
                        <td className="px-3 py-2 text-xs">
                          {res ? (
                            <div>
                              <span className="text-blue-600 font-medium truncate block">{res.reservation_number}</span>
                              {res.guest?.full_name && (
                                <p className="text-hmuted mt-0.5 truncate">{res.guest.full_name}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-hmuted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditPc(t)}
                              className="p-1.5 rounded-lg text-hmuted hover:text-navy hover:bg-hsurface2 transition-colors"
                              title="Edit"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => deletePettyCash(t)}
                              className="p-1.5 rounded-lg text-hmuted hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
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
        )})()}
      </div>

      {/* ── Correct Entry Date ── */}
      <Modal open={correctDateOpen} onClose={() => setCorrectDateOpen(false)} title={`Correct Date — ${correctDateEntry?.entry_number ?? ''}`} size="sm">
        <div className="space-y-3">
          <p className="text-sm text-htext">
            For historical data entry — moves when this transaction actually happened, not the amounts or accounts. Currently dated <strong>{correctDateEntry?.entry_date}</strong>.
          </p>
          <div>
            <label className="block text-xs text-hmuted mb-1">Correct Date</label>
            <input type="date" value={correctDateValue} onChange={e => setCorrectDateValue(e.target.value)} className={input} />
          </div>
          {correctDateSiblings.length > 0 && (
            <div className="border-t border-hborder pt-3 space-y-2">
              <p className="text-[10px] font-semibold text-hmuted uppercase tracking-wide">
                Also linked to {correctDateEntry?.reference} — move these together too?
              </p>
              {correctDateSiblings.map(s => (
                <label key={s.id} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={correctDateSelected.has(s.id)}
                    onChange={() => toggleCorrectDateSibling(s.id)}
                    className="w-4 h-4 mt-0.5 rounded border-hborder text-navy focus:ring-navy"
                  />
                  <span className="text-sm text-htext">
                    {s.entry_number} — {(s.reference_type ?? '').replace(/_/g, ' ')}
                    <span className="block text-xs text-hmuted">{s.description}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="text-[10px] text-hmuted border-t border-hborder pt-3">
            {correctDateEntry?.reference_type && ['invoice', 'deposit_applied', 'invoice_correction'].includes(correctDateEntry.reference_type)
              ? `Also updates ${correctDateEntry.reference}'s Paid At and payment record date(s), so nothing goes out of sync with the ledger.`
              : correctDateEntry?.reference_type && ['deposit', 'deposit_refund'].includes(correctDateEntry.reference_type)
                ? `Also updates the deposit receipt date for ${correctDateEntry.reference}, so nothing goes out of sync with the ledger.`
                : 'Only this entry\'s date will change.'}
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setCorrectDateOpen(false)}>Cancel</Button>
            <Button onClick={saveCorrectDate} disabled={correctDateSaving || !correctDateValue}>{correctDateSaving ? 'Saving…' : 'Save Date'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Correct COA ── */}
      <Modal open={correctCoaOpen} onClose={() => setCorrectCoaOpen(false)} title={`Correct Account — ${correctCoaEntry?.entry_number ?? ''}`} size="sm">
        <div className="space-y-3">
          <p className="text-sm text-htext">
            Reassign a line to a different account. Only accounts of the same type are offered, so debit/credit and reporting stay valid.
          </p>
          <div className="space-y-2.5">
            {correctCoaLines.map(l => {
              const sameTypeAccounts = accounts.filter(a => a.is_active && a.type === l.account?.type)
              return (
                <div key={l.id} className="border border-hborder rounded-lg p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-hmuted">
                    <span>{l.description || '—'}</span>
                    <span className="font-semibold tabular-nums">{Number(l.debit) > 0 ? `Dr ${formatCurrency(l.debit)}` : `Cr ${formatCurrency(l.credit)}`}</span>
                  </div>
                  <select
                    value={l.newAccountId}
                    onChange={ev => setCorrectCoaLineAccount(l.id, ev.target.value)}
                    className={input}
                  >
                    {sameTypeAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-hmuted border-t border-hborder pt-3">
            {correctCoaEntry?.reference_type && ['invoice', 'deposit_applied', 'invoice_correction'].includes(correctCoaEntry.reference_type)
              ? `Revenue-account changes also update ${correctCoaEntry.reference}'s line item(s), so future payments stay consistent.`
              : 'Only this entry\'s line account(s) will change.'}
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setCorrectCoaOpen(false)}>Cancel</Button>
            <Button onClick={saveCorrectCoa} disabled={correctCoaSaving}>{correctCoaSaving ? 'Saving…' : 'Save Account'}</Button>
          </div>
        </div>
      </Modal>

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
              <select value={coaForm.type} onChange={e => { const t = e.target.value as AccountType; setCoaForm(f => ({ ...f, type: t, category: COA_CATEGORIES[t][0].value })) }} className={input}>
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
            <select value={coaForm.category} onChange={e => setCoaForm(f => ({ ...f, category: e.target.value }))} className={input}>
              {COA_CATEGORIES[coaForm.type].map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
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
      <Modal open={jeFormOpen} onClose={() => setJeFormOpen(false)} title={editJeId ? 'Edit Journal Entry' : 'New Journal Entry'} size="xl">
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
                <span className="col-span-6">Account</span><span className="col-span-2">Description</span>
                <span className="col-span-2 text-right">Debit ($)</span><span className="col-span-2 text-right">Credit ($)</span>
              </div>
              {jeLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select value={line.account_id} onChange={e => updateJeLine(idx, 'account_id', e.target.value)} className="col-span-6 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg">
                    <option value="">Select account…</option>
                    {ACCOUNT_TYPES.map(type => (
                      <optgroup key={type} label={capitalize(type)}>
                        {accountsByType[type].filter(a => a.is_active).map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <input value={line.description} onChange={e => updateJeLine(idx, 'description', e.target.value)} placeholder="Note" className="col-span-2 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg" />
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
          <div>
            <label className="block text-xs text-hmuted mb-1">Vendor</label>
            <select value={billForm.vendor_id} onChange={e => setBillForm(f => ({ ...f, vendor_id: e.target.value }))} className={input}>
              <option value="">No vendor / one-off</option>
              {vendors.filter(v => v.is_active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          {/* Expense lines — a bill can split across multiple expense accounts */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-hmuted">Expense Accounts *</label>
              <button type="button" onClick={addBillLine} className="text-[11px] font-medium text-navy border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors">+ Add line</button>
            </div>
            <div className="space-y-2">
              {billForm.lines.map((ln, idx) => (
                <div key={idx} className="border border-hborder rounded-lg p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <select value={ln.expense_account_id} onChange={e => updateBillLine(idx, 'expense_account_id', e.target.value)} className={cn(input, 'flex-1')}>
                      <option value="">Select account…</option>
                      {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                    <input type="number" min={0} step={0.01} value={ln.amount} onChange={e => updateBillLine(idx, 'amount', e.target.value)} placeholder="0.00" className={cn(input, 'w-28')} />
                    <button
                      type="button"
                      onClick={() => removeBillLine(idx)}
                      disabled={billForm.lines.length === 1}
                      className="flex-none w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      title="Remove line"
                    >×</button>
                  </div>
                  <input
                    value={ln.description}
                    onChange={e => updateBillLine(idx, 'description', e.target.value)}
                    placeholder="Memo for this line (optional) — defaults to bill description"
                    className={cn(input, 'text-xs')}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Subtotal ($)</label>
              <div className={cn(input, 'bg-hsurface2 flex items-center')}>{formatCurrency(billForm.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0))}</div>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Tax / VAT ($)</label>
              <input type="number" min={0} step={0.01} value={billForm.tax_amount} onChange={e => setBillForm(f => ({ ...f, tax_amount: e.target.value }))} placeholder="0.00" className={input} />
            </div>
          </div>
          {(() => {
            const subtotal = billForm.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
            return subtotal > 0 ? (
              <div className="bg-hsurface2 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="text-hmuted">Total</span>
                <span className="font-bold text-dark-navy">{formatCurrency(subtotal + Number(billForm.tax_amount || 0))}</span>
              </div>
            ) : null
          })()}
          <div>
            <label className="block text-xs text-hmuted mb-1">Pay From Account</label>
            <select value={billForm.paid_from} onChange={e => setBillForm(f => ({ ...f, paid_from: e.target.value }))} className={input}>
              <option value="">Accounts Payable — record as unpaid (pay later)</option>
              {accounts
                .filter(a => a.is_active && ((a.category ?? '').toLowerCase() === 'bank' || a.code === '2400'))
                .sort((a, b) => a.code.localeCompare(b.code))
                .map(a => <option key={a.id} value={a.code}>Pay now from {a.code} — {a.name.trim()}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Notes</label>
            <input value={billForm.notes} onChange={e => setBillForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={input} />
          </div>
          {(() => {
            const valid = billForm.lines.filter(l => l.expense_account_id && Number(l.amount) > 0)
            if (valid.length === 0) return null
            const drs = valid.map(l => accounts.find(a => a.id === l.expense_account_id)?.code).filter(Boolean).join(', ')
            const credit = billForm.paid_from
              ? (() => { const a = accounts.find(x => x.code === billForm.paid_from); return a ? `${a.code} ${a.name.trim()}` : billForm.paid_from })()
              : '2100 Accounts Payable'
            return (
              <p className="text-[10px] text-hmuted bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                Auto journal: DR {drs}{Number(billForm.tax_amount) > 0 ? ' (+ tax on first line)' : ''} / CR {credit}
                {billForm.paid_from && <span className="block mt-0.5 text-green-700">✓ Bill will be marked paid immediately.</span>}
              </p>
            )
          })()}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setBillFormOpen(false)}>Cancel</Button>
            <Button onClick={saveBill} disabled={billSaving}>{billSaving ? 'Saving…' : 'Record Bill'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Bill Receipt (printable) ── */}
      {receiptBill && (() => {
        const b: any = receiptBill
        const vendor = b.vendor
        const balance = Number(b.total) - Number(b.amount_paid)
        const lineItems: any[] = Array.isArray(b.line_items) && b.line_items.length > 0
          ? b.line_items
          : [{ account_code: b.expense_account?.code, account_name: b.expense_account?.name, description: b.description, amount: Number(b.subtotal) }]
        const hotelName = hotelSettings?.hotel_name ?? 'OnlyOne Homestay'
        const hotelPhone = hotelSettings?.hotel_phone ?? ''
        const hotelAddress = hotelSettings?.hotel_address ?? ''
        const statusStyle = b.status === 'paid'
          ? { bg: '#e7f5ee', fg: '#1a7a4a', label: 'PAID' }
          : b.status === 'partial'
            ? { bg: '#fef6e7', fg: '#b7791f', label: 'PARTIALLY PAID' }
            : { bg: '#fdecec', fg: '#c0392b', label: 'UNPAID' }

        function printBillReceipt() {
          const content = document.getElementById('bill-receipt-printable')?.innerHTML ?? ''
          const w = window.open('', '_blank', 'width=720,height=960')
          if (!w) return
          w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${window.location.origin}"><title>Bill ${b.bill_number}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1a1a2e; padding: 40px; max-width: 680px; margin: 0 auto; }
            table { width: 100%; border-collapse: collapse; }
            @media print { body { padding: 0; } }
          </style></head><body>${content}</body></html>`)
          w.document.close()
          w.focus()
          setTimeout(() => w.print(), 400)
        }

        return (
          <Modal open={true} onClose={() => { setReceiptBill(null); setReceiptPayments([]) }} title="Bill Receipt" size="lg">
            <div className="flex justify-end gap-2 mb-4 print:hidden">
              <Button variant="ghost" onClick={() => { setReceiptBill(null); setReceiptPayments([]) }}>Close</Button>
              <Button onClick={printBillReceipt}>Print / Save PDF</Button>
            </div>

            <div id="bill-receipt-printable">
              {/* Header */}
              <div style={{ background: '#1a1a2e', borderRadius: '12px 12px 0 0', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={branchLogo(activeBranch?.location)} alt={hotelName} style={{ height: 64, width: 64, objectFit: 'contain', borderRadius: 8, background: 'white', padding: 4 }} />
                  <div>
                    <div style={{ color: '#c89b3c', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>{branchBrandLabel(activeBranch?.location)}</div>
                    {hotelPhone && <div style={{ color: '#a0aec0', fontSize: 12, marginTop: 3 }}>{hotelPhone}</div>}
                    {hotelAddress && <div style={{ color: '#a0aec0', fontSize: 11, marginTop: 2 }}>{hotelAddress}</div>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 3, color: '#a0aec0', fontWeight: 600 }}>Bill</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#c89b3c', letterSpacing: -0.5 }}>{b.bill_number}</div>
                  <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 2 }}>{formatDate(b.bill_date)}</div>
                </div>
              </div>

              {/* Body */}
              <div style={{ border: '1px solid #e8edf3', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '28px 32px' }}>
                {/* Vendor + status/dates */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#9ca3af', marginBottom: 6 }}>Vendor</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{vendor?.name ?? 'One-off / No vendor'}</p>
                    {vendor?.contact_name && <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{vendor.contact_name}</p>}
                    {vendor?.phone && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{vendor.phone}</p>}
                    {vendor?.address && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{vendor.address}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, letterSpacing: 1, padding: '4px 12px', borderRadius: 999, background: statusStyle.bg, color: statusStyle.fg }}>{statusStyle.label}</span>
                    <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }}>Bill Date: <span style={{ color: '#1a1a2e', fontWeight: 600 }}>{formatDate(b.bill_date)}</span></p>
                    {b.due_date && <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Due Date: <span style={{ color: '#1a1a2e', fontWeight: 600 }}>{formatDate(b.due_date)}</span></p>}
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#9ca3af', marginBottom: 4 }}>Description</p>
                  <p style={{ fontSize: 14, color: '#1a1a2e' }}>{b.description}</p>
                </div>

                {/* Expense lines */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1a1a2e' }}>
                      {['Account', 'Memo', 'Amount'].map((h, i) => (
                        <th key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: '#6b7280', fontWeight: 600, padding: '8px 0', textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f0f4f8' }}>
                        <td style={{ padding: '10px 0', fontSize: 13, color: '#374151' }}>{li.account_code ? `${li.account_code} — ${li.account_name ?? ''}` : (li.account_name ?? '—')}</td>
                        <td style={{ padding: '10px 0', fontSize: 13, color: '#6b7280' }}>{li.description ?? ''}</td>
                        <td style={{ padding: '10px 0', fontSize: 13, fontWeight: 600, color: '#1a1a2e', textAlign: 'right' }}>{formatCurrency(Number(li.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div style={{ marginLeft: 'auto', width: 280 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: '#6b7280' }}>
                    <span>Subtotal</span><span>{formatCurrency(Number(b.subtotal))}</span>
                  </div>
                  {Number(b.tax_amount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: '#6b7280' }}>
                      <span>Tax / VAT</span><span>{formatCurrency(Number(b.tax_amount))}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: '#1a1a2e', borderTop: '2px solid #1a1a2e', marginTop: 8, paddingTop: 10 }}>
                    <span>Total</span><span>{formatCurrency(Number(b.total))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0 4px', color: '#6b7280', borderTop: '1px solid #e8edf3', marginTop: 8 }}>
                    <span>Amount Paid</span><span style={{ color: '#1a7a4a', fontWeight: 600 }}>{formatCurrency(Number(b.amount_paid))}</span>
                  </div>
                  {balance > 0.001 ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#c0392b', paddingTop: 4 }}>
                      <span>Balance Due</span><span>{formatCurrency(balance)}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#1a7a4a', paddingTop: 4 }}>
                      <span>Balance Due</span><span>Paid in Full ✓</span>
                    </div>
                  )}
                </div>

                {/* Payments — which account each payment was made from */}
                {receiptPayments.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#9ca3af', marginBottom: 6 }}>Payments</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e8edf3' }}>
                          {['Date', 'Paid From', 'Amount'].map((h, i) => (
                            <th key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#9ca3af', fontWeight: 600, padding: '6px 0', textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {receiptPayments.map((p, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f7f9fc' }}>
                            <td style={{ padding: '8px 0', fontSize: 12, color: '#6b7280' }}>{formatDate(p.payment_date)}</td>
                            <td style={{ padding: '8px 0', fontSize: 12, color: '#1a1a2e', fontWeight: 600 }}>{p.payment_method}{p.notes ? <span style={{ color: '#9ca3af', fontWeight: 400 }}> · {p.notes}</span> : null}</td>
                            <td style={{ padding: '8px 0', fontSize: 12, color: '#1a7a4a', fontWeight: 600, textAlign: 'right' }}>{formatCurrency(Number(p.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Footer */}
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px dashed #e8edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <p style={{ fontSize: 11, color: '#9ca3af' }}>Recorded {formatDate(b.created_at ?? b.bill_date)}{b.notes ? ` · ${b.notes}` : ''}</p>
                  <p style={{ fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>Accounts Payable · {branchBrandLabel(activeBranch?.location)}</p>
                </div>
              </div>
            </div>
          </Modal>
        )
      })()}

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
                <input type="number" min={0} step={0.01} max={Number(selectedBill.total) - Number(selectedBill.amount_paid)} value={billPayForm.amount} onChange={e => setBillPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={input} />
                {Number(billPayForm.amount) > (Number(selectedBill.total) - Number(selectedBill.amount_paid)) + 0.001 && (
                  <p className="text-[10px] text-red-600 mt-1">Exceeds balance of {formatCurrency(Number(selectedBill.total) - Number(selectedBill.amount_paid))}</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Pay From Account</label>
              <select value={billPayForm.account_code} onChange={e => setBillPayForm(f => ({ ...f, account_code: e.target.value }))} className={input}>
                {(() => {
                  // Where the money comes from to settle the bill: the branch's
                  // cash/bank accounts (category "Bank" — Cash, Petty Cash, Bank)
                  // plus 2400 Loan From ITC. Not guest payment methods.
                  const opts = accounts
                    .filter(a => a.is_active && ((a.category ?? '').toLowerCase() === 'bank' || a.code === '2400'))
                    .sort((a, b) => a.code.localeCompare(b.code))
                  return opts.length > 0
                    ? opts.map(a => <option key={a.id} value={a.code}>{a.code} — {a.name.trim()}</option>)
                    : <option value="1010">1010 — Cash</option>
                })()}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Reference</label>
              <input value={billPayForm.reference} onChange={e => setBillPayForm(f => ({ ...f, reference: e.target.value }))} placeholder="Transfer ref, receipt #…" className={input} />
            </div>
            <p className="text-[10px] text-hmuted bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              Auto journal: DR 2100 Accounts Payable / CR {(() => {
                const acct = accounts.find(a => a.code === billPayForm.account_code)
                return acct ? `${acct.code} ${acct.name.trim()}` : billPayForm.account_code
              })()}
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="ghost" onClick={() => { setBillPayOpen(false); setSelectedBill(null) }}>Cancel</Button>
              <Button onClick={saveBillPayment} disabled={billSaving || Number(billPayForm.amount) <= 0 || Number(billPayForm.amount) > (Number(selectedBill.total) - Number(selectedBill.amount_paid)) + 0.001}>{billSaving ? 'Saving…' : 'Record Payment'}</Button>
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
      <Modal open={recurFormOpen} onClose={() => setRecurFormOpen(false)} title={editRecurId ? 'Edit Template' : 'New Recurring Template'} size="xl">
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
                <span className="col-span-6">Account</span><span className="col-span-2">Note</span>
                <span className="col-span-2 text-right">Debit ($)</span><span className="col-span-2 text-right">Credit ($)</span>
              </div>
              {recurLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select value={line.account_id} onChange={e => setRecurLines(prev => prev.map((l, i) => i === idx ? { ...l, account_id: e.target.value } : l))}
                    className="col-span-6 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg">
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
                    placeholder="Note" className="col-span-2 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg" />
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
              <table className="w-full text-sm table-fixed">
                <thead><tr className="bg-hsurface2">
                  {([['Customer',''],['Current','w-24'],['1–30 days','w-24'],['31–60 days','w-24'],['60+ days','w-24'],['Total','w-28']] as const).map(([h, w]) => (
                    <th key={h} className={cn('px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide', h === 'Customer' ? 'text-left' : 'text-right', w)}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.map(([name, v]) => {
                    const total = v.current + v.d30 + v.d60 + v.d60p
                    return (
                      <tr key={name} className="border-t border-hborder hover:bg-hbg/40">
                        <td className="px-3 py-2 text-htext font-medium truncate" title={name}>{name}</td>
                        <td className="px-3 py-2 text-right text-green-700 whitespace-nowrap">{v.current > 0 ? formatCurrency(v.current) : '—'}</td>
                        <td className="px-3 py-2 text-right text-yellow-700 whitespace-nowrap">{v.d30 > 0 ? formatCurrency(v.d30) : '—'}</td>
                        <td className="px-3 py-2 text-right text-orange-600 whitespace-nowrap">{v.d60 > 0 ? formatCurrency(v.d60) : '—'}</td>
                        <td className="px-3 py-2 text-right text-red-600 whitespace-nowrap">{v.d60p > 0 ? formatCurrency(v.d60p) : '—'}</td>
                        <td className="px-3 py-2 text-right font-bold text-dark-navy whitespace-nowrap">{formatCurrency(total)}</td>
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
      <Modal open={pcFormOpen} onClose={() => { setPcFormOpen(false); setPcEditId(null); setPcEditJeId(null) }} title={pcEditId ? 'Edit Transaction' : 'Record Petty Cash'} size="sm">
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
                <option value="">{(() => { const a = accounts.find(x => x.code === '5800'); return a ? `Auto (${a.code} ${a.name})` : 'Auto (default expense account)' })()}</option>
                {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
              <p className="text-[10px] text-hmuted mt-1">Creates DR Expense / CR {(() => { const a = accounts.find(x => x.code === '1011') ?? accounts.find(x => x.code === '1010'); return a ? `${a.code} ${a.name}` : '1011 Petty Cash' })()}</p>
            </div>
          )}
          {pcForm.type === 'out' && (
            <div className="border-t border-hborder pt-3 space-y-2">
              <p className="text-[10px] font-semibold text-hmuted uppercase tracking-wide">Link to Reservation (optional)</p>
              <select
                value={pcForm.reservation_id}
                onChange={e => setPcForm(f => ({ ...f, reservation_id: e.target.value, reservation_line_item_id: '' }))}
                className={input}
              >
                <option value="">— No reservation link —</option>
                {pcReservations.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.reservation_number} — {(r.guest as any)?.full_name ?? 'Guest'} ({r.check_in_date})
                  </option>
                ))}
              </select>
              {pcForm.reservation_id && (() => {
                const res = pcReservations.find(r => r.id === pcForm.reservation_id)
                const items = ((res?.line_items ?? []) as any[]).filter((i: any) => i.label)
                return items.length > 0 ? (
                  <select
                    value={pcForm.reservation_line_item_id}
                    onChange={e => setPcForm(f => ({ ...f, reservation_line_item_id: e.target.value }))}
                    className={input}
                  >
                    <option value="">— Reservation-level (no specific add-on) —</option>
                    {items.map((i: any) => (
                      <option key={i.id} value={i.id}>{i.label}</option>
                    ))}
                  </select>
                ) : null
              })()}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => { setPcFormOpen(false); setPcEditId(null); setPcEditJeId(null) }}>Cancel</Button>
            <Button onClick={savePettyCash} disabled={pcSaving}>{pcSaving ? 'Saving…' : pcEditId ? 'Save Changes' : 'Record Transaction'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
