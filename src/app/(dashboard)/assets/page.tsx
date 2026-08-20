'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, capitalize } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import { cn } from '@/lib/utils'
import { generateJournalEntryNumber } from '@/lib/utils'
import type { FixedAsset, AssetCategory, AssetStatus, DepreciationEntry } from '@/types'

type Tab = 'overview' | 'register' | 'depreciation'

// ─── Category config ──────────────────────────────────────────────────────────
// These six mirror the source fixed-asset workbooks' "FA ( WP) 2026" sheets
// exactly — the taxonomy accounting actually files under — so the register
// groups and totals line up with the working papers without re-mapping.
//
// Useful life (months) is the only thing anyone edits; depreciation_rate is a
// database-generated column computed from it (12 / months), so the two can
// never drift out of sync. Defaults follow the Class column on those same
// sheets: Class 1 buildings = 240mo (5%/yr), Class 3 furniture/kitchen = 48mo
// (25%/yr), Class 4 machinery/vehicle = 48mo (25%/yr). Operating equipment /
// linen has no single class — each item carries its own useful life, so its
// default is deliberately short and expected to be overridden per item.
function rateFromMonths(months: number | null | undefined): number {
  return months && months > 0 ? Math.round((12 / months) * 10000) / 10000 : 0
}

// ─── Depreciation method ──────────────────────────────────────────────────────
// Per the Method column on both source workbooks' "FA ( WP) 2026" sheets:
// Operating Equipment / Linen is STRAIGHT-LINE on original cost (each item
// carries its own useful life — 24, 60 or 84 months). Every other
// depreciable category — buildings included — is DECLINING BALANCE on
// current net book value, so the monthly amount shrinks as the asset ages.
// This is the single formula both the actual posting run and the schedule
// preview use, so they can never diverge.
//
// Divide by useful_life_months rather than going through depreciation_rate.
// The two are algebraically the same, but depreciation_rate is stored to four
// decimals, so a life that doesn't divide 12 evenly (84 months -> 0.142857…
// stored as 0.1429) drifts. Checked against the workbooks' August-2026
// column: via the rate, Kampot came out $0.005175 high; dividing by months
// matches both branches to six decimal places.
function monthlyDepAmount(asset: FixedAsset, nbv: number): number {
  if (!asset.is_depreciable || nbv <= 0.005) return 0
  const months = Number(asset.useful_life_months)
  if (!months || months <= 0) return 0
  const base = asset.category === 'operating_linen' ? Number(asset.total_cost) : nbv
  return Math.min(base / months, nbv)
}

// When depreciation begins. The workbooks carry an explicit "Start date"
// per asset, which is NOT the purchase date — most of these were bought in
// 2025 or early 2026 but only start depreciating in August 2026. Falls back
// to the purchase date for anything without one.
function depStart(asset: FixedAsset): Date | null {
  const d = asset.depreciation_start_date ?? asset.purchased_date
  return d ? new Date(d) : null
}

function startsAfter(asset: FixedAsset, year: number, month1to12: number): boolean {
  const sd = depStart(asset)
  if (!sd) return false
  return sd.getFullYear() > year || (sd.getFullYear() === year && sd.getMonth() + 1 > month1to12)
}

// Projects an asset's full-year schedule for targetYear by simulating forward
// from its depreciation start date, using ACTUAL posted amounts wherever a
// ledger entry exists for that month, and the declining-balance/straight-line
// formula above for any month not yet posted (past-due or future).
function buildAssetSchedule(asset: FixedAsset, entries: DepreciationEntry[], targetYear: number): number[] {
  const result = new Array(12).fill(0)
  if (!asset.is_depreciable || Number(asset.total_cost) <= 0) return result
  const entryMap = new Map(entries.map(e => [`${e.run_year}-${e.run_month}`, e]))
  const pd = depStart(asset)
  const startYear = pd ? pd.getFullYear() : targetYear
  if (startYear > targetYear) return result   // hasn't started depreciating yet
  const endYear = Math.max(targetYear, startYear)
  let nbv = Number(asset.total_cost)
  for (let y = startYear; y <= endYear; y++) {
    const mStart = (pd && y === startYear) ? pd.getMonth() + 1 : 1
    for (let m = mStart; m <= 12; m++) {
      const posted = entryMap.get(`${y}-${m}`)
      let amount: number
      if (posted) {
        amount = Number(posted.amount)
        nbv = Number(posted.nbv_after)
      } else {
        amount = monthlyDepAmount(asset, nbv)
        nbv = Math.max(0, nbv - amount)
      }
      if (y === targetYear) result[m - 1] = amount
    }
  }
  return result
}

