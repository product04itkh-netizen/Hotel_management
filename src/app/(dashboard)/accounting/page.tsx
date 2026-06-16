'use client'
import { useEffect, useState, useCallback } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, generateJournalEntryNumber, capitalize } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import { cn } from '@/lib/utils'
import type { ChartOfAccount, AccountType, JournalEntry, PettyCashTransaction } from '@/types'

// ── Constants ─────────────────────────────────────────────────
type Tab = 'overview' | 'journal' | 'ledger' | 'coa' | 'petty'

const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense']
const PETTY_CATEGORIES = [
  'Cleaning Supplies', 'Maintenance Materials', 'Staff Refreshments',
  'Office Supplies', 'Utilities', 'Transportation', 'Food & Beverages',
  'Garden & Outdoor', 'Printing & Stationery', 'Miscellaneous',
]
const TYPE_COLOR: Record<AccountType, string> = {
  asset:     'bg-green-100 text-green-700',
  liability: 'bg-red-100 text-red-700',
  equity:    'bg-purple-100 text-purple-700',
  revenue:   'bg-blue-100 text-blue-700',
  expense:   'bg-orange-100 text-orange-700',
}

// Normal balance: asset/expense = debit, liability/equity/revenue = credit
function normalBalance(type: AccountType): 'debit' | 'credit' {
  return ['asset', 'expense'].includes(type) ? 'debit' : 'credit'
}

const emptyCoaForm = { code: '', name: '', type: 'expense' as AccountType, category: 'operating_expense' }
const emptyJeLine = () => ({ account_id: '', description: '', debit: '' as number | string, credit: '' as number | string })

