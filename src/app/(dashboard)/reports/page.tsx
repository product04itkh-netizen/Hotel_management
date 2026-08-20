'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, branchBrand } from '@/lib/utils'
import { useBranch } from '@/context/BranchContext'
import jsPDF from 'jspdf'

interface MonthlyData {
  month: string
  revenue: number
  reservations: number
}

interface AcctLine { code: string; name: string; balance: number }

// Balances come from the general ledger (all posted, non-void entries, all
// time) so this reports the same position the Accounting balance sheet does.
// It used to be derived from invoices, which showed unpaid invoices as
// LIABILITIES when they are receivables, summed all-time cash collected as if
// it were a cash balance, and omitted loans, payables and equity entirely.
interface BalanceSheet {
  cashBank: number
  accountsReceivable: number
  otherCurrentAssets: number
  fixedAssetsCost: number
  accumulatedDep: number
  fixedAssetsNBV: number
  totalAssets: number
  liabilities: AcctLine[]
  totalLiabilities: number
  equity: AcctLine[]
  netIncome: number
  totalEquity: number
  // Operational billing figures — flows, not balances. Kept separate.
  grossBilling: number
  totalDiscounts: number
  refundsIssued: number
  netRevenue: number
}

interface PLData {
  revenueByType: { name: string; amount: number }[]
  expenseByCategory: { name: string; amount: number }[]
  totalRevenue: number
  totalExpenses: number
  netIncome: number
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function ReportsPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [houseTypeStats, setHouseTypeStats] = useState<{ type: string; count: number }[]>([])
  const [sourceStats, setSourceStats] = useState<{ source: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({ totalRevenue: 0, totalGuests: 0, avgStay: 0, adr: 0, revpar: 0 })
  const [balance, setBalance] = useState<BalanceSheet>({
    cashBank: 0, accountsReceivable: 0, otherCurrentAssets: 0,
    fixedAssetsCost: 0, accumulatedDep: 0, fixedAssetsNBV: 0, totalAssets: 0,
    liabilities: [], totalLiabilities: 0,
    equity: [], netIncome: 0, totalEquity: 0,
    grossBilling: 0, totalDiscounts: 0, refundsIssued: 0, netRevenue: 0,
  })
  const [pl, setPl] = useState<PLData>({
    revenueByType: [], expenseByCategory: [], totalRevenue: 0, totalExpenses: 0, netIncome: 0,
  })
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({})
  // Current customer deposits held (account 2200 liability, all-time) + drill-down
  const [customerDeposits, setCustomerDeposits] = useState(0)
  const [depositDetails, setDepositDetails] = useState<{ entry_number: string; entry_date: string; description: string; debit: number; credit: number }[]>([])
  const [depositModalOpen, setDepositModalOpen] = useState(false)

  useEffect(() => { if (activeBranch) loadReports() }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadReports() {
    if (!activeBranch) return
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
    const startDate = sixMonthsAgo.toISOString().split('T')[0]

    const [invRes, resRes, houseRes, allInvRes, coaRes] = await Promise.all([
      supabase.from('invoices').select('total, paid_at').eq('status', 'paid').eq('branch_id', activeBranch.id).gte('paid_at', startDate),
      supabase.from('reservations').select('source, check_in_date, check_out_date, status, house:houses(house_type)').eq('branch_id', activeBranch.id).gte('created_at', startDate),
      supabase.from('houses').select('house_type, status').eq('branch_id', activeBranch.id),
      supabase.from('invoices').select('total, amount_paid, status, discount_amount').eq('branch_id', activeBranch.id),
      supabase.from('chart_of_accounts').select('code, name, type').eq('branch_id', activeBranch.id).eq('is_active', true).in('type', ['revenue', 'expense']).order('code'),
    ])
    // 2-step: get this branch's JE IDs first, then fetch their lines (journal_entry_lines has no branch_id)
    const { data: jeIdData } = await supabase.from('journal_entries')
      .select('id').eq('branch_id', activeBranch.id).eq('is_void', false).gte('entry_date', startDate)
    const jeIdList = (jeIdData ?? []).map((e: any) => e.id)
    const jeLineRes = jeIdList.length > 0
      ? await supabase.from('journal_entry_lines')
          .select('debit, credit, account:chart_of_accounts(code, name, type, category)')
          .in('entry_id', jeIdList)
      : { data: [] as any[] }

    const invoices = invRes.data ?? []
    const reservations = resRes.data ?? []
    const allHouses = houseRes.data ?? []
    const allInvoices = allInvRes.data ?? []
    const jeLines = jeLineRes.data ?? []
    // All active revenue & expense accounts — used as base for P&L so every account shows
    const allCoaAccounts: { code: string; name: string; type: string }[] = coaRes.data ?? []

    // Monthly breakdown
    const months: MonthlyData[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      const monthRevenue = invoices
        .filter(inv => inv.paid_at?.startsWith(monthKey))
        .reduce((s, inv) => s + Number(inv.total), 0)
      const monthReservations = reservations.filter(r => r.check_in_date?.startsWith(monthKey)).length
      months.push({ month: label, revenue: monthRevenue, reservations: monthReservations })
    }
    setMonthlyData(months)

    // House type distribution
    const typeMap: Record<string, number> = {}
    reservations.forEach(r => {
      const type = (r.house as any)?.house_type ?? 'unknown'
      typeMap[type] = (typeMap[type] ?? 0) + 1
    })
    setHouseTypeStats(Object.entries(typeMap).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count))

    // Booking source
    const srcMap: Record<string, number> = {}
    reservations.forEach(r => { srcMap[r.source] = (srcMap[r.source] ?? 0) + 1 })
    setSourceStats(Object.entries(srcMap).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count))

    // KPIs
    const totalRevenue = invoices.reduce((s, i) => s + Number(i.total), 0)
    const totalGuests = reservations.filter(r => r.status !== 'cancelled').length
    const stays = reservations.filter(r => r.check_in_date && r.check_out_date)
    const avgStay = stays.length > 0
      ? stays.reduce((s, r) => {
          const diff = new Date(r.check_out_date).getTime() - new Date(r.check_in_date).getTime()
          return s + diff / (1000 * 60 * 60 * 24)
        }, 0) / stays.length
      : 0
    const adr = totalGuests > 0 ? totalRevenue / totalGuests : 0
    const revpar = allHouses.length > 0 ? totalRevenue / (allHouses.length * 180) : 0

    setKpis({ totalRevenue, totalGuests, avgStay: Math.round(avgStay * 10) / 10, adr, revpar })

    // ── Balance sheet, from the general ledger ──
    // All posted, non-void entries, all time — a balance sheet is cumulative,
    // so this deliberately ignores the 6-month window the P&L below uses.
    const { data: bsIdData } = await supabase.from('journal_entries')
      .select('id').eq('branch_id', activeBranch.id).eq('status', 'posted').eq('is_void', false)
    const bsIds = (bsIdData ?? []).map((e: any) => e.id)
    const bsLines: any[] = []
    // Chunked: a branch can carry more entry ids than one .in() should take.
    for (let i = 0; i < bsIds.length; i += 200) {
      const { data } = await supabase.from('journal_entry_lines')
        .select('debit, credit, account:chart_of_accounts(code, name, type, category)')
        .in('entry_id', bsIds.slice(i, i + 200))
      bsLines.push(...(data ?? []))
    }
    const acctBal: Record<string, { code: string; name: string; type: string; category: string; balance: number }> = {}
    for (const l of bsLines) {
      const a = l.account
      if (!a) continue
      if (!acctBal[a.code]) acctBal[a.code] = { code: a.code, name: a.name, type: a.type, category: a.category ?? '', balance: 0 }
      // Assets and expenses are debit-positive; liabilities, equity and revenue credit-positive.
      const signed = ['asset', 'expense'].includes(a.type)
        ? Number(l.debit) - Number(l.credit)
        : Number(l.credit) - Number(l.debit)
      acctBal[a.code].balance += signed
    }
    const bsAll = Object.values(acctBal)
    const codeNum = (c: string) => Number(c)
    const sumWhere = (fn: (a: typeof bsAll[number]) => boolean) =>
      bsAll.filter(fn).reduce((s, a) => s + a.balance, 0)

    const cashBank = sumWhere(a => a.type === 'asset' && (a.category.toLowerCase() === 'bank' || codeNum(a.code) < 1030))
    const accountsReceivable = sumWhere(a => a.type === 'asset' && a.category.toLowerCase() !== 'bank' && codeNum(a.code) >= 1100 && codeNum(a.code) < 1200)
    const otherCurrentAssets = sumWhere(a => a.type === 'asset' && a.category.toLowerCase() !== 'bank'
      && codeNum(a.code) >= 1030 && codeNum(a.code) < 1500 && !(codeNum(a.code) >= 1100 && codeNum(a.code) < 1200))

    const liabilities: AcctLine[] = bsAll.filter(a => a.type === 'liability')
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(a => ({ code: a.code, name: a.name, balance: a.balance }))
    const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0)