const CATEGORIES: { value: AssetCategory; label: string; usefulLifeMonths: number; dot: string }[] = [
  { value: 'land',              label: 'Land',                                usefulLifeMonths: 0,   dot: '#6B7280' },
  { value: 'building',          label: 'Buildings, Const. & Renovations',     usefulLifeMonths: 240, dot: '#8B5CF6' },
  { value: 'furniture_fixture', label: 'Furniture Fixture & Other Equipment', usefulLifeMonths: 48,  dot: '#F59E0B' },
  { value: 'machinery_vehicle', label: 'Machinery, Vehicle, Truck & Others',  usefulLifeMonths: 48,  dot: '#EF4444' },
  { value: 'kitchen_equipment', label: 'Kitchen Equipment',                   usefulLifeMonths: 48,  dot: '#10B981' },
  { value: 'operating_linen',   label: 'Operating Equipment / Linen',         usefulLifeMonths: 24,  dot: '#3B82F6' },
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const emptyForm = {
  description: '',
  category: 'furniture_fixture' as AssetCategory,
  type_brand: '',
  asset_code: '',
  series_code: '',
  purchased_date: '',
  location: '',
  incharge: '',
  quantity: 1,
  unit_cost: 0,
  total_cost: 0,
  useful_life_months: 48 as number | null,
  is_depreciable: true,
  invoice_doc_ref: '',
  notes: '',
  status: 'active' as AssetStatus,
}

function catInfo(cat: AssetCategory) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[0]
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AssetsPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()

  const [tab, setTab] = useState<Tab>('overview')
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message?: string; confirmLabel?: string; variant?: 'default' | 'danger'; onConfirm: () => void } | null>(null)

  // Register filters
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  // Depreciation year (schedule view)
  const [depYear, setDepYear] = useState(new Date().getFullYear())

  // Depreciation run (auto-post)
  const [depRuns,      setDepRuns]      = useState<any[]>([])
  const [depEntries,   setDepEntries]   = useState<DepreciationEntry[]>([])
  const [depRunYear,   setDepRunYear]   = useState(new Date().getFullYear())
  const [depRunMonth,  setDepRunMonth]  = useState(new Date().getMonth() + 1)
  const [depRunSaving, setDepRunSaving] = useState(false)

  useEffect(() => { if (activeBranch) { load(); loadDepRuns() } }, [activeBranch]) // eslint-disable-line

  async function load() {
    if (!activeBranch) return
    setLoading(true)
    const { data } = await supabase
      .from('fixed_assets')
      .select('*')
      .eq('branch_id', activeBranch.id)
      .order('category')
      .order('purchased_date', { ascending: true, nullsFirst: false })
    setAssets((data ?? []) as FixedAsset[])
    setLoading(false)
  }

  async function loadDepRuns() {
    if (!activeBranch) return
    const { data } = await supabase.from('depreciation_runs')
      .select('*').eq('branch_id', activeBranch.id)
      .order('run_year', { ascending: false }).order('run_month', { ascending: false })
    setDepRuns(data ?? [])
    const runIds = (data ?? []).map(r => r.id)
    if (runIds.length === 0) { setDepEntries([]); return }
    const { data: entries } = await supabase.from('depreciation_entries')
      .select('*').in('depreciation_run_id', runIds)
    setDepEntries((entries ?? []) as DepreciationEntry[])
  }

  async function runDepreciation() {
    if (!activeBranch) return
    const alreadyRun = depRuns.find(r => r.run_year === depRunYear && r.run_month === depRunMonth)
    if (alreadyRun) { toast(`Depreciation for ${MONTHS[depRunMonth - 1]} ${depRunYear} already posted`, 'error'); return }
    const depAssetList = assets.filter(a => a.is_depreciable && a.status === 'active' && Number(a.total_cost) > 0)
    if (depAssetList.length === 0) { toast('No depreciable active assets found', 'error'); return }

    // Category → accumulated-depreciation account. One account per category,
    // matching the cost accounts migration 048 renamed to these same groups.
    // Land is non-depreciable and has none.
    const accumMap: Record<AssetCategory, string> = {
      land:              '',
      building:          '1501',
      operating_linen:   '1511',
      furniture_fixture: '1521',
      kitchen_equipment: '1531',
      machinery_vehicle: '1541',
    }
    const { data: coaData } = await supabase.from('chart_of_accounts')
      .select('id, code').eq('branch_id', activeBranch.id)
    const coa = coaData ?? []
    const findAcct = (code: string) => coa.find((a: any) => a.code === code)
    const depExpAcct = findAcct('5750')
    if (!depExpAcct) { toast('Account 5750 Depreciation Expense not found in COA', 'error'); return }

    setDepRunSaving(true)
    const entryDate = `${depRunYear}-${String(depRunMonth).padStart(2, '0')}-01`

    // Work the whole run out and check it BEFORE writing anything. The journal
    // entry used to be created first, so any bail-out below left an orphan
    // entry behind with no lines against it.
    let totalAmount = 0
    // Per-asset amount + resulting NBV — declining balance means each asset's
    // rate applies to its OWN current net book value (total_cost minus what's
    // already been depreciated), not its original cost. Operating/linen stays
    // straight-line on original cost. See monthlyDepAmount().
    const postings: { asset: FixedAsset; amount: number; nbvAfter: number; accumId: string }[] = []
    const missingAccts = new Set<string>()
    for (const asset of depAssetList) {
      if (startsAfter(asset, depRunYear, depRunMonth)) continue
      const nbv = Number(asset.total_cost) - Number(asset.accumulated_depreciation || 0)
      const monthly = monthlyDepAmount(asset, nbv)
      if (monthly <= 0) continue
      const accumCode = accumMap[asset.category]
      const accumAcct = accumCode ? findAcct(accumCode) : null
      if (!accumAcct) { missingAccts.add(accumCode || asset.category); continue }
      totalAmount += monthly
      postings.push({ asset, amount: monthly, nbvAfter: nbv - monthly, accumId: accumAcct.id })
    }

    // ── Guards. Depreciation errors are silent by nature — a wrong figure
    // posts and balances just as happily as a right one — so refuse to write
    // anything that violates an invariant rather than leaving it to be found
    // in a reconciliation months later.
    const overrun = postings.filter(p => p.nbvAfter < -0.005)
    if (overrun.length) {
      toast(`Aborted: ${overrun.length} asset(s) would depreciate past cost, e.g. "${overrun[0].asset.description}"`, 'error')
      setDepRunSaving(false); return
    }
    if (missingAccts.size) {
      toast(`Aborted: no accumulated-depreciation account for ${[...missingAccts].join(', ')} — check the Chart of Accounts`, 'error')
      setDepRunSaving(false); return
    }
    if (postings.length === 0) {
      toast(`No assets are depreciating in ${MONTHS[depRunMonth - 1]} ${depRunYear} — check their depreciation start dates`, 'error')
      setDepRunSaving(false); return
    }
    const lines: any[] = []
    for (const p of postings) {
      lines.push(
        { account_id: depExpAcct.id, description: p.asset.description, debit: p.amount, credit: 0 },
        { account_id: p.accumId,     description: p.asset.description, debit: 0, credit: p.amount },
      )
    }
    const drTotal = lines.reduce((s, l) => s + Number(l.debit), 0)
    const crTotal = lines.reduce((s, l) => s + Number(l.credit), 0)
    if (Math.abs(drTotal - crTotal) > 0.005 || Math.abs(drTotal - totalAmount) > 0.005) {
      toast(`Aborted: entry does not balance (DR ${formatCurrency(drTotal)} / CR ${formatCurrency(crTotal)})`, 'error')
      setDepRunSaving(false); return
    }

    const { data: je, error: jeErr } = await supabase.from('journal_entries').insert({
      entry_number: generateJournalEntryNumber(),
      entry_date: entryDate,
      reference: `DEP-${depRunYear}-${String(depRunMonth).padStart(2, '0')}`,
      description: `Depreciation — ${MONTHS[depRunMonth - 1]} ${depRunYear}`,
      reference_type: 'depreciation',
      branch_id: activeBranch.id,
    }).select().single()
    if (jeErr || !je) { toast(jeErr?.message ?? 'Error creating journal entry', 'error'); setDepRunSaving(false); return }

    const { error: linesErr } = await supabase.from('journal_entry_lines')
      .insert(lines.map(l => ({ ...l, entry_id: je.id })))
    if (linesErr) {
      // Don't leave a headless entry behind if the lines fail to land.
      await supabase.from('journal_entries').delete().eq('id', je.id)
      toast(`Aborted: ${linesErr.message}`, 'error'); setDepRunSaving(false); return
    }
    // From here on, roll the journal entry back on any failure rather than
    // leaving the GL carrying a charge the register has no record of.
    const rollback = async (msg: string) => {
      await supabase.from('journal_entry_lines').delete().eq('entry_id', je.id)
      await supabase.from('journal_entries').delete().eq('id', je.id)
      toast(`Aborted and rolled back: ${msg}`, 'error')
      setDepRunSaving(false)
    }

    const { data: run, error: runErr } = await supabase.from('depreciation_runs').insert({
      run_year: depRunYear, run_month: depRunMonth,
      journal_entry_id: je.id, total_amount: totalAmount,
      asset_count: postings.length, branch_id: activeBranch.id,
    }).select().single()
    if (runErr || !run) { await rollback(runErr?.message ?? 'could not create the depreciation run'); return }

    const { error: entErr } = await supabase.from('depreciation_entries').insert(postings.map(p => ({
      asset_id: p.asset.id, depreciation_run_id: run.id,
      run_year: depRunYear, run_month: depRunMonth,
      amount: p.amount, nbv_after: p.nbvAfter,
    })))
    if (entErr) {
      await supabase.from('depreciation_runs').delete().eq('id', run.id)
      await rollback(entErr.message)
      return
    }

    // Advance each asset's running NBV so next month's declining-balance calc starts from here.
    const updates = await Promise.all(postings.map(p =>
      supabase.from('fixed_assets')
        .update({ accumulated_depreciation: Number(p.asset.accumulated_depreciation || 0) + p.amount })
        .eq('id', p.asset.id)
    ))
    const failed = updates.filter(u => u.error)
    if (failed.length) {
      toast(`Posted ${je.entry_number}, but ${failed.length} asset balance(s) did not update: ${failed[0].error?.message}. Re-check before running next month.`, 'error')
      setDepRunSaving(false); load(); loadDepRuns(); return
    }

    toast(`Depreciation posted: ${je.entry_number} · ${formatCurrency(totalAmount)}`)
    setDepRunSaving(false)
    load()
    loadDepRuns()
  }

  // ── Overview stats ────────────────────────────────────────────────────────
  const totalFA    = assets.reduce((s, a) => s + Number(a.total_cost), 0)
  const totalDepAnnual = assets.reduce((s, a) =>
    s + (a.is_depreciable ? Number(a.total_cost) * Number(a.depreciation_rate) : 0), 0)
  const nbv = totalFA - totalDepAnnual
  const activeCount = assets.filter(a => a.status === 'active').length

  const catStats = CATEGORIES.map(cat => {
    const items = assets.filter(a => a.category === cat.value)
    const cost = items.reduce((s, a) => s + Number(a.total_cost), 0)
    const dep  = items.reduce((s, a) => s + (a.is_depreciable ? Number(a.total_cost) * Number(a.depreciation_rate) : 0), 0)
    return { ...cat, count: items.length, cost, dep, nbv: cost - dep }
  })

  // ── Register list ─────────────────────────────────────────────────────────
  const filteredAssets = useMemo(() => assets.filter(a => {
    if (filterCat !== 'all' && a.category !== filterCat) return false
    if (filterStatus !== 'all' && a.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        a.description.toLowerCase().includes(q) ||
        (a.asset_code ?? '').toLowerCase().includes(q) ||
        (a.location ?? '').toLowerCase().includes(q) ||
        (a.type_brand ?? '').toLowerCase().includes(q)
      )
    }
    return true
  }), [assets, search, filterCat, filterStatus])

  // ── Depreciation schedule ──────────────────────────────────────────────────
  const depAssets = useMemo(() =>
    assets.filter(a => a.is_depreciable && Number(a.total_cost) > 0), [assets])

  // Per-asset 12-month schedule for the selected year — actual posted amounts
  // where a ledger entry exists, projected declining-balance/straight-line
  // otherwise. Built once per (assets, depEntries, depYear) change, not per cell.
  const depSchedule = useMemo(() => {
    const byId = new Map(depEntries.reduce((m, e) => {
      if (!m.has(e.asset_id)) m.set(e.asset_id, [])
      m.get(e.asset_id)!.push(e)
      return m
    }, new Map<string, DepreciationEntry[]>()))
    const out = new Map<string, number[]>()
    depAssets.forEach(a => out.set(a.id, buildAssetSchedule(a, byId.get(a.id) ?? [], depYear)))
    return out
  }, [depAssets, depEntries, depYear])

  function monthlyDep(asset: FixedAsset, monthIdx: number): number {
    return depSchedule.get(asset.id)?.[monthIdx] ?? 0
  }

  // What the schedule below actually adds up to for the selected year. Not the
  // same as totalDepAnnual, which is a full-12-month run rate — in a year where
  // assets start part-way through (these all start August 2026) only the months
  // from the start date onward carry a charge.
  const scheduleYearTotal = useMemo(
    () => Array.from(depSchedule.values()).reduce((s, months) => s + months.reduce((t, v) => t + v, 0), 0),
    [depSchedule])

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openAdd() {
    setEditId(null)
    setForm({ ...emptyForm })
    setModalOpen(true)
  }

  function openEdit(a: FixedAsset) {
    setEditId(a.id)
    setForm({
      description: a.description,
      category: a.category,
      type_brand: a.type_brand ?? '',
      asset_code: a.asset_code ?? '',
      series_code: a.series_code ?? '',
      purchased_date: a.purchased_date ?? '',
      location: a.location ?? '',
      incharge: a.incharge ?? '',
      quantity: a.quantity,
      unit_cost: a.unit_cost,
      total_cost: a.total_cost,
      useful_life_months: a.useful_life_months ?? (a.is_depreciable ? catInfo(a.category).usefulLifeMonths : null),
      is_depreciable: a.is_depreciable,
      invoice_doc_ref: a.invoice_doc_ref ?? '',
      notes: a.notes ?? '',
      status: a.status,
    })
    setModalOpen(true)
  }

  function handleQtyUnitChange(field: 'quantity' | 'unit_cost', val: number) {
    setForm(f => {
      const qty  = field === 'quantity'  ? val : f.quantity
      const unit = field === 'unit_cost' ? val : f.unit_cost
      return { ...f, [field]: val, total_cost: qty * unit }
    })
  }

  function handleCategoryChange(cat: AssetCategory) {
    const info = catInfo(cat)
    setForm(f => ({
      ...f, category: cat,
      useful_life_months: cat === 'land' ? null : info.usefulLifeMonths,
      is_depreciable: cat !== 'land',
    }))
  }

  async function save() {
    if (!form.description.trim()) { toast('Description required', 'error'); return }
    setSaving(true)
    const payload = {
      description:       form.description.trim(),
      category:          form.category,
      type_brand:        form.type_brand || null,
      asset_code:        form.asset_code || null,
      series_code:       form.series_code || null,
      purchased_date:    form.purchased_date || null,
      location:          form.location || null,
      incharge:          form.incharge || null,
      quantity:           Number(form.quantity),
      unit_cost:          Number(form.unit_cost),
      total_cost:         Number(form.total_cost),
      useful_life_months: form.is_depreciable ? (form.useful_life_months || null) : null,
      is_depreciable:     form.is_depreciable,
      invoice_doc_ref:   form.invoice_doc_ref || null,
      notes:             form.notes || null,
      status:            form.status,
      updated_at:        new Date().toISOString(),
    }
    if (editId) {
      const { error } = await supabase.from('fixed_assets').update(payload).eq('id', editId)
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      toast('Asset updated')
    } else {
      const { error } = await supabase.from('fixed_assets').insert({ ...payload, branch_id: activeBranch?.id })
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      toast('Asset added')
    }
    setSaving(false); setModalOpen(false); load()
  }

  function disposeAsset(id: string) {
    setConfirmDialog({
      title: 'Mark Asset as Disposed',
      message: 'This will set the asset status to Disposed and record today as the disposal date. This action is difficult to reverse.',
      confirmLabel: 'Dispose Asset',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null)
        await supabase.from('fixed_assets').update({ status: 'disposed', date_disposed: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', id)
        toast('Asset marked disposed')
        load()
      },
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <TopBar
        title="Fixed Assets"
        subtitle={`Asset register & depreciation — ${activeBranch?.location ?? ''}`}
      />

      <div className="p-4 sm:p-6 lg:p-8 flex-1 section-enter">

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-6 bg-hsurface2 rounded-xl p-1 w-fit">
          {([
            { key: 'overview',     label: 'Overview' },
            { key: 'register',     label: 'Asset Register' },
            { key: 'depreciation', label: 'Depreciation' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.key
                  ? 'bg-dark-navy text-white shadow-sm'
                  : 'text-hmuted hover:text-htext'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: 'Total FA Value',        value: formatCurrency(totalFA),          sub: `${assets.length} assets total` },
                { label: 'Annual Depreciation',   value: formatCurrency(totalDepAnnual),   sub: 'Declining balance · linen straight-line' },
                { label: 'Net Book Value',        value: formatCurrency(nbv),              sub: 'After annual dep.' },
                { label: 'Active Assets',         value: activeCount.toString(),           sub: `${assets.length - activeCount} disposed/maintenance` },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-2xl border border-hborder p-5 shadow-sm overflow-hidden">
                  <p className="text-xs text-hmuted mb-1">{c.label}</p>
                  <p className="text-xl sm:text-2xl font-bold text-dark-navy truncate" title={c.value}>{c.value}</p>
                  <p className="text-xs text-hmuted mt-1">{c.sub}</p>
                </div>
              ))}
            </div>

            {/* Category breakdown */}
            <div className="bg-white rounded-2xl border border-hborder shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-hborder">
                <h3 className="font-semibold text-dark-navy text-[15px]">By Category</h3>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hborder bg-hsurface2">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Category</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Assets</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Total Cost</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Dep Rate</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Annual Dep</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">NBV</th>
                  </tr>
                </thead>
                <tbody>
                  {catStats.map((c, i) => (
                    <tr
                      key={c.value}
                      className={cn('border-b border-hborder/60 hover:bg-hsurface2 transition-colors cursor-pointer',
                        i % 2 === 0 ? '' : 'bg-gray-50/40')}
                      onClick={() => { setTab('register'); setFilterCat(c.value) }}
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
                          <span className="font-medium text-htext">{c.label}</span>
                        </div>
                      </td>
                      <td className="text-right px-3 py-2 text-hmuted">{c.count}</td>
                      <td className="text-right px-3 py-2 font-medium text-htext">{formatCurrency(c.cost)}</td>
                      <td className="text-right px-3 py-2 text-hmuted">
                        {c.usefulLifeMonths === 0 ? '—' : `${(rateFromMonths(c.usefulLifeMonths) * 100).toFixed(0)}%`}
                      </td>
                      <td className="text-right px-3 py-2 text-red-600">{c.dep > 0 ? formatCurrency(c.dep) : '—'}</td>
                      <td className="text-right px-6 py-3.5 font-semibold text-dark-navy">{formatCurrency(c.nbv)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-dark-navy/5 border-t-2 border-hborder">
                    <td className="px-6 py-3.5 font-bold text-dark-navy">Total</td>
                    <td className="text-right px-3 py-2 font-bold text-dark-navy">{assets.length}</td>
                    <td className="text-right px-3 py-2 font-bold text-dark-navy">{formatCurrency(totalFA)}</td>
                    <td className="text-right px-3 py-2" />
                    <td className="text-right px-3 py-2 font-bold text-red-600">{formatCurrency(totalDepAnnual)}</td>
                    <td className="text-right px-6 py-3.5 font-bold text-dark-navy">{formatCurrency(nbv)}</td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
          </div>
        )}

        {/* ── ASSET REGISTER ───────────────────────────────────────────── */}
        {tab === 'register' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search description, code, location…"
                className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy w-64"
              />
              <select
                value={filterCat}
                onChange={e => setFilterCat(e.target.value)}
                className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="disposed">Disposed</option>
                <option value="maintenance">Maintenance</option>
              </select>
              <span className="text-sm text-hmuted ml-1">{filteredAssets.length} asset{filteredAssets.length !== 1 ? 's' : ''}</span>
              <div className="ml-auto">
                <Button onClick={openAdd}>+ Add Asset</Button>
              </div>
            </div>

            {loading ? (
              <p className="text-center text-hmuted py-20">Loading assets…</p>
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-hmuted mb-4">No assets found.</p>
                <Button onClick={openAdd}>+ Add Asset</Button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-hborder shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hborder bg-hsurface2">
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Description</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Category</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Qty</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Unit $</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Total $</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Dep%</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Purchased</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide">Status</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map((a, i) => {
                      const cat = catInfo(a.category)
                      return (
                        <tr key={a.id} className={cn('border-b border-hborder/60 hover:bg-hsurface2 transition-colors', i % 2 === 0 ? '' : 'bg-gray-50/30')}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-htext leading-snug max-w-[260px]">{a.description}</p>
                            {a.type_brand && <p className="text-xs text-hmuted">{a.type_brand}</p>}
                            {a.asset_code && <p className="text-[10px] text-hmuted/70 font-mono">{a.asset_code}</p>}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.dot }} />
                              <span className="text-xs text-hmuted">{cat.label}</span>
                            </div>
                          </td>
                          <td className="text-right px-3 py-2 text-hmuted">{a.quantity}</td>
                          <td className="text-right px-3 py-2 text-hmuted">{Number(a.unit_cost) > 0 ? formatCurrency(a.unit_cost) : '—'}</td>
                          <td className="text-right px-3 py-2 font-semibold text-dark-navy">{formatCurrency(a.total_cost)}</td>
                          <td className="text-right px-3 py-2 text-hmuted">
                            {a.is_depreciable ? `${(Number(a.depreciation_rate) * 100).toFixed(0)}%` : <span className="text-xs italic">N/A</span>}
                          </td>
                          <td className="px-3 py-2 text-hmuted text-xs whitespace-nowrap">
                            {a.purchased_date ? formatDate(a.purchased_date) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn(
                              'text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap',
                              a.status === 'active'      && 'bg-green-100 text-green-700',
                              a.status === 'disposed'    && 'bg-gray-100 text-gray-500',
                              a.status === 'maintenance' && 'bg-yellow-100 text-yellow-700',
                            )}>
                              {capitalize(a.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button onClick={() => openEdit(a)} className="text-xs text-navy hover:underline">Edit</button>
                              {a.status === 'active' && (
                                <button onClick={() => disposeAsset(a.id)} className="text-xs text-red-400 hover:text-red-600">Dispose</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-dark-navy/5 border-t-2 border-hborder">
                      <td className="px-3 py-2 font-bold text-dark-navy text-sm" colSpan={4}>
                        Subtotal ({filteredAssets.length} items)
                      </td>
                      <td className="text-right px-3 py-2 font-bold text-dark-navy">
                        {formatCurrency(filteredAssets.reduce((s, a) => s + Number(a.total_cost), 0))}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DEPRECIATION SCHEDULE ─────────────────────────────────────── */}
        {tab === 'depreciation' && (
          <div className="space-y-4">
            {/* ── Run Depreciation panel ── */}
            <div className="bg-white border border-hborder rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-dark-navy text-[15px]">Post Monthly Depreciation</h3>
                  <p className="text-xs text-hmuted mt-0.5">Creates DR 5750 / CR Accum. Dep. journal entries for all active depreciable assets.</p>
                </div>
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="block text-xs text-hmuted mb-1">Month</label>
                  <select value={depRunMonth} onChange={e => setDepRunMonth(Number(e.target.value))}
                    className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy">
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-hmuted mb-1">Year</label>
                  <select value={depRunYear} onChange={e => setDepRunYear(Number(e.target.value))}
                    className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy">
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <Button
                  onClick={runDepreciation}
                  disabled={depRunSaving || !!depRuns.find(r => r.run_year === depRunYear && r.run_month === depRunMonth)}
                >
                  {depRunSaving ? 'Posting…' : depRuns.find(r => r.run_year === depRunYear && r.run_month === depRunMonth) ? '✓ Already Posted' : 'Run Depreciation'}
                </Button>
              </div>
              {depRuns.length > 0 && (
                <div className="mt-4 border-t border-hborder pt-4">
                  <p className="text-xs font-semibold text-hmuted uppercase tracking-wide mb-2">Run History</p>
                  <div className="space-y-1">
                    {depRuns.slice(0, 6).map(r => (
                      <div key={r.id} className="flex items-center justify-between text-sm py-1 border-b border-hborder/40">
                        <span className="text-htext">{MONTHS[r.run_month - 1]} {r.run_year}</span>
                        <span className="text-xs text-hmuted">{r.asset_count} assets</span>
                        <span className="font-semibold text-dark-navy">{formatCurrency(r.total_amount)}</span>
                        <span className="text-xs text-green-600 font-medium">✓ Posted</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Schedule Controls */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-hmuted font-medium">Schedule Year</label>
              <select
                value={depYear}
                onChange={e => setDepYear(Number(e.target.value))}
                className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
              >
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-sm text-hmuted ml-2">
                {depYear} depreciation: <span className="font-semibold text-dark-navy">{formatCurrency(scheduleYearTotal)}</span>
                <span className="text-hlight ml-2">· full-year run rate {formatCurrency(totalDepAnnual)}</span>
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-hborder shadow-sm overflow-x-auto">
              <table className="text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-hborder bg-hsurface2">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide sticky left-0 bg-hsurface2 min-w-[220px]">Description</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide min-w-[60px]">Cat.</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide min-w-[80px]">Total</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide min-w-[60px]">Rate</th>
                    {MONTHS.map(m => (
                      <th key={m} className="text-right px-3 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide min-w-[80px]">{m}</th>
                    ))}
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-hmuted uppercase tracking-wide min-w-[90px]">Annual</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map(cat => {
                    const catAssets = depAssets.filter(a => a.category === cat.value)
                    if (catAssets.length === 0) return null
                    const rows = catAssets.map(a => ({
                      a,
                      months: MONTHS.map((_, idx) => monthlyDep(a, idx)),
                      annual: MONTHS.reduce((s, _, idx) => s + monthlyDep(a, idx), 0),
                    }))
                    const subtotal = rows.reduce((s, r) => s + r.annual, 0)
                    return (
                      <React.Fragment key={cat.value}>
                        {/* Category header */}
                        <tr className="bg-dark-navy/5 border-b border-hborder">
                          <td className="px-3 py-2 font-semibold text-dark-navy sticky left-0 bg-dark-navy/5" colSpan={4}>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ background: cat.dot }} />
                              {cat.label}
                            </div>
                          </td>
                          {MONTHS.map((_, idx) => {
                            const total = catAssets.reduce((s, a) => s + monthlyDep(a, idx), 0)
                            return (
                              <td key={idx} className="text-right px-3 py-2 font-semibold text-dark-navy">
                                {total > 0 ? formatCurrency(total) : '—'}
                              </td>
                            )
                          })}
                          <td className="text-right px-3 py-2 font-bold text-dark-navy">{formatCurrency(subtotal)}</td>
                        </tr>
                        {/* Asset rows */}
                        {rows.map(({ a, months, annual }, i) => (
                          <tr key={a.id} className={cn('border-b border-hborder/50 hover:bg-hsurface2', i % 2 === 0 ? '' : 'bg-gray-50/30')}>
                            <td className="px-3 py-2 sticky left-0 bg-inherit">
                              <p className="font-medium text-htext max-w-[210px] truncate">{a.description}</p>
                            </td>
                            <td className="px-3 py-2.5 text-hmuted">{(Number(a.depreciation_rate) * 100).toFixed(0)}%</td>
                            <td className="text-right px-3 py-2.5 text-hmuted">{formatCurrency(a.total_cost)}</td>
                            <td className="text-right px-3 py-2.5 text-hmuted">{(Number(a.depreciation_rate) * 100).toFixed(0)}%</td>
                            {months.map((m, idx) => (
                              <td key={idx} className="text-right px-3 py-2.5 text-hmuted">
                                {m > 0 ? formatCurrency(m) : <span className="text-hborder">—</span>}
                              </td>
                            ))}
                            <td className="text-right px-3 py-2 font-semibold text-dark-navy">{annual > 0 ? formatCurrency(annual) : '—'}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-dark-navy text-white border-t-2 border-dark-navy">
                    <td className="px-3 py-2 font-bold sticky left-0 bg-dark-navy" colSpan={4}>Grand Total</td>
                    {MONTHS.map((_, idx) => {
                      const total = depAssets.reduce((s, a) => s + monthlyDep(a, idx), 0)
                      return (
                        <td key={idx} className="text-right px-3 py-3 font-semibold">
                          {total > 0 ? formatCurrency(total) : '—'}
                        </td>
                      )
                    })}
                    <td className="text-right px-3 py-2 font-bold">{formatCurrency(scheduleYearTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
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

      {/* ── Add / Edit Asset Modal ────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Edit Asset' : 'Add Fixed Asset'}
        size="lg"
      >
        <div className="space-y-3">
          {/* Description */}
          <div>
            <label className="block text-xs text-hmuted mb-1">Description *</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Panasonic 2HP Air Conditioner"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Category */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Category *</label>
              <select
                value={form.category}
                onChange={e => handleCategoryChange(e.target.value as AssetCategory)}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as AssetStatus }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="disposed">Disposed</option>
              </select>
            </div>

            {/* Type / Brand */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Type / Brand</label>
              <input
                value={form.type_brand}
                onChange={e => setForm(f => ({ ...f, type_brand: e.target.value }))}
                placeholder="e.g. Panasonic"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>

            {/* Purchased Date */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Purchased Date</label>
              <input
                type="date"
                value={form.purchased_date}
                onChange={e => setForm(f => ({ ...f, purchased_date: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>

            {/* Asset Code */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Asset Code</label>
              <input
                value={form.asset_code}
                onChange={e => setForm(f => ({ ...f, asset_code: e.target.value }))}
                placeholder="e.g. FAL0075"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>

            {/* Series / Model */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Series / Model No</label>
              <input
                value={form.series_code}
                onChange={e => setForm(f => ({ ...f, series_code: e.target.value }))}
                placeholder="e.g. CS-S18ZKH"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Quantity *</label>
              <input
                type="number" min={1}
                value={form.quantity}
                onChange={e => handleQtyUnitChange('quantity', Number(e.target.value))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>

            {/* Unit Cost */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Unit Cost ($)</label>
              <input
                type="number" min={0} step={0.01}
                value={form.unit_cost}
                onChange={e => handleQtyUnitChange('unit_cost', Number(e.target.value))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>

            {/* Total Cost */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Total Cost ($)</label>
              <input
                type="number" min={0} step={0.01}
                value={form.total_cost}
                onChange={e => setForm(f => ({ ...f, total_cost: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
              <p className="text-[10px] text-hmuted mt-0.5">Auto = Qty × Unit Cost. Override if needed.</p>
            </div>

            {/* Useful Life — the only depreciation input. Rate is derived from
                this (database-generated column), never entered directly, so
                it can't drift out of sync with what this actually means. */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Useful Life</label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-hmuted cursor-pointer select-none flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={form.is_depreciable}
                    onChange={e => setForm(f => ({ ...f, is_depreciable: e.target.checked, useful_life_months: e.target.checked ? (f.useful_life_months || 48) : null }))}
                    className="rounded border-hborder"
                  />
                  Depreciable
                </label>
                <input
                  type="number" min={1} step={1}
                  disabled={!form.is_depreciable}
                  value={form.is_depreciable ? (form.useful_life_months ?? '') : ''}
                  onChange={e => setForm(f => ({ ...f, useful_life_months: Number(e.target.value) || null }))}
                  placeholder="e.g. 48"
                  className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg disabled:bg-hsurface2 disabled:text-hmuted"
                />
                <span className="text-xs text-hmuted flex-shrink-0">months</span>
              </div>
              <div className="flex gap-1.5 mt-1.5">
                {([['240mo Building', 240], ['48mo Furn/Mach/Kitchen', 48], ['24mo Linen', 24]] as const).map(([label, months]) => (
                  <button
                    key={label} type="button"
                    onClick={() => setForm(f => ({ ...f, is_depreciable: true, useful_life_months: months }))}
                    className="text-[10px] px-2 py-1 rounded-full border border-hborder text-hmuted hover:border-navy hover:text-navy transition-colors"
                  >{label}</button>
                ))}
              </div>
              {form.is_depreciable && form.useful_life_months ? (
                <p className="text-[10px] text-hmuted mt-1">
                  = {(rateFromMonths(form.useful_life_months) * 100).toFixed(2)}% / yr,{' '}
                  {form.category === 'operating_linen' ? 'straight-line' : 'declining balance'}.
                  {form.category === 'operating_linen' && ' Enter this item\'s own useful life, not a preset.'}
                </p>
              ) : (
                <p className="text-[10px] text-hmuted mt-1">Operating equipment / linen items: enter that specific item's own useful life in months, not a preset.</p>
              )}
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Location</label>
              <input
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Master Bedroom, Pool Area"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>

            {/* In-Charge */}
            <div>
              <label className="block text-xs text-hmuted mb-1">In-Charge</label>
              <input
                value={form.incharge}
                onChange={e => setForm(f => ({ ...f, incharge: e.target.value }))}
                placeholder="e.g. Hong Lim"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>

            {/* Invoice Ref */}
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs text-hmuted mb-1">Invoice / Doc Ref</label>
              <input
                value={form.invoice_doc_ref}
                onChange={e => setForm(f => ({ ...f, invoice_doc_ref: e.target.value }))}
                placeholder="e.g. INV-2026-04-009"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-hmuted mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg resize-none"
            />
          </div>

          {/* Summary preview */}
          {form.total_cost > 0 && form.is_depreciable && form.useful_life_months ? (
            <div className="bg-hsurface2 rounded-xl px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-hmuted">Annual Depreciation</span>
                <span className="font-semibold text-dark-navy">
                  {formatCurrency(Number(form.total_cost) * rateFromMonths(form.useful_life_months))} / yr
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-hmuted">Monthly</span>
                <span className="text-htext">
                  {formatCurrency(Number(form.total_cost) / form.useful_life_months)} / mo
                </span>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editId ? 'Update Asset' : 'Add Asset'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
