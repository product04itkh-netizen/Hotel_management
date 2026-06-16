'use client'
import { useEffect, useState, useMemo } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, capitalize } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import { cn } from '@/lib/utils'
import type { FixedAsset, AssetCategory, AssetStatus } from '@/types'

type Tab = 'overview' | 'register' | 'depreciation'

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORIES: { value: AssetCategory; label: string; rate: number; dot: string }[] = [
  { value: 'land',           label: 'Land',                     rate: 0,    dot: '#6B7280' },
  { value: 'building',       label: 'Buildings & Construction', rate: 0.05, dot: '#8B5CF6' },
  { value: 'computer_office',label: 'Computer & Office',        rate: 0.20, dot: '#3B82F6' },
  { value: 'furniture',      label: 'Furniture & Equipment',    rate: 0.20, dot: '#F59E0B' },
  { value: 'machinery',      label: 'Machinery & Electrical',   rate: 0.10, dot: '#10B981' },
  { value: 'vehicle',        label: 'Vehicle & Watercraft',     rate: 0.10, dot: '#EF4444' },
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const emptyForm = {
  description: '',
  category: 'furniture' as AssetCategory,
  type_brand: '',
  asset_code: '',
  series_code: '',
  purchased_date: '',
  location: '',
  incharge: '',
  quantity: 1,
  unit_cost: 0,
  total_cost: 0,
  depreciation_rate: 0.20,
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

  // Register filters
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  // Depreciation year
  const [depYear, setDepYear] = useState(new Date().getFullYear())

  useEffect(() => { if (activeBranch) load() }, [activeBranch]) // eslint-disable-line

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

  function monthlyDep(asset: FixedAsset, monthIdx: number): number {
    if (!asset.is_depreciable) return 0
    const monthly = (Number(asset.total_cost) * Number(asset.depreciation_rate)) / 12
    if (asset.purchased_date) {
      const pd = new Date(asset.purchased_date)
      if (pd.getFullYear() > depYear) return 0
      if (pd.getFullYear() === depYear && pd.getMonth() > monthIdx) return 0
    }
    return monthly
  }

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
      depreciation_rate: a.depreciation_rate,
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
      depreciation_rate: info.rate,
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
      quantity:          Number(form.quantity),
      unit_cost:         Number(form.unit_cost),
      total_cost:        Number(form.total_cost),
      depreciation_rate: Number(form.depreciation_rate),
      is_depreciable:    form.is_depreciable,
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

  async function disposeAsset(id: string) {
    if (!confirm('Mark asset as disposed? This cannot be undone easily.')) return
    await supabase.from('fixed_assets').update({ status: 'disposed', date_disposed: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', id)
    toast('Asset marked disposed')
    load()
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <TopBar
        title="Fixed Assets"
        subtitle={`Asset register & depreciation — ${activeBranch?.location ?? ''}`}
      />

      <div className="p-8 flex-1 section-enter">

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-hsurface2 rounded-xl p-1 w-fit">
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
                { label: 'Annual Depreciation',   value: formatCurrency(totalDepAnnual),   sub: 'Straight-line method' },
                { label: 'Net Book Value',        value: formatCurrency(nbv),              sub: 'After annual dep.' },
                { label: 'Active Assets',         value: activeCount.toString(),           sub: `${assets.length - activeCount} disposed/maintenance` },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-2xl border border-hborder p-5 shadow-sm">
                  <p className="text-xs text-hmuted mb-1">{c.label}</p>
                  <p className="text-2xl font-bold text-dark-navy">{c.value}</p>
                  <p className="text-xs text-hmuted mt-1">{c.sub}</p>
                </div>
              ))}
            </div>

            {/* Category breakdown */}
            <div className="bg-white rounded-2xl border border-hborder shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-hborder">
                <h3 className="font-semibold text-dark-navy text-[15px]">By Category</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hborder bg-hsurface2">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Category</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Assets</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Total Cost</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Dep Rate</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Annual Dep</th>
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
                      <td className="text-right px-4 py-3.5 text-hmuted">{c.count}</td>
                      <td className="text-right px-4 py-3.5 font-medium text-htext">{formatCurrency(c.cost)}</td>
                      <td className="text-right px-4 py-3.5 text-hmuted">
                        {c.rate === 0 ? '—' : `${(c.rate * 100).toFixed(0)}%`}
                      </td>
                      <td className="text-right px-4 py-3.5 text-red-600">{c.dep > 0 ? formatCurrency(c.dep) : '—'}</td>
                      <td className="text-right px-6 py-3.5 font-semibold text-dark-navy">{formatCurrency(c.nbv)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-dark-navy/5 border-t-2 border-hborder">
                    <td className="px-6 py-3.5 font-bold text-dark-navy">Total</td>
                    <td className="text-right px-4 py-3.5 font-bold text-dark-navy">{assets.length}</td>
                    <td className="text-right px-4 py-3.5 font-bold text-dark-navy">{formatCurrency(totalFA)}</td>
                    <td className="text-right px-4 py-3.5" />
                    <td className="text-right px-4 py-3.5 font-bold text-red-600">{formatCurrency(totalDepAnnual)}</td>
                    <td className="text-right px-6 py-3.5 font-bold text-dark-navy">{formatCurrency(nbv)}</td>
                  </tr>
                </tfoot>
              </table>
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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hborder bg-hsurface2">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Category</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Qty</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Unit $</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Total $</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Dep%</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Purchased</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map((a, i) => {
                      const cat = catInfo(a.category)
                      return (
                        <tr key={a.id} className={cn('border-b border-hborder/60 hover:bg-hsurface2 transition-colors', i % 2 === 0 ? '' : 'bg-gray-50/30')}>
                          <td className="px-5 py-3">
                            <p className="font-medium text-htext leading-snug max-w-[260px]">{a.description}</p>
                            {a.type_brand && <p className="text-xs text-hmuted">{a.type_brand}</p>}
                            {a.asset_code && <p className="text-[10px] text-hmuted/70 font-mono">{a.asset_code}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.dot }} />
                              <span className="text-xs text-hmuted">{cat.label}</span>
                            </div>
                          </td>
                          <td className="text-right px-4 py-3 text-hmuted">{a.quantity}</td>
                          <td className="text-right px-4 py-3 text-hmuted">{Number(a.unit_cost) > 0 ? formatCurrency(a.unit_cost) : '—'}</td>
                          <td className="text-right px-4 py-3 font-semibold text-dark-navy">{formatCurrency(a.total_cost)}</td>
                          <td className="text-right px-4 py-3 text-hmuted">
                            {a.is_depreciable ? `${(Number(a.depreciation_rate) * 100).toFixed(0)}%` : <span className="text-xs italic">N/A</span>}
                          </td>
                          <td className="px-4 py-3 text-hmuted text-xs">
                            {a.purchased_date ? formatDate(a.purchased_date) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              'text-xs font-medium px-2 py-0.5 rounded-full',
                              a.status === 'active'      && 'bg-green-100 text-green-700',
                              a.status === 'disposed'    && 'bg-gray-100 text-gray-500',
                              a.status === 'maintenance' && 'bg-yellow-100 text-yellow-700',
                            )}>
                              {capitalize(a.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
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
                      <td className="px-5 py-3 font-bold text-dark-navy text-sm" colSpan={4}>
                        Subtotal ({filteredAssets.length} items)
                      </td>
                      <td className="text-right px-4 py-3 font-bold text-dark-navy">
                        {formatCurrency(filteredAssets.reduce((s, a) => s + Number(a.total_cost), 0))}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── DEPRECIATION SCHEDULE ─────────────────────────────────────── */}
        {tab === 'depreciation' && (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-hmuted font-medium">Year</label>
              <select
                value={depYear}
                onChange={e => setDepYear(Number(e.target.value))}
                className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
              >
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-sm text-hmuted ml-2">
                Annual depreciation: <span className="font-semibold text-dark-navy">{formatCurrency(totalDepAnnual)}</span>
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-hborder shadow-sm overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-hborder bg-hsurface2">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide sticky left-0 bg-hsurface2 min-w-[200px]">Description</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Cat.</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Total</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Rate</th>
                    {MONTHS.map(m => (
                      <th key={m} className="text-right px-3 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">{m}</th>
                    ))}
                    <th className="text-right px-4 py-3 text-xs font-semibold text-hmuted uppercase tracking-wide">Annual</th>
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
                      <tbody key={cat.value}>
                        {/* Category header */}
                        <tr className="bg-dark-navy/5 border-b border-hborder">
                          <td className="px-4 py-2 font-semibold text-dark-navy sticky left-0 bg-dark-navy/5" colSpan={4}>
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
                          <td className="text-right px-4 py-2 font-bold text-dark-navy">{formatCurrency(subtotal)}</td>
                        </tr>
                        {/* Asset rows */}
                        {rows.map(({ a, months, annual }, i) => (
                          <tr key={a.id} className={cn('border-b border-hborder/50 hover:bg-hsurface2', i % 2 === 0 ? '' : 'bg-gray-50/30')}>
                            <td className="px-4 py-2.5 sticky left-0 bg-inherit">
                              <p className="font-medium text-htext max-w-[190px] truncate">{a.description}</p>
                            </td>
                            <td className="px-3 py-2.5 text-hmuted">{(Number(a.depreciation_rate) * 100).toFixed(0)}%</td>
                            <td className="text-right px-3 py-2.5 text-hmuted">{formatCurrency(a.total_cost)}</td>
                            <td className="text-right px-3 py-2.5 text-hmuted">{(Number(a.depreciation_rate) * 100).toFixed(0)}%</td>
                            {months.map((m, idx) => (
                              <td key={idx} className="text-right px-3 py-2.5 text-hmuted">
                                {m > 0 ? formatCurrency(m) : <span className="text-hborder">—</span>}
                              </td>
                            ))}
                            <td className="text-right px-4 py-2.5 font-semibold text-dark-navy">{annual > 0 ? formatCurrency(annual) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-dark-navy text-white border-t-2 border-dark-navy">
                    <td className="px-4 py-3 font-bold sticky left-0 bg-dark-navy" colSpan={4}>Grand Total</td>
                    {MONTHS.map((_, idx) => {
                      const total = depAssets.reduce((s, a) => s + monthlyDep(a, idx), 0)
                      return (
                        <td key={idx} className="text-right px-3 py-3 font-semibold">
                          {total > 0 ? formatCurrency(total) : '—'}
                        </td>
                      )
                    })}
                    <td className="text-right px-4 py-3 font-bold">{formatCurrency(totalDepAnnual)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

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

          <div className="grid grid-cols-2 gap-3">
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

            {/* Depreciation Rate */}
            <div>
              <label className="block text-xs text-hmuted mb-1">Depreciation Rate</label>
              <select
                value={form.is_depreciable ? String(form.depreciation_rate) : 'none'}
                onChange={e => {
                  const v = e.target.value
                  if (v === 'none') setForm(f => ({ ...f, is_depreciable: false, depreciation_rate: 0 }))
                  else setForm(f => ({ ...f, is_depreciable: true, depreciation_rate: Number(v) }))
                }}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                <option value="none">Non-depreciable</option>
                <option value="0.05">5% — Buildings</option>
                <option value="0.1">10% — Machinery / Vehicle</option>
                <option value="0.2">20% — Furniture / Equipment</option>
                <option value="0.25">25% — Computer</option>
              </select>
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
            <div className="col-span-2">
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
          {form.total_cost > 0 && form.is_depreciable && (
            <div className="bg-hsurface2 rounded-xl px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-hmuted">Annual Depreciation</span>
                <span className="font-semibold text-dark-navy">
                  {formatCurrency(Number(form.total_cost) * Number(form.depreciation_rate))} / yr
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-hmuted">Monthly</span>
                <span className="text-htext">
                  {formatCurrency((Number(form.total_cost) * Number(form.depreciation_rate)) / 12)} / mo
                </span>
              </div>
            </div>
          )}

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