    const glRevenue  = sumWhere(a => a.type === 'revenue')
    const glExpenses = sumWhere(a => a.type === 'expense')
    const bsNetIncome = glRevenue - glExpenses
    const equity: AcctLine[] = bsAll.filter(a => a.type === 'equity')
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(a => ({ code: a.code, name: a.name, balance: a.balance }))
    const totalEquity = equity.reduce((s, a) => s + a.balance, 0) + bsNetIncome

    // ── Operational billing figures (flows, shown separately) ──
    const refundsIssued = allInvoices
      .filter(i => i.status === 'refunded')
      .reduce((s, i) => s + Number(i.amount_paid), 0)
    const grossBilling = allInvoices
      .filter(i => !['void'].includes(i.status))
      .reduce((s, i) => s + Number(i.total) + Number(i.discount_amount ?? 0), 0)
    const totalDiscounts = allInvoices
      .filter(i => !['void'].includes(i.status))
      .reduce((s, i) => s + Number(i.discount_amount ?? 0), 0)
    const netRevenue = allInvoices
      .filter(i => !['void'].includes(i.status))
      .reduce((s, i) => s + Number(i.total), 0) - refundsIssued

    // ── Fixed assets, also from the GL ──
    // Accumulated-depreciation accounts are contra-assets, so they carry credit
    // balances and come through negative. Splitting on sign avoids depending on
    // account naming or the 1500/1501 code-parity convention.
    const faAccts = bsAll.filter(a => a.type === 'asset' && a.category.toLowerCase() !== 'bank'
      && codeNum(a.code) >= 1500 && codeNum(a.code) < 1800)
    const fixedAssetsCost = faAccts.filter(a => a.balance > 0).reduce((s, a) => s + a.balance, 0)
    // `|| 0` normalises negative zero, which would otherwise render as "-$0.00".
    const accumulatedDep = -faAccts.filter(a => a.balance < 0).reduce((s, a) => s + a.balance, 0) || 0
    const fixedAssetsNBV = fixedAssetsCost - accumulatedDep

