'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { useBranch } from '@/context/BranchContext'
import jsPDF from 'jspdf'

interface MonthlyData {
  month: string
  revenue: number
  reservations: number
  occupancyRate: number
}

interface BalanceSheet {
  cashCollected: number
  accountsReceivable: number
  totalAssets: number
  unpaidTotal: number
  partialBalance: number
  refundsIssued: number
  totalLiabilities: number
  grossBilling: number
  totalDiscounts: number
  netRevenue: number
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function ReportsPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [roomTypeStats, setRoomTypeStats] = useState<{ type: string; count: number }[]>([])
  const [sourceStats, setSourceStats] = useState<{ source: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({ totalRevenue: 0, totalGuests: 0, avgStay: 0, adr: 0, revpar: 0 })
  const [balance, setBalance] = useState<BalanceSheet>({
    cashCollected: 0, accountsReceivable: 0, totalAssets: 0,
    unpaidTotal: 0, partialBalance: 0, refundsIssued: 0, totalLiabilities: 0,
    grossBilling: 0, totalDiscounts: 0, netRevenue: 0,
  })

  useEffect(() => { if (activeBranch) loadReports() }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadReports() {
    if (!activeBranch) return
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
    const startDate = sixMonthsAgo.toISOString().split('T')[0]

    const [invRes, resRes, roomRes, allInvRes] = await Promise.all([
      supabase.from('invoices').select('total, paid_at').eq('status', 'paid').eq('branch_id', activeBranch.id).gte('paid_at', startDate),
      supabase.from('reservations').select('source, check_in_date, check_out_date, status, room:rooms(room_type)').eq('branch_id', activeBranch.id).gte('created_at', startDate),
      supabase.from('rooms').select('room_type, status').eq('branch_id', activeBranch.id),
      supabase.from('invoices').select('total, amount_paid, status, discount_amount').eq('branch_id', activeBranch.id),
    ])

    const invoices = invRes.data ?? []
    const reservations = resRes.data ?? []
    const allRooms = roomRes.data ?? []
    const allInvoices = allInvRes.data ?? []

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
      months.push({ month: label, revenue: monthRevenue, reservations: monthReservations, occupancyRate: Math.min(95, 40 + monthReservations * 3) })
    }
    setMonthlyData(months)

    // Room type distribution
    const typeMap: Record<string, number> = {}
    reservations.forEach(r => {
      const type = (r.room as any)?.room_type ?? 'unknown'
      typeMap[type] = (typeMap[type] ?? 0) + 1
    })
    setRoomTypeStats(Object.entries(typeMap).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count))

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
    const revpar = allRooms.length > 0 ? totalRevenue / (allRooms.length * 180) : 0

    setKpis({ totalRevenue, totalGuests, avgStay: Math.round(avgStay * 10) / 10, adr, revpar })

    // Balance sheet
    const cashCollected = allInvoices
      .filter(i => !['void'].includes(i.status))
      .reduce((s, i) => s + Number(i.amount_paid), 0)
    const accountsReceivable = allInvoices
      .filter(i => ['unpaid', 'partial'].includes(i.status))
      .reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid)), 0)
    const unpaidTotal = allInvoices
      .filter(i => i.status === 'unpaid')
      .reduce((s, i) => s + Number(i.total), 0)
    const partialBalance = allInvoices
      .filter(i => i.status === 'partial')
      .reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid)), 0)
    const refundsIssued = allInvoices
      .filter(i => i.status === 'refunded')
      .reduce((s, i) => s + Number(i.amount_paid), 0)
    const grossBilling = allInvoices
      .filter(i => !['void'].includes(i.status))
      .reduce((s, i) => s + Number(i.total), 0)
    const totalDiscounts = allInvoices.reduce((s, i) => s + Number(i.discount_amount ?? 0), 0)
    setBalance({
      cashCollected,
      accountsReceivable,
      totalAssets: cashCollected + accountsReceivable,
      unpaidTotal,
      partialBalance,
      refundsIssued,
      totalLiabilities: unpaidTotal + partialBalance + refundsIssued,
      grossBilling,
      totalDiscounts,
      netRevenue: cashCollected - refundsIssued,
    })
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
    const branchName = activeBranch?.name ?? 'Hotel'
    const branchLocation = activeBranch?.location ?? ''

    // ── Header ──────────────────────────────────────────────
    doc.setFillColor(0, 74, 173)        // #004AAD navy
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
    row('Cash Collected', formatCurrency(balance.cashCollected))
    row('Accounts Receivable', formatCurrency(balance.accountsReceivable))
    divider()
    totalRow('Total Assets', formatCurrency(balance.totalAssets), 26, 122, 74)

    // ── LIABILITIES ──────────────────────────────────────────
    sectionTitle('Liabilities', 184, 50, 50)     // red
    row('Outstanding (Unpaid)', formatCurrency(balance.unpaidTotal))
    row('Partial Balance Due', formatCurrency(balance.partialBalance))
    row('Refunds Issued', formatCurrency(balance.refundsIssued))
    divider()
    totalRow('Total Liabilities', formatCurrency(balance.totalLiabilities), 184, 50, 50)

    // ── NET POSITION ─────────────────────────────────────────
    sectionTitle('Net Position', 0, 74, 173)     // navy blue
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
  const totalRoomType = roomTypeStats.reduce((s, r) => s + r.count, 0)
  const totalSource = sourceStats.reduce((s, r) => s + r.count, 0)

  const TYPE_COLORS: Record<string, string> = {
    standard: '#004AAD', deluxe: '#C89B3C', suite: '#1A7A4A', presidential: '#B83232',
  }

  return (
    <>
      <TopBar title="Reports & Analytics" subtitle={`Occupancy, revenue & KPIs — ${activeBranch?.location ?? ''}`} />
      <div className="p-8 flex-1 section-enter">
        {/* KPIs */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total Revenue', value: formatCurrency(kpis.totalRevenue), accent: '#C89B3C' },
            { label: 'Total Guests', value: kpis.totalGuests, accent: '#004AAD' },
            { label: 'Avg Stay (nights)', value: kpis.avgStay, accent: '#1A7A4A' },
            { label: 'Avg Daily Rate', value: formatCurrency(kpis.adr), accent: '#7C3AED' },
            { label: 'RevPAR (6mo)', value: formatCurrency(kpis.revpar), accent: '#B83232' },
          ].map(k => (
            <div key={k.label} className="bg-white border border-hborder rounded-2xl p-4 shadow-card relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: k.accent }} />
              <p className="text-[11px] text-hmuted uppercase tracking-wide pl-2">{k.label}</p>
              <p className="font-serif text-2xl text-dark-navy mt-1 pl-2">{k.value}</p>
            </div>
          ))}
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
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#004AAD] hover:bg-[#003a8a] active:bg-[#002d6e] px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Export PDF
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-hborder">
            {/* Assets */}
            <div className="p-5">
              <p className="text-[11px] font-semibold tracking-widest text-[#1A7A4A] uppercase mb-3">Assets</p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted">Cash Collected</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(balance.cashCollected)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted">Accounts Receivable</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(balance.accountsReceivable)}</span>
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
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted">Outstanding (Unpaid)</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(balance.unpaidTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted">Partial Balance Due</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(balance.partialBalance)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted">Refunds Issued</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(balance.refundsIssued)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-hborder pt-2.5 mt-1">
                  <span className="font-semibold text-[#B83232]">Total Liabilities</span>
                  <span className="font-bold text-[#B83232] text-base">{formatCurrency(balance.totalLiabilities)}</span>
                </div>
              </div>
            </div>

            {/* Net Position */}
            <div className="p-5 bg-hsurface2/40">
              <p className="text-[11px] font-semibold tracking-widest text-[#004AAD] uppercase mb-3">Net Position</p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted">Gross Billing</span>
                  <span className="font-semibold text-dark-navy">{formatCurrency(balance.grossBilling)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted">Less: Discounts</span>
                  <span className="font-semibold text-dark-navy">({formatCurrency(balance.totalDiscounts)})</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-hmuted">Less: Refunds</span>
                  <span className="font-semibold text-dark-navy">({formatCurrency(balance.refundsIssued)})</span>
                </div>
                <div className="flex justify-between text-sm border-t border-hborder pt-2.5 mt-1">
                  <span className="font-semibold text-[#004AAD]">Net Revenue</span>
                  <span className="font-bold text-[#004AAD] text-base">{formatCurrency(balance.netRevenue)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5 mb-5">
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

        <div className="grid grid-cols-2 gap-5">
          {/* Room type distribution */}
          <div className="bg-white border border-hborder rounded-2xl p-5 shadow-card">
            <h3 className="font-serif text-[17px] text-dark-navy mb-1">Room Type Popularity</h3>
            <p className="text-xs text-hmuted mb-4">Bookings by room type (last 6 months)</p>
            {roomTypeStats.length === 0 ? (
              <p className="text-hmuted text-sm text-center py-6">No data yet</p>
            ) : (
              <div className="space-y-3">
                {roomTypeStats.map(r => (
                  <div key={r.type} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TYPE_COLORS[r.type] ?? '#888' }} />
                    <span className="text-sm text-htext flex-1 capitalize">{r.type}</span>
                    <span className="text-sm font-semibold text-dark-navy">{r.count}</span>
                    <div className="w-28 h-1.5 bg-hsurface2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(r.count / totalRoomType) * 100}%`, background: TYPE_COLORS[r.type] ?? '#888' }}
                      />
                    </div>
                    <span className="text-xs text-hmuted w-8 text-right">{Math.round((r.count / totalRoomType) * 100)}%</span>
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
                  const colors = ['#004AAD','#C89B3C','#1A7A4A','#B83232','#7C3AED']
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
    </>
  )
}