export default function AccountingPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()
  const [tab, setTab] = useState<Tab>('overview')

  // ── Chart of Accounts ──────────────────────────────────────
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([])
  const [coaFormOpen, setCoaFormOpen] = useState(false)
  const [editAccountId, setEditAccountId] = useState<string | null>(null)
  const [coaForm, setCoaForm] = useState({ ...emptyCoaForm })
  const [coaSaving, setCoaSaving] = useState(false)

  // ── Journal Entries ────────────────────────────────────────
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [jeFormOpen, setJeFormOpen] = useState(false)
  const [jeForm, setJeForm] = useState({ date: '', description: '', reference: '', reference_type: 'manual' })
  const [jeLines, setJeLines] = useState([emptyJeLine(), emptyJeLine()])
  const [jeSaving, setJeSaving] = useState(false)
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [entryLines, setEntryLines] = useState<Record<string, any[]>>({})

  // ── General Ledger ─────────────────────────────────────────
  const [ledgerAccountId, setLedgerAccountId] = useState('')
  const [ledgerFrom, setLedgerFrom] = useState('')
  const [ledgerTo, setLedgerTo] = useState('')
  const [ledgerRows, setLedgerRows] = useState<any[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

  // ── Petty Cash ─────────────────────────────────────────────
  const [petty, setPetty] = useState<PettyCashTransaction[]>([])
  const [pcFormOpen, setPcFormOpen] = useState(false)
  const [pcForm, setPcForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '', category: 'Miscellaneous', amount: '',
    type: 'out' as 'in' | 'out', reference: '', expense_account_id: '',
  })
  const [pcSaving, setPcSaving] = useState(false)
  const [pcFilter, setPcFilter] = useState<'all' | 'in' | 'out'>('all')

  // ── Overview ───────────────────────────────────────────────
  const [overview, setOverview] = useState({
    pettyCashBalance: 0, monthRevenue: 0, monthExpenses: 0, totalEntries: 0,
  })

  useEffect(() => { if (activeBranch) { loadAccounts(); loadEntries(); loadPetty() } }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load functions ─────────────────────────────────────────

  async function loadAccounts() {
    if (!activeBranch) return
    const { data } = await supabase.from('chart_of_accounts')
      .select('*').eq('branch_id', activeBranch.id).order('code')
    setAccounts((data ?? []) as ChartOfAccount[])
  }

  async function loadEntries() {
    if (!activeBranch) return
    const { data } = await supabase.from('journal_entries')
      .select('*').eq('branch_id', activeBranch.id).order('entry_date', { ascending: false }).limit(100)
    setEntries((data ?? []) as JournalEntry[])
    computeOverview(data ?? [])
  }

  async function loadPetty() {
    if (!activeBranch) return
    const { data } = await supabase.from('petty_cash_transactions')
      .select('*').eq('branch_id', activeBranch.id).order('transaction_date', { ascending: false })
    setPetty((data ?? []) as PettyCashTransaction[])
  }

  async function loadEntryLines(entryId: string) {
    if (entryLines[entryId]) return
    const { data } = await supabase.from('journal_entry_lines')
      .select('*, account:chart_of_accounts(code, name, type)').eq('entry_id', entryId).order('debit', { ascending: false })
    setEntryLines(prev => ({ ...prev, [entryId]: data ?? [] }))
  }

  async function loadLedger() {
    if (!ledgerAccountId || !activeBranch) return
    setLedgerLoading(true)
    let q = supabase.from('journal_entry_lines')
      .select('*, entry:journal_entries(entry_number, entry_date, description, reference)')
      .eq('account_id', ledgerAccountId)
      .order('entry_id')
    if (ledgerFrom) q = q.gte('entry.entry_date' as any, ledgerFrom)
    if (ledgerTo)   q = q.lte('entry.entry_date' as any, ledgerTo)

    const { data } = await q
    // Sort by entry_date, compute running balance
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
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    // Petty cash balance
    const { data: pcData } = await supabase.from('petty_cash_transactions')
      .select('amount, transaction_type').eq('branch_id', activeBranch.id)
    const pettyCashBalance = (pcData ?? []).reduce(
      (s: number, t: any) => s + (t.transaction_type === 'in' ? Number(t.amount) : -Number(t.amount)), 0
    )

    // Revenue & expenses from JE this month
    const { data: lines } = await supabase.from('journal_entry_lines')
      .select('debit, credit, account:chart_of_accounts(type, code)')
      .gte('created_at', monthStart + 'T00:00:00')
    const monthRevenue = (lines ?? []).filter((l: any) => l.account?.type === 'revenue').reduce((s: number, l: any) => s + Number(l.credit), 0)
    const monthExpenses = (lines ?? []).filter((l: any) => l.account?.type === 'expense').reduce((s: number, l: any) => s + Number(l.debit), 0)

    setOverview({ pettyCashBalance, monthRevenue, monthExpenses, totalEntries: entryData.length })
  }

  // ── COA CRUD ───────────────────────────────────────────────

  function openAddAccount() {
    setEditAccountId(null)
    setCoaForm({ ...emptyCoaForm })
    setCoaFormOpen(true)
  }

  function openEditAccount(acct: ChartOfAccount) {
    setEditAccountId(acct.id)
    setCoaForm({ code: acct.code, name: acct.name, type: acct.type, category: acct.category })
    setCoaFormOpen(true)
  }

  async function saveAccount() {
    if (!coaForm.code || !coaForm.name) { toast('Code and name required', 'error'); return }
    setCoaSaving(true)
    const payload = { ...coaForm, updated_at: new Date().toISOString() }
    if (editAccountId) {
      const { error } = await supabase.from('chart_of_accounts').update(payload).eq('id', editAccountId)
      if (error) { toast(error.message, 'error'); setCoaSaving(false); return }
      toast('Account updated')
    } else {
      const { error } = await supabase.from('chart_of_accounts').insert({ ...payload, branch_id: activeBranch?.id ?? null })
      if (error) { toast(error.message, 'error'); setCoaSaving(false); return }
      toast('Account added')
    }
    setCoaSaving(false)
    setCoaFormOpen(false)
    loadAccounts()
  }

  async function toggleAccountActive(acct: ChartOfAccount) {
    await supabase.from('chart_of_accounts').update({ is_active: !acct.is_active }).eq('id', acct.id)
    loadAccounts()
  }

  // ── Journal Entry CRUD ─────────────────────────────────────

  function openAddEntry() {
    setJeForm({ date: new Date().toISOString().split('T')[0], description: '', reference: '', reference_type: 'manual' })
    setJeLines([emptyJeLine(), emptyJeLine()])
    setJeFormOpen(true)
  }

  function updateJeLine(idx: number, field: string, value: string | number) {
    setJeLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function addJeLine() {
    setJeLines(prev => [...prev, emptyJeLine()])
  }

  function removeJeLine(idx: number) {
    setJeLines(prev => prev.filter((_, i) => i !== idx))
  }

  const jeTotalDebit  = jeLines.reduce((s, l) => s + Number(l.debit  || 0), 0)
  const jeTotalCredit = jeLines.reduce((s, l) => s + Number(l.credit || 0), 0)
  const jeBalanced    = Math.abs(jeTotalDebit - jeTotalCredit) < 0.001

  async function saveJournalEntry() {
    if (!jeForm.description) { toast('Description required', 'error'); return }
    if (!jeBalanced) { toast('Debits must equal credits', 'error'); return }
    const validLines = jeLines.filter(l => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
    if (validLines.length < 2) { toast('At least 2 lines required', 'error'); return }

    setJeSaving(true)
    const { data: je, error: jeErr } = await supabase.from('journal_entries').insert({
      entry_number: generateJournalEntryNumber(),
      entry_date: jeForm.date,
      reference: jeForm.reference || null,
      reference_type: jeForm.reference_type || null,
      description: jeForm.description,
      branch_id: activeBranch?.id ?? null,
    }).select().single()

    if (jeErr || !je) { toast(jeErr?.message ?? 'Error', 'error'); setJeSaving(false); return }

    const { error: lineErr } = await supabase.from('journal_entry_lines').insert(
      validLines.map(l => ({
        entry_id: je.id,
        account_id: l.account_id,
        description: l.description || null,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
      }))
    )
    if (lineErr) { toast(lineErr.message, 'error'); setJeSaving(false); return }

    toast('Journal entry posted')
    setJeSaving(false)
    setJeFormOpen(false)
    loadEntries()
  }

  // ── Petty Cash ─────────────────────────────────────────────

  async function savePettyCash() {
    if (!pcForm.description || !pcForm.amount || Number(pcForm.amount) <= 0) {
      toast('Description and amount required', 'error'); return
    }
    setPcSaving(true)

    // Create journal entry for double-entry
    let jeId: string | null = null
    try {
      const cashOnHandAcct = accounts.find(a => a.code === '1010')
      const cashAtBankAcct = accounts.find(a => a.code === '1020')
      const expenseAcct = pcForm.expense_account_id
        ? accounts.find(a => a.id === pcForm.expense_account_id)
        : accounts.find(a => a.code === '5800')

      if (cashOnHandAcct && (expenseAcct || cashAtBankAcct)) {
        let lines: any[] = []
        if (pcForm.type === 'out' && expenseAcct) {
          // DR: Expense, CR: Cash on Hand
          lines = [
            { account_id: expenseAcct.id, description: pcForm.description, debit: Number(pcForm.amount), credit: 0 },
            { account_id: cashOnHandAcct.id, description: pcForm.description, debit: 0, credit: Number(pcForm.amount) },
          ]
        } else if (pcForm.type === 'in' && cashAtBankAcct) {
          // DR: Cash on Hand, CR: Cash at Bank (replenishment)
          lines = [
            { account_id: cashOnHandAcct.id, description: 'Petty cash replenishment', debit: Number(pcForm.amount), credit: 0 },
            { account_id: cashAtBankAcct.id, description: 'Transfer to petty cash', debit: 0, credit: Number(pcForm.amount) },
          ]
        }

        if (lines.length > 0) {
          const { data: je } = await supabase.from('journal_entries').insert({
            entry_number: generateJournalEntryNumber(),
            entry_date: pcForm.date,
            reference: pcForm.reference || null,
            reference_type: 'petty_cash',
            description: `Petty cash ${pcForm.type} — ${pcForm.description}`,
            branch_id: activeBranch?.id ?? null,
          }).select().single()

          if (je) {
            jeId = je.id
            await supabase.from('journal_entry_lines').insert(lines.map(l => ({ ...l, entry_id: je.id })))
          }
        }
      }
    } catch { /* skip JE if COA not ready */ }

    const { error } = await supabase.from('petty_cash_transactions').insert({
      transaction_date: pcForm.date,
      description: pcForm.description,
      category: pcForm.category,
      amount: Number(pcForm.amount),
      transaction_type: pcForm.type,
      reference: pcForm.reference || null,
      journal_entry_id: jeId,
      branch_id: activeBranch?.id ?? null,
    })

    if (error) { toast(error.message, 'error'); setPcSaving(false); return }
    toast(`Petty cash ${pcForm.type} recorded`)
    setPcSaving(false)
    setPcFormOpen(false)
    setPcForm({ date: new Date().toISOString().split('T')[0], description: '', category: 'Miscellaneous', amount: '', type: 'out', reference: '', expense_account_id: '' })
    loadPetty()
    loadEntries()
  }

  // ── Derived ────────────────────────────────────────────────

  const pettyCashBalance = petty.reduce(
    (s, t) => s + (t.transaction_type === 'in' ? Number(t.amount) : -Number(t.amount)), 0
  )
  const filteredPetty = pcFilter === 'all' ? petty : petty.filter(t => t.transaction_type === pcFilter)
  const accountsByType = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = accounts.filter(a => a.type === type)
    return acc
  }, {} as Record<AccountType, ChartOfAccount[]>)
  const expenseAccounts = accounts.filter(a => a.type === 'expense' && a.is_active)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'journal',  label: 'Journal Entries' },
    { key: 'ledger',   label: 'General Ledger' },
    { key: 'coa',      label: 'Chart of Accounts' },
    { key: 'petty',    label: 'Petty Cash' },
  ]

  return (
    <>
      <TopBar title="Accounting" subtitle={`Double-entry bookkeeping — ${activeBranch?.location ?? ''}`} />
      <div className="p-8 flex-1 section-enter">

        {/* Tab bar */}
        <div className="flex gap-1 bg-hsurface2 rounded-xl p-1 mb-6 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                tab === t.key ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted hover:text-htext'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ OVERVIEW ══════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Petty Cash Balance', value: formatCurrency(pettyCashBalance), color: '#C89B3C', sub: 'Cash on Hand' },
                { label: 'Revenue This Month', value: formatCurrency(overview.monthRevenue), color: '#1A7A4A', sub: 'From GL entries' },
                { label: 'Expenses This Month', value: formatCurrency(overview.monthExpenses), color: '#B83232', sub: 'From GL entries' },
                { label: 'Net Income', value: formatCurrency(overview.monthRevenue - overview.monthExpenses), color: '#004AAD', sub: `${overview.totalEntries} entries total` },
              ].map(s => (
                <div key={s.label} className="bg-white border border-hborder rounded-2xl p-4 shadow-card relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: s.color }} />
                  <p className="text-[11px] text-hmuted uppercase tracking-wide pl-2">{s.label}</p>
                  <p className="font-serif text-2xl text-dark-navy mt-1 pl-2" style={{ color: s.label === 'Net Income' && overview.monthRevenue < overview.monthExpenses ? '#B83232' : undefined }}>
                    {s.value}
                  </p>
                  <p className="text-[10px] text-hmuted pl-2 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Recent Journal Entries */}
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-hborder flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-[17px] text-dark-navy">Recent Journal Entries</h3>
                  <p className="text-xs text-hmuted">Latest 10 posted entries</p>
                </div>
                <Button size="sm" onClick={() => setTab('journal')}>View All</Button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-hsurface2">
                    {['Entry #', 'Date', 'Description', 'Reference', 'Type'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.slice(0, 10).map(e => (
                    <tr key={e.id} className="border-t border-hborder hover:bg-hbg/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-hmuted">{e.entry_number}</td>
                      <td className="px-4 py-2.5 text-hmuted text-xs">{formatDate(e.entry_date)}</td>
                      <td className="px-4 py-2.5 text-htext">{e.description}</td>
                      <td className="px-4 py-2.5 text-xs text-hmuted font-mono">{e.reference ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="bg-hsurface2 text-hmuted text-[10px] px-2 py-0.5 rounded-full capitalize">
                          {(e.reference_type ?? 'manual').replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-hmuted">No entries yet. Entries are created automatically when payments are recorded.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ JOURNAL ENTRIES ═══════════════════════════════════════ */}
        {tab === 'journal' && (
          <div>
            <div className="flex justify-end mb-4">
              <Button onClick={openAddEntry}>+ New Entry</Button>
            </div>
            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-hsurface2">
                    {['', 'Entry #', 'Date', 'Description', 'Reference', 'Type', 'Posted'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-10 text-center text-hmuted">No journal entries. Entries auto-post when invoices are paid.</td></tr>
                  ) : entries.map(e => (
                    <>
                      <tr
                        key={e.id}
                        className="border-t border-hborder hover:bg-hbg/40 cursor-pointer"
                        onClick={async () => {
                          if (expandedEntryId === e.id) { setExpandedEntryId(null); return }
                          setExpandedEntryId(e.id)
                          await loadEntryLines(e.id)
                        }}
                      >
                        <td className="px-3 py-2.5 text-hmuted">
                          <span className="text-xs">{expandedEntryId === e.id ? '▾' : '▸'}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-hmuted">{e.entry_number}</td>
                        <td className="px-4 py-2.5 text-hmuted text-xs whitespace-nowrap">{formatDate(e.entry_date)}</td>
                        <td className="px-4 py-2.5 text-htext">{e.description}</td>
                        <td className="px-4 py-2.5 text-xs text-hmuted font-mono">{e.reference ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className="bg-hsurface2 text-hmuted text-[10px] px-2 py-0.5 rounded-full capitalize">
                            {(e.reference_type ?? 'manual').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-hmuted">{formatDate(e.created_at)}</td>
                      </tr>
                      {expandedEntryId === e.id && entryLines[e.id] && (
                        <tr key={`${e.id}-lines`} className="bg-hbg/50">
                          <td colSpan={7} className="px-8 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr>
                                  <th className="text-left text-hmuted pb-1.5 font-semibold">Account</th>
                                  <th className="text-left text-hmuted pb-1.5 font-semibold">Description</th>
                                  <th className="text-right text-hmuted pb-1.5 font-semibold">Debit</th>
                                  <th className="text-right text-hmuted pb-1.5 font-semibold">Credit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entryLines[e.id].map((l: any) => (
                                  <tr key={l.id} className="border-t border-hborder/40">
                                    <td className="py-1.5 text-navy font-mono">
                                      {l.account?.code} — {l.account?.name}
                                    </td>
                                    <td className="py-1.5 text-hmuted">{l.description ?? ''}</td>
                                    <td className="py-1.5 text-right font-medium text-dark-navy">
                                      {Number(l.debit) > 0 ? formatCurrency(l.debit) : ''}
                                    </td>
                                    <td className="py-1.5 text-right font-medium text-dark-navy">
                                      {Number(l.credit) > 0 ? formatCurrency(l.credit) : ''}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-hborder">
                                  <td colSpan={2} className="py-1.5 font-semibold text-hmuted">Totals</td>
                                  <td className="py-1.5 text-right font-bold text-dark-navy">
                                    {formatCurrency(entryLines[e.id].reduce((s: number, l: any) => s + Number(l.debit), 0))}
                                  </td>
                                  <td className="py-1.5 text-right font-bold text-dark-navy">
                                    {formatCurrency(entryLines[e.id].reduce((s: number, l: any) => s + Number(l.credit), 0))}
                                  </td>
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
            {/* Filters */}
            <div className="flex items-end gap-3 mb-5 bg-white border border-hborder rounded-2xl p-4 shadow-card">
              <div className="flex-1">
                <label className="block text-xs text-hmuted mb-1">Account</label>
                <select
                  value={ledgerAccountId}
                  onChange={e => setLedgerAccountId(e.target.value)}
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-white"
                >
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
                <input
                  type="date" value={ledgerFrom}
                  onChange={e => setLedgerFrom(e.target.value)}
                  className="border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy"
                />
              </div>
              <div>
                <label className="block text-xs text-hmuted mb-1">To</label>
                <input
                  type="date" value={ledgerTo}
                  onChange={e => setLedgerTo(e.target.value)}
                  className="border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy"
                />
              </div>
              <Button onClick={loadLedger} disabled={!ledgerAccountId}>Load Ledger</Button>
            </div>

            {/* Ledger table */}
            {ledgerLoading ? (
              <p className="text-center text-hmuted py-10">Loading…</p>
            ) : ledgerAccountId && ledgerRows.length === 0 ? (
              <p className="text-center text-hmuted py-10">No transactions for this account in the selected period.</p>
            ) : ledgerRows.length > 0 && (() => {
              const acct = accounts.find(a => a.id === ledgerAccountId)!
              const totalDebit  = ledgerRows.reduce((s, r) => s + Number(r.debit), 0)
              const totalCredit = ledgerRows.reduce((s, r) => s + Number(r.credit), 0)
              return (
                <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-hborder">
                    <h3 className="font-serif text-[17px] text-dark-navy">{acct.code} — {acct.name}</h3>
                    <p className="text-xs text-hmuted capitalize">{acct.type} · Normal balance: {normalBalance(acct.type)}</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-hsurface2">
                        {['Date', 'Entry #', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerRows.map((r: any, i) => (
                        <tr key={r.id} className={cn('border-t border-hborder', i % 2 === 1 ? 'bg-hbg/30' : '')}>
                          <td className="px-4 py-2.5 text-xs text-hmuted whitespace-nowrap">{formatDate(r.entry.entry_date)}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-hmuted">{r.entry.entry_number}</td>
                          <td className="px-4 py-2.5 text-htext">{r.entry.description}</td>
                          <td className="px-4 py-2.5 text-xs text-hmuted font-mono">{r.entry.reference ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right font-medium">{Number(r.debit) > 0 ? formatCurrency(r.debit) : ''}</td>
                          <td className="px-4 py-2.5 text-right font-medium">{Number(r.credit) > 0 ? formatCurrency(r.credit) : ''}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-dark-navy whitespace-nowrap">
                            {formatCurrency(r.running_balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-dark-navy text-white">
                        <td colSpan={4} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Totals</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(totalDebit)}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(totalCredit)}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(ledgerRows[ledgerRows.length - 1]?.running_balance ?? 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })()}
          </div>
        )}

        {/* ══ CHART OF ACCOUNTS ═════════════════════════════════════ */}
        {tab === 'coa' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-hmuted">{accounts.length} accounts · {accounts.filter(a => a.is_active).length} active</p>
              <Button onClick={openAddAccount}>+ Add Account</Button>
            </div>
            <div className="space-y-4">
              {ACCOUNT_TYPES.map(type => {
                const group = accountsByType[type]
                if (group.length === 0) return null
                return (
                  <div key={type} className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-hborder flex items-center gap-2">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide', TYPE_COLOR[type])}>
                        {type}
                      </span>
                      <span className="text-xs text-hmuted">{group.length} accounts</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-hsurface2/50">
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-hmuted uppercase tracking-wide">Code</th>
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-hmuted uppercase tracking-wide">Name</th>
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-hmuted uppercase tracking-wide">Category</th>
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-hmuted uppercase tracking-wide">Status</th>
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-hmuted uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
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
            {/* Balance card */}
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
                <Button onClick={() => { setPcForm(f => ({ ...f, type: 'out' })); setPcFormOpen(true) }}>
                  + Record Transaction
                </Button>
              </div>
            </div>

            {/* Filter */}
            <div className="flex gap-1 bg-hsurface2 rounded-xl p-1 mb-4 w-fit">
              {(['all', 'in', 'out'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setPcFilter(f)}
                  className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize', pcFilter === f ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted hover:text-htext')}
                >
                  {f === 'all' ? 'All' : f === 'in' ? 'Cash In' : 'Cash Out'}
                </button>
              ))}
            </div>

            <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-hsurface2">
                    {['Date', 'Description', 'Category', 'Type', 'Amount', 'Reference'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPetty.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-hmuted">No petty cash transactions yet</td></tr>
                  ) : filteredPetty.map(t => (
                    <tr key={t.id} className="border-t border-hborder hover:bg-hbg/40">
                      <td className="px-4 py-3 text-xs text-hmuted whitespace-nowrap">{formatDate(t.transaction_date)}</td>
                      <td className="px-4 py-3 text-htext">{t.description}</td>
                      <td className="px-4 py-3 text-xs text-hmuted">{t.category}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full capitalize', t.transaction_type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
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

      {/* ── Add / Edit Account Modal ── */}
      <Modal open={coaFormOpen} onClose={() => setCoaFormOpen(false)} title={editAccountId ? 'Edit Account' : 'Add Account'} size="sm">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Account Code *</label>
              <input
                value={coaForm.code}
                onChange={e => setCoaForm(f => ({ ...f, code: e.target.value }))}
                placeholder="e.g. 5900"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Type</label>
              <select
                value={coaForm.type}
                onChange={e => setCoaForm(f => ({ ...f, type: e.target.value as AccountType }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{capitalize(t)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Account Name *</label>
            <input
              value={coaForm.name}
              onChange={e => setCoaForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Internet & Subscriptions"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Category</label>
            <input
              value={coaForm.category}
              onChange={e => setCoaForm(f => ({ ...f, category: e.target.value }))}
              placeholder="e.g. operating_expense"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setCoaFormOpen(false)}>Cancel</Button>
            <Button onClick={saveAccount} disabled={coaSaving}>{coaSaving ? 'Saving…' : editAccountId ? 'Update' : 'Add Account'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Journal Entry Form Modal ── */}
      <Modal open={jeFormOpen} onClose={() => setJeFormOpen(false)} title="New Journal Entry" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Entry Date</label>
              <input
                type="date"
                value={jeForm.date}
                onChange={e => setJeForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Reference</label>
              <input
                value={jeForm.reference}
                onChange={e => setJeForm(f => ({ ...f, reference: e.target.value }))}
                placeholder="INV-xxx, RES-xxx…"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Type</label>
              <select
                value={jeForm.reference_type}
                onChange={e => setJeForm(f => ({ ...f, reference_type: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {['manual', 'invoice', 'reservation', 'petty_cash', 'adjustment'].map(t => (
                  <option key={t} value={t}>{capitalize(t.replace('_', ' '))}</option>
                ))}
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-xs text-hmuted mb-1">Description *</label>
              <input
                value={jeForm.description}
                onChange={e => setJeForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Salary payment for June, Purchase of kayak equipment…"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>

          {/* Entry lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-hmuted uppercase tracking-wide">Debit / Credit Lines</p>
              <button onClick={addJeLine} className="text-xs text-navy hover:underline font-medium">+ Add Line</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-0.5 text-[10px] text-hmuted uppercase tracking-wide font-semibold">
                <span className="col-span-4">Account</span>
                <span className="col-span-3">Description</span>
                <span className="col-span-2 text-right">Debit ($)</span>
                <span className="col-span-2 text-right">Credit ($)</span>
              </div>
              {jeLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    value={line.account_id}
                    onChange={e => updateJeLine(idx, 'account_id', e.target.value)}
                    className="col-span-4 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                  >
                    <option value="">Select account…</option>
                    {ACCOUNT_TYPES.map(type => (
                      <optgroup key={type} label={capitalize(type)}>
                        {accountsByType[type].filter(a => a.is_active).map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <input
                    value={line.description}
                    onChange={e => updateJeLine(idx, 'description', e.target.value)}
                    placeholder="Optional note"
                    className="col-span-3 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                  <input
                    type="number" min={0} step={0.01}
                    value={line.debit}
                    onChange={e => updateJeLine(idx, 'debit', e.target.value)}
                    placeholder="0.00"
                    className="col-span-2 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg text-right"
                  />
                  <input
                    type="number" min={0} step={0.01}
                    value={line.credit}
                    onChange={e => updateJeLine(idx, 'credit', e.target.value)}
                    placeholder="0.00"
                    className="col-span-2 border border-hborder rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-navy bg-hbg text-right"
                  />
                  {jeLines.length > 2 ? (
                    <button onClick={() => removeJeLine(idx)} className="col-span-1 text-red-400 hover:text-red-600 text-center text-lg">×</button>
                  ) : <span className="col-span-1" />}
                </div>
              ))}
            </div>

            {/* Balance indicator */}
            <div className={cn('mt-3 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm', jeBalanced ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200')}>
              <span className={jeBalanced ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                {jeBalanced ? '✓ Balanced' : '⚠ Unbalanced — debits must equal credits'}
              </span>
              <div className="flex gap-6 text-xs">
                <span className="text-hmuted">Total DR: <strong>{formatCurrency(jeTotalDebit)}</strong></span>
                <span className="text-hmuted">Total CR: <strong>{formatCurrency(jeTotalCredit)}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setJeFormOpen(false)}>Cancel</Button>
            <Button onClick={saveJournalEntry} disabled={jeSaving || !jeBalanced}>
              {jeSaving ? 'Posting…' : 'Post Entry'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Petty Cash Transaction Modal ── */}
      <Modal open={pcFormOpen} onClose={() => setPcFormOpen(false)} title="Record Petty Cash" size="sm">
        <div className="space-y-3">
          <div className="flex gap-1 bg-hsurface2 rounded-xl p-1">
            {(['out', 'in'] as const).map(t => (
              <button
                key={t}
                onClick={() => setPcForm(f => ({ ...f, type: t }))}
                className={cn('flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors', pcForm.type === t ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted')}
              >
                {t === 'out' ? '↓ Cash Out (Expense)' : '↑ Cash In (Replenishment)'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Date</label>
              <input
                type="date"
                value={pcForm.date}
                onChange={e => setPcForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Amount ($)</label>
              <input
                type="number" min={0} step={0.01}
                value={pcForm.amount}
                onChange={e => setPcForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-hmuted mb-1">Description *</label>
            <input
              value={pcForm.description}
              onChange={e => setPcForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What was this for?"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Category</label>
              <select
                value={pcForm.category}
                onChange={e => setPcForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {PETTY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Reference</label>
              <input
                value={pcForm.reference}
                onChange={e => setPcForm(f => ({ ...f, reference: e.target.value }))}
                placeholder="Receipt #, note…"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>

          {pcForm.type === 'out' && expenseAccounts.length > 0 && (
            <div>
              <label className="block text-xs text-hmuted mb-1">Post to GL Account (optional)</label>
              <select
                value={pcForm.expense_account_id}
                onChange={e => setPcForm(f => ({ ...f, expense_account_id: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                <option value="">Auto (5800 Miscellaneous)</option>
                {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
              <p className="text-[10px] text-hmuted mt-1">Creates DR Expense / CR 1010 Cash on Hand</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setPcFormOpen(false)}>Cancel</Button>
            <Button onClick={savePettyCash} disabled={pcSaving}>
              {pcSaving ? 'Saving…' : 'Record Transaction'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