    setBalance({
      cashBank,
      accountsReceivable,
      otherCurrentAssets,
      fixedAssetsCost,
      accumulatedDep,
      fixedAssetsNBV,
      totalAssets: cashBank + accountsReceivable + otherCurrentAssets + fixedAssetsNBV,
      liabilities,
      totalLiabilities,
      equity,
      netIncome: bsNetIncome,
      totalEquity,
      grossBilling,
      totalDiscounts,
      refundsIssued,
      netRevenue,
    })

    // ── P&L from journal entry lines ──
    // Seed maps from COA so every account appears even with $0 activity
    const revenueMap: Record<string, number> = {}
    const expenseMap: Record<string, number> = {}
    const revenueDetails: Record<string, { desc: string, amount: number }[]> = {}
    const expenseDetails: Record<string, { desc: string, amount: number }[]> = {}

    allCoaAccounts.forEach(a => {
      if (a.type === 'revenue') { revenueMap[a.name] = 0; revenueDetails[a.name] = [] }
      if (a.type === 'expense') { expenseMap[a.name] = 0; expenseDetails[a.name] = [] }
    })
    jeLines.forEach((l: any) => {
      const acct = l.account
      if (!acct) return
      if (acct.type === 'revenue') {
        const net = Number(l.credit) - Number(l.debit)
        revenueMap[acct.name] = (revenueMap[acct.name] ?? 0) + net
        if (net !== 0) {
          revenueDetails[acct.name] = revenueDetails[acct.name] || []
          revenueDetails[acct.name].push({ desc: l.description || 'Revenue', amount: net })
        }
      }
      if (acct.type === 'expense') {
        const net = Number(l.debit) - Number(l.credit)
        expenseMap[acct.name] = (expenseMap[acct.name] ?? 0) + net
        if (net !== 0) {
          expenseDetails[acct.name] = expenseDetails[acct.name] || []
          expenseDetails[acct.name].push({ desc: l.description || 'Expense', amount: net })
        }
      }
    })
    // Sort: non-zero first, then zero accounts by their COA order
    const plRevenue = Object.entries(revenueMap).map(([name, amount]) => ({ name, amount, details: revenueDetails[name] })).sort((a, b) => b.amount - a.amount)
    const plExpense = Object.entries(expenseMap).map(([name, amount]) => ({ name, amount, details: expenseDetails[name] })).sort((a, b) => b.amount - a.amount)
    const plTotalRev = plRevenue.reduce((s, r) => s + r.amount, 0)
    const plTotalExp = plExpense.reduce((s, e) => s + e.amount, 0)
    setPl({ revenueByType: plRevenue, expenseByCategory: plExpense, totalRevenue: plTotalRev, totalExpenses: plTotalExp, netIncome: plTotalRev - plTotalExp })

    // ── Current customer deposits held (2200 Guest Deposits Received) ──
    // Point-in-time liability, so all-time & non-void (not the 6-month window).
    const { data: dep2200Acct } = await supabase.from('chart_of_accounts')
      .select('id').eq('branch_id', activeBranch.id).eq('code', '2200').maybeSingle()
    if (dep2200Acct) {
      const { data: allJes } = await supabase.from('journal_entries')
        .select('id, entry_number, entry_date, description').eq('branch_id', activeBranch.id).eq('is_void', false)
      const jeMeta: Record<string, any> = Object.fromEntries((allJes ?? []).map(j => [j.id, j]))
      const allJeIds = (allJes ?? []).map(j => j.id)
      const { data: depLines } = allJeIds.length > 0
        ? await supabase.from('journal_entry_lines').select('entry_id, debit, credit').eq('account_id', dep2200Acct.id).in('entry_id', allJeIds)
        : { data: [] as any[] }
      const rows = (depLines ?? []).map((l: any) => {
        const je = jeMeta[l.entry_id] ?? {}
        return { entry_number: je.entry_number ?? '', entry_date: je.entry_date ?? '', description: je.description ?? '', debit: Number(l.debit), credit: Number(l.credit) }
      }).sort((a, b) => (a.entry_date || '').localeCompare(b.entry_date || ''))
      setCustomerDeposits(rows.reduce((s, r) => s + r.credit - r.debit, 0))
      setDepositDetails(rows)
    } else {
      setCustomerDeposits(0)
      setDepositDetails([])
    }

    setLoading(false)
  }

  function exportBalancePDF() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = 210
    const marginL = 20
    const marginR = 20
    const contentW = pageW - marginL - marginR
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const branchName = branchBrand(activeBranch?.location)
    const branchLocation = activeBranch?.location ?? ''

    // ── Header ──────────────────────────────────────────────
    doc.setFillColor(0, 74, 173)        // #583808 navy
    doc.rect(0, 0, pageW, 28, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(branchName, marginL, 12)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(branchLocation, marginL, 18)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Financial Balance Sheet Report', pageW - marginR, 12, { align: 'right' })
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`As of ${dateStr}`, pageW - marginR, 18, { align: 'right' })

    doc.setTextColor(30, 30, 30)
    let y = 38

    // ── Helper: section title ────────────────────────────────
    function sectionTitle(label: string, r: number, g: number, b: number) {
      doc.setFillColor(r, g, b)
      doc.rect(marginL, y, contentW, 7, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text(label.toUpperCase(), marginL + 3, y + 5)
      doc.setTextColor(30, 30, 30)
      y += 10
    }

    // ── Helper: row ──────────────────────────────────────────
    function row(label: string, value: string, bold = false, highlight = false) {
      if (highlight) {
        doc.setFillColor(245, 247, 250)
        doc.rect(marginL, y - 1, contentW, 7, 'F')
      }
      doc.setFontSize(9)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.text(label, marginL + 4, y + 4)
      doc.text(value, pageW - marginR - 4, y + 4, { align: 'right' })
      y += 7
    }

    // ── Helper: divider line ─────────────────────────────────
    function divider(color = [220, 220, 220] as [number, number, number]) {
      doc.setDrawColor(...color)
      doc.setLineWidth(0.3)
      doc.line(marginL, y, pageW - marginR, y)
      y += 4
    }

    // ── Helper: total row ────────────────────────────────────
    function totalRow(label: string, value: string, r: number, g: number, b: number) {
      doc.setFillColor(r, g, b)
      doc.setFillColor(r, g, b)
      doc.rect(marginL, y, contentW, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(label, marginL + 4, y + 5.5)
      doc.text(value, pageW - marginR - 4, y + 5.5, { align: 'right' })
      doc.setTextColor(30, 30, 30)
      y += 12
    }

    // ── ASSETS ───────────────────────────────────────────────
    sectionTitle('Assets', 26, 122, 74)          // green
    row('Cash & Bank', formatCurrency(balance.cashBank))
    row('Accounts Receivable', formatCurrency(balance.accountsReceivable))
    if (balance.otherCurrentAssets !== 0) row('Other Current Assets', formatCurrency(balance.otherCurrentAssets))
    row('Fixed Assets (at cost)', formatCurrency(balance.fixedAssetsCost))
    row('  Less: Accumulated Depreciation', `(${formatCurrency(balance.accumulatedDep)})`)
    row('  Net Book Value', formatCurrency(balance.fixedAssetsNBV))
    divider()
    totalRow('Total Assets', formatCurrency(balance.totalAssets), 26, 122, 74)

    // ── LIABILITIES ──────────────────────────────────────────
    sectionTitle('Liabilities', 184, 50, 50)     // red
    if (balance.liabilities.length === 0) row('No liability accounts with activity', '')
    balance.liabilities.forEach(l => row(l.name, formatCurrency(l.balance)))
    divider()
    totalRow('Total Liabilities', formatCurrency(balance.totalLiabilities), 184, 50, 50)

    // ── EQUITY ───────────────────────────────────────────────
    sectionTitle('Equity', 88, 56, 8)            // brown
    balance.equity.forEach(e => row(e.name, formatCurrency(e.balance)))
    row('Net Income (to date)', balance.netIncome < 0
      ? `(${formatCurrency(Math.abs(balance.netIncome))})`
      : formatCurrency(balance.netIncome))
    divider()
    totalRow('Total Equity', formatCurrency(balance.totalEquity), 88, 56, 8)

    // ── BALANCE CHECK ────────────────────────────────────────
    const leTotal = balance.totalLiabilities + balance.totalEquity
    const isBalanced = Math.abs(balance.totalAssets - leTotal) < 0.01
    totalRow(
      isBalanced ? 'Liabilities + Equity  (balanced)' : 'Liabilities + Equity  (OUT OF BALANCE)',
      formatCurrency(leTotal),
      isBalanced ? 26 : 184, isBalanced ? 122 : 50, isBalanced ? 74 : 50,
    )

    // ── BILLING SUMMARY (flows, not balances) ────────────────
    sectionTitle('Billing Summary (all-time)', 0, 74, 173)   // navy blue
    row('Gross Billing', formatCurrency(balance.grossBilling))
    row('Less: Discounts', `(${formatCurrency(balance.totalDiscounts)})`)
    row('Less: Refunds', `(${formatCurrency(balance.refundsIssued)})`)
    divider()
    totalRow('Net Revenue', formatCurrency(balance.netRevenue), 0, 74, 173)

    // ── KPI Summary strip ────────────────────────────────────
    y += 2
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 100, 100)
    doc.text('KPI SUMMARY (LAST 6 MONTHS)', marginL, y)
    y += 6
    doc.setFillColor(248, 249, 251)
    doc.rect(marginL, y, contentW, 16, 'F')
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.rect(marginL, y, contentW, 16)
    const kpiItems = [
      { label: 'Total Revenue', value: formatCurrency(kpis.totalRevenue) },
      { label: 'Total Guests', value: String(kpis.totalGuests) },
      { label: 'Avg Stay', value: `${kpis.avgStay} nights` },
      { label: 'ADR', value: formatCurrency(kpis.adr) },
    ]
    const colW = contentW / kpiItems.length
    kpiItems.forEach((k, i) => {
      const cx = marginL + colW * i + colW / 2
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(120, 120, 120)
      doc.text(k.label.toUpperCase(), cx, y + 5, { align: 'center' })
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(k.value, cx, y + 12, { align: 'center' })
    })
    y += 22

    // ── Footer ───────────────────────────────────────────────
    const pageH = 297
    doc.setFillColor(245, 247, 250)
    doc.rect(0, pageH - 12, pageW, 12, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text(`Generated on ${now.toLocaleString()} · ${branchName} · Confidential`, pageW / 2, pageH - 4, { align: 'center' })

    const filename = `balance-sheet-${branchName.replace(/\s+/g, '-').toLowerCase()}-${now.toISOString().split('T')[0]}.pdf`
    doc.save(filename)
  }

  const maxRevenue = Math.max(...monthlyData.map(m => m.revenue), 1)
  const maxRes = Math.max(...monthlyData.map(m => m.reservations), 1)
  const totalHouseType = houseTypeStats.reduce((s, r) => s + r.count, 0)
  const totalSource = sourceStats.reduce((s, r) => s + r.count, 0)

  const HOUSE_TYPE_COLORS: Record<string, string> = {
    villa: '#583808', bungalow: '#F05830', homestay: '#1A7A4A', cottage: '#7C3AED', cabin: '#B83232', chalet: '#0EA5E9',
  }

  return (
    <>
      <TopBar title="Reports & Analytics" subtitle={`Occupancy, revenue & KPIs — ${activeBranch?.location ?? ''}`} />
      <div className="p-4 sm:p-6 lg:p-8 flex-1 section-enter">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {[
            { label: 'Total Revenue', value: formatCurrency(kpis.totalRevenue), accent: '#F05830' },
            { label: 'Total Guests', value: kpis.totalGuests, accent: '#583808' },
            { label: 'Avg Stay (nights)', value: kpis.avgStay, accent: '#1A7A4A' },
            { label: 'Avg Daily Rate', value: formatCurrency(kpis.adr), accent: '#7C3AED' },
            { label: 'RevPAR (6mo)', value: formatCurrency(kpis.revpar), accent: '#B83232' },
          ].map(k => (
            <div key={k.label} className="bg-white border border-hborder rounded-2xl p-4 shadow-card relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: k.accent }} />
              <p className="text-[11px] text-hmuted uppercase tracking-wide pl-2">{k.label}</p>
              <p className="font-serif text-xl sm:text-2xl text-dark-navy mt-1 pl-2 truncate" title={String(k.value)}>{k.value}</p>
            </div>
          ))}
          {/* Customer Deposits — clickable drill-down */}
          <button
            onClick={() => setDepositModalOpen(true)}
            className="bg-white border border-hborder rounded-2xl p-4 shadow-card relative overflow-hidden text-left hover:shadow-lg hover:border-[#0EA5E9]/40 transition-all group"
          >
            <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: '#0EA5E9' }} />
            <p className="text-[11px] text-hmuted uppercase tracking-wide pl-2">Customer Deposits</p>
            <p className="font-serif text-xl sm:text-2xl text-dark-navy mt-1 pl-2 truncate">{formatCurrency(customerDeposits)}</p>
            <span className="pl-2 text-[10px] font-medium text-[#0EA5E9] group-hover:underline">View {depositDetails.length} entr{depositDetails.length === 1 ? 'y' : 'ies'} →</span>
          </button>
        </div>

        {/* Balance Sheet */}
        <div className="bg-white border border-hborder rounded-2xl shadow-card mb-5 overflow-hidden">
          <div className="px-6 py-4 border-b border-hborder flex items-center justify-between">
            <div>
              <h3 className="font-serif text-[17px] text-dark-navy">Financial Balance Sheet</h3>
              <p className="text-xs text-hmuted mt-0.5">Assets, liabilities & net position — all-time</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-hmuted">
                As of {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
              <button
                onClick={exportBalancePDF}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#583808] hover:bg-[#492E07] active:bg-[#3A2505] px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Export PDF
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 divide-y divide-hborder sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {/* Assets */}
            <div className="p-5">
              <p className="text-[11px] font-semibold tracking-widest text-[#1A7A4A] uppercase mb-3">Assets</p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted">Cash &amp; Bank</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(balance.cashBank)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted">Accounts Receivable</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(balance.accountsReceivable)}</span>
                </div>
                {balance.otherCurrentAssets !== 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-hmuted">Other Current Assets</span>
                    <span className="font-semibold text-dark-navy">{formatCurrency(balance.otherCurrentAssets)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted">Fixed Assets (at cost)</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(balance.fixedAssetsCost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted pl-3">Less: Accumulated Depreciation</span>
                  <span className="font-semibold text-dark-navy">({formatCurrency(balance.accumulatedDep)})</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted pl-3">Net Book Value</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(balance.fixedAssetsNBV)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-hborder pt-2.5 mt-1">
                  <span className="font-semibold text-[#1A7A4A]">Total Assets</span>
                  <span className="font-bold text-[#1A7A4A] text-base">{formatCurrency(balance.totalAssets)}</span>
                </div>
              </div>
            </div>

            {/* Liabilities */}
            <div className="p-5">
              <p className="text-[11px] font-semibold tracking-widest text-[#B83232] uppercase mb-3">Liabilities</p>
              <div className="space-y-2.5">
                {balance.liabilities.length === 0 ? (
                  <p className="text-sm text-hmuted italic">No liability accounts with activity.</p>
                ) : balance.liabilities.map(l => (
                  <div key={l.code} className="flex justify-between text-sm gap-3">
                    <span className="text-hmuted truncate" title={`${l.code} · ${l.name}`}>{l.name}</span>
                    <span className="font-semibold text-dark-navy whitespace-nowrap">{formatCurrency(l.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm border-t border-hborder pt-2.5 mt-1">
                  <span className="font-semibold text-[#B83232]">Total Liabilities</span>
                  <span className="font-bold text-[#B83232] text-base">{formatCurrency(balance.totalLiabilities)}</span>
                </div>
              </div>
            </div>

            {/* Equity */}
            <div className="p-5 bg-hsurface2/40">
              <p className="text-[11px] font-semibold tracking-widest text-[#583808] uppercase mb-3">Equity</p>
              <div className="space-y-2.5">
                {balance.equity.map(e => (
                  <div key={e.code} className="flex justify-between text-sm gap-3">
                    <span className="text-hmuted truncate" title={`${e.code} · ${e.name}`}>{e.name}</span>
                    <span className="font-semibold text-dark-navy whitespace-nowrap">{formatCurrency(e.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm gap-3">
                  <span className="text-hmuted italic">Net Income (to date)</span>
                  <span className={`font-semibold whitespace-nowrap ${balance.netIncome < 0 ? 'text-[#B83232]' : 'text-dark-navy'}`}>
                    {balance.netIncome < 0 ? `(${formatCurrency(Math.abs(balance.netIncome))})` : formatCurrency(balance.netIncome)}
                  </span>
                </div>
                <div className="flex justify-between text-sm border-t border-hborder pt-2.5 mt-1">
                  <span className="font-semibold text-[#583808]">Total Equity</span>
                  <span className="font-bold text-[#583808] text-base">{formatCurrency(balance.totalEquity)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Balance check — assets must equal liabilities + equity */}
          {(() => {
            const le = balance.totalLiabilities + balance.totalEquity
            const balanced = Math.abs(balance.totalAssets - le) < 0.01
            return (
              <div className={`px-6 py-3 border-t border-hborder flex items-center justify-between text-sm ${balanced ? 'bg-green-50' : 'bg-red-50'}`}>
                <span className={`font-semibold ${balanced ? 'text-green-800' : 'text-red-800'}`}>Liabilities + Equity</span>
                <span className="flex items-center gap-3">
                  <span className={`font-bold ${balanced ? 'text-green-800' : 'text-red-800'}`}>{formatCurrency(le)}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${balanced ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {balanced ? '✓ Balanced' : `Out by ${formatCurrency(balance.totalAssets - le)}`}
                  </span>
                </span>
              </div>
            )
          })()}
        </div>

        {/* Billing summary — flows over all time, not balance-sheet figures */}
        <div className="bg-white border border-hborder rounded-2xl shadow-card mb-5 overflow-hidden">
          <div className="px-6 py-4 border-b border-hborder">
            <h3 className="font-serif text-[17px] text-dark-navy">Billing Summary</h3>
            <p className="text-xs text-hmuted mt-0.5">What has been billed and given away — all-time totals, not balances</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y divide-hborder sm:divide-y-0 sm:divide-x">
            {[
              { label: 'Gross Billing', value: formatCurrency(balance.grossBilling) },
              { label: 'Less: Discounts', value: `(${formatCurrency(balance.totalDiscounts)})` },
              { label: 'Less: Refunds', value: `(${formatCurrency(balance.refundsIssued)})` },
              { label: 'Net Revenue', value: formatCurrency(balance.netRevenue), accent: true },
            ].map(m => (
              <div key={m.label} className="p-5">
                <p className="text-[11px] text-hmuted uppercase tracking-wide mb-1">{m.label}</p>
                <p className={`text-lg font-bold ${m.accent ? 'text-[#583808]' : 'text-dark-navy'}`}>{m.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {/* Revenue chart */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy mb-1">Monthly Revenue</h3>
            <p className="text-xs text-hmuted mb-4">Last 6 months — paid invoices</p>
            {loading ? <div className="h-28 flex items-center justify-center text-hmuted text-sm">Loading…</div> : (
              <div className="flex items-end gap-3 h-28">
                {monthlyData.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-hmuted">{formatCurrency(m.revenue, 'USD').replace('$', '$').replace(/\.00$/, '')}</span>
                    <div
                      className="w-full rounded-t-sm bg-navy transition-all duration-500"
                      style={{ height: `${(m.revenue / maxRevenue) * 80}px`, minHeight: 4 }}
                    />
                    <span className="text-[10px] text-hmuted whitespace-nowrap">{m.month.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reservations chart */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy mb-1">Monthly Reservations</h3>
            <p className="text-xs text-hmuted mb-4">Last 6 months — confirmed bookings</p>
            {loading ? <div className="h-28 flex items-center justify-center text-hmuted text-sm">Loading…</div> : (
              <div className="flex items-end gap-3 h-28">
                {monthlyData.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-hmuted">{m.reservations}</span>
                    <div
                      className="w-full rounded-t-sm bg-gold transition-all duration-500"
                      style={{ height: `${(m.reservations / maxRes) * 80}px`, minHeight: 4 }}
                    />
                    <span className="text-[10px] text-hmuted">{m.month.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* P&L Statement */}
        <div className="bg-white border border-hborder rounded-2xl shadow-card mb-5 overflow-hidden">
          <div className="px-6 py-4 border-b border-hborder">
            <h3 className="font-serif text-[17px] text-dark-navy">Profit & Loss Statement</h3>
            <p className="text-xs text-hmuted mt-0.5">From General Ledger — last 6 months</p>
          </div>
          {pl.revenueByType.length === 0 && pl.expenseByCategory.length === 0 ? (
            <p className="text-hmuted text-sm text-center py-10">No GL entries yet. P&L populates automatically when invoices are paid.</p>
          ) : (
            <div className="grid grid-cols-1 divide-y divide-hborder sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {/* Revenue */}
              <div className="p-5">
                <p className="text-[11px] font-semibold tracking-widest text-[#1A7A4A] uppercase mb-3">Revenue</p>
                <div className="space-y-2.5">
                  {pl.revenueByType.length === 0 ? (
                    <p className="text-xs text-hmuted py-2">No revenue entries</p>
                  ) : pl.revenueByType.map((r: any) => (
                    <div key={r.name} className="flex flex-col text-sm border-b border-hborder/50 pb-2 mb-2 last:border-0 last:mb-0 last:pb-0">
                      <div className="flex justify-between items-center group">
                        <button 
                          onClick={() => setExpandedAccounts(p => ({ ...p, [r.name]: !p[r.name] }))}
                          className="flex items-center gap-1.5 text-hmuted hover:text-navy transition-colors text-left"
                          disabled={!r.details || r.details.length === 0}
                        >
                          {r.details && r.details.length > 0 ? (
                            <svg className={`w-3.5 h-3.5 transition-transform ${expandedAccounts[r.name] ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          ) : <span className="w-3.5 inline-block" />}
                          <span className={expandedAccounts[r.name] ? 'font-medium text-navy' : ''}>{r.name}</span>
                        </button>
                        <span className="font-semibold text-dark-navy">{formatCurrency(r.amount)}</span>
                      </div>
                      {expandedAccounts[r.name] && r.details && r.details.length > 0 && (
                        <div className="mt-2 pl-5 space-y-1">
                          {r.details.map((d: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-xs items-center">
                              <span className="text-hmuted/80 truncate max-w-[150px]" title={d.desc}>{d.desc}</span>
                              <span className="text-hmuted">{formatCurrency(d.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between text-sm border-t border-hborder pt-2.5 mt-1">
                    <span className="font-semibold text-[#1A7A4A]">Total Revenue</span>
                    <span className="font-bold text-[#1A7A4A] text-base">{formatCurrency(pl.totalRevenue)}</span>
                  </div>
                </div>
              </div>

              {/* Expenses */}
              <div className="p-5">
                <p className="text-[11px] font-semibold tracking-widest text-[#B83232] uppercase mb-3">Expenses</p>
                <div className="space-y-2.5">
                  {pl.expenseByCategory.length === 0 ? (
                    <p className="text-xs text-hmuted py-2">No expense entries</p>
                  ) : pl.expenseByCategory.map((e: any) => (
                    <div key={e.name} className="flex flex-col text-sm border-b border-hborder/50 pb-2 mb-2 last:border-0 last:mb-0 last:pb-0">
                      <div className="flex justify-between items-center group">
                        <button 
                          onClick={() => setExpandedAccounts(p => ({ ...p, [e.name]: !p[e.name] }))}
                          className="flex items-center gap-1.5 text-hmuted hover:text-navy transition-colors text-left"
                          disabled={!e.details || e.details.length === 0}
                        >
                          {e.details && e.details.length > 0 ? (
                            <svg className={`w-3.5 h-3.5 transition-transform ${expandedAccounts[e.name] ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          ) : <span className="w-3.5 inline-block" />}
                          <span className={expandedAccounts[e.name] ? 'font-medium text-navy' : ''}>{e.name}</span>
                        </button>
                        <span className="font-semibold text-dark-navy">{formatCurrency(e.amount)}</span>
                      </div>
                      {expandedAccounts[e.name] && e.details && e.details.length > 0 && (
                        <div className="mt-2 pl-5 space-y-1">
                          {e.details.map((d: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-xs items-center">
                              <span className="text-hmuted/80 truncate max-w-[150px]" title={d.desc}>{d.desc}</span>
                              <span className="text-hmuted">{formatCurrency(d.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between text-sm border-t border-hborder pt-2.5 mt-1">
                    <span className="font-semibold text-[#B83232]">Total Expenses</span>
                    <span className="font-bold text-[#B83232] text-base">{formatCurrency(pl.totalExpenses)}</span>
                  </div>
                </div>
              </div>

              {/* Net Income */}
              <div className="p-5 bg-hsurface2/40">
                <p className="text-[11px] font-semibold tracking-widest text-[#583808] uppercase mb-3">Net Income</p>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-hmuted">Total Revenue</span>
                    <span className="font-semibold text-dark-navy">{formatCurrency(pl.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-hmuted">Less: Total Expenses</span>
                    <span className="font-semibold text-dark-navy">({formatCurrency(pl.totalExpenses)})</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-hborder pt-3 mt-1">
                    <span className="font-semibold text-[#583808]">Net Income</span>
                    <span className={`font-bold text-base ${pl.netIncome >= 0 ? 'text-[#1A7A4A]' : 'text-[#B83232]'}`}>
                      {pl.netIncome < 0 ? `(${formatCurrency(Math.abs(pl.netIncome))})` : formatCurrency(pl.netIncome)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-hmuted">Net Margin</span>
                    <span className="font-semibold text-dark-navy">
                      {pl.totalRevenue > 0 ? `${Math.round((pl.netIncome / pl.totalRevenue) * 100)}%` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* House type distribution */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy mb-1">House Type Bookings</h3>
            <p className="text-xs text-hmuted mb-4">Reservations by house type (last 6 months)</p>
            {houseTypeStats.length === 0 ? (
              <p className="text-hmuted text-sm text-center py-6">No data yet</p>
            ) : (
              <div className="space-y-3">
                {houseTypeStats.map(r => (
                  <div key={r.type} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: HOUSE_TYPE_COLORS[r.type] ?? '#888' }} />
                    <span className="text-sm text-htext flex-1 capitalize">{r.type}</span>
                    <span className="text-sm font-semibold text-dark-navy">{r.count}</span>
                    <div className="w-28 h-1.5 bg-hsurface2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(r.count / totalHouseType) * 100}%`, background: HOUSE_TYPE_COLORS[r.type] ?? '#888' }}
                      />
                    </div>
                    <span className="text-xs text-hmuted w-8 text-right">{Math.round((r.count / totalHouseType) * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Booking source */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy mb-1">Booking Sources</h3>
            <p className="text-xs text-hmuted mb-4">Where reservations come from</p>
            {sourceStats.length === 0 ? (
              <p className="text-hmuted text-sm text-center py-6">No data yet</p>
            ) : (
              <div className="space-y-3">
                {sourceStats.map((s, i) => {
                  const colors = ['#583808','#F05830','#1A7A4A','#B83232','#7C3AED']
                  return (
                    <div key={s.source} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors[i % colors.length] }} />
                      <span className="text-sm text-htext flex-1 capitalize">{s.source.replace('_', ' ')}</span>
                      <span className="text-sm font-semibold text-dark-navy">{s.count}</span>
                      <div className="w-28 h-1.5 bg-hsurface2 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.count / totalSource) * 100}%`, background: colors[i % colors.length] }} />
                      </div>
                      <span className="text-xs text-hmuted w-8 text-right">{Math.round((s.count / totalSource) * 100)}%</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Customer Deposits drill-down */}
      <Modal open={depositModalOpen} onClose={() => setDepositModalOpen(false)} title="Customer Deposits Held" size="lg">
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-hsurface2 rounded-xl px-4 py-3">
            <span className="text-sm text-hmuted">Current balance — Guest Deposits Received (2200)</span>
            <span className="font-serif text-xl text-dark-navy">{formatCurrency(customerDeposits)}</span>
          </div>
          {depositDetails.length === 0 ? (
            <p className="text-sm text-hmuted text-center py-8">No deposit activity yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-[55vh] overflow-y-auto border border-hborder rounded-xl">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-hsurface2">
                  <tr className="text-left">
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Entry</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Date</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide">Description</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide text-right">Received (CR)</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide text-right">Applied/Refunded (DR)</th>
                  </tr>
                </thead>
                <tbody>
                  {depositDetails.map((d, i) => (
                    <tr key={i} className="border-t border-hborder hover:bg-hbg/50">
                      <td className="px-3 py-2 font-mono text-xs text-hmuted whitespace-nowrap">{d.entry_number}</td>
                      <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{d.entry_date ? formatDate(d.entry_date) : '—'}</td>
                      <td className="px-3 py-2 text-htext max-w-[260px] truncate" title={d.description}>{d.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#1A7A4A]">{d.credit > 0 ? formatCurrency(d.credit) : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#B83232]">{d.debit > 0 ? formatCurrency(d.debit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-hborder bg-hsurface2/60 font-semibold">
                    <td className="px-3 py-2.5 text-dark-navy" colSpan={3}>Net deposits held</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-dark-navy" colSpan={2}>{formatCurrency(customerDeposits)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-[10px] text-hmuted">Credits are deposits received; debits are deposits applied to invoices or refunded. The net is your current guest-deposit liability.</p>
        </div>
      </Modal>
    </>
  )
}
