'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, generateJournalEntryNumber, cn, todayISO } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { useBranch } from '@/context/BranchContext'
import type { ChartOfAccount, InventoryItem, InventoryTransaction, InventoryCategory } from '@/types'

const INVENTORY_CATEGORIES: { value: InventoryCategory; label: string; defaultAccount: string }[] = [
  { value: 'food',     label: 'Food & Grocery', defaultAccount: '5300' },
  { value: 'cleaning', label: 'Cleaning',       defaultAccount: '5700' },
  { value: 'laundry',  label: 'Laundry',        defaultAccount: '5700' },
  { value: 'beverage', label: 'Beverages',      defaultAccount: '5900' },
  { value: 'fuel',     label: 'Gas / Fuel',     defaultAccount: '5500' },
  { value: 'other',    label: 'Other',          defaultAccount: '6000' },
]
const ADJUSTMENT_ACCOUNT_CODE = '6000' // stock-count corrections post here regardless of item category — they're anomalies, not normal consumption

const todayStr = () => todayISO()
const input = 'w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg'

export default function InventoryPage() {
  const supabase = createClient()
  const { activeBranch } = useBranch()

  const [accounts, setAccounts] = useState<ChartOfAccount[]>([])
  const [invItems, setInvItems] = useState<InventoryItem[]>([])
  const [invTxns, setInvTxns] = useState<InventoryTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [invItemFormOpen, setInvItemFormOpen] = useState(false)
  const [editInvItemId, setEditInvItemId] = useState<string | null>(null)
  const [invItemForm, setInvItemForm] = useState({
    name: '', unit: 'unit', category: 'other' as InventoryCategory,
    expense_account_code: '6000', reorder_point: '', last_unit_cost: '',
    opening_qty: '', opening_offset_account_id: '',
  })
  const [invItemSaving, setInvItemSaving] = useState(false)

  const [invPurchaseOpen, setInvPurchaseOpen] = useState(false)
  const [invPurchaseItemId, setInvPurchaseItemId] = useState<string | null>(null)
  const [invPurchaseForm, setInvPurchaseForm] = useState({ quantity: '', unit_cost: '', date: todayStr(), notes: '' })
  const [invPurchaseSaving, setInvPurchaseSaving] = useState(false)

  const [invUsageOpen, setInvUsageOpen] = useState(false)
  const [invUsageItemId, setInvUsageItemId] = useState<string | null>(null)
  const [invUsageForm, setInvUsageForm] = useState({ type: 'consumption' as 'consumption' | 'adjustment_in' | 'adjustment_out', quantity: '', date: todayStr(), notes: '' })
  const [invUsageSaving, setInvUsageSaving] = useState(false)

  useEffect(() => {
    if (activeBranch) { loadAccounts(); loadInventory() }
  }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAccounts() {
    if (!activeBranch) return
    const { data } = await supabase.from('chart_of_accounts').select('*').eq('branch_id', activeBranch.id).order('code')
    const accts = (data ?? []) as ChartOfAccount[]
    setAccounts(accts)
    const requiredCodes = ['1300', '1011', '1010']
    const missing = requiredCodes.filter(c => !accts.find(a => a.code === c && a.is_active))
    if (missing.filter(c => c !== '1010' && c !== '1011').length || (!accts.find(a => (a.code === '1010' || a.code === '1011') && a.is_active))) {
      if (missing.includes('1300')) toast('Missing 1300 (Inventory & Supplies) in Chart of Accounts — inventory journal entries will be skipped', 'error')
    }
  }

  async function loadInventory() {
    if (!activeBranch) return
    const [itemsRes, txnsRes] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('branch_id', activeBranch.id).order('name'),
      supabase.from('inventory_transactions').select('*').eq('branch_id', activeBranch.id).order('transaction_date', { ascending: false }),
    ])
    setInvItems((itemsRes.data ?? []) as InventoryItem[])
    setInvTxns((txnsRes.data ?? []) as InventoryTransaction[])
    setLoading(false)
  }

  function invOnHand(itemId: string): number {
    return invTxns.filter(t => t.item_id === itemId).reduce((s, t) => {
      const sign = t.transaction_type === 'purchase' || t.transaction_type === 'adjustment_in' || t.transaction_type === 'opening_balance' ? 1 : -1
      return s + sign * Number(t.quantity)
    }, 0)
  }

  const expenseAccounts = accounts.filter(a => a.type === 'expense' && a.is_active)

  // ── Items ──────────────────────────────────────────────────────

  function openAddInventoryItem() {
    setEditInvItemId(null)
    setInvItemForm({ name: '', unit: 'unit', category: 'other', expense_account_code: '6000', reorder_point: '', last_unit_cost: '', opening_qty: '', opening_offset_account_id: '' })
    setInvItemFormOpen(true)
  }

  function openEditInventoryItem(item: InventoryItem) {
    setEditInvItemId(item.id)
    setInvItemForm({
      name: item.name, unit: item.unit, category: item.category,
      expense_account_code: item.expense_account_code,
      reorder_point: String(item.reorder_point), last_unit_cost: String(item.last_unit_cost),
      opening_qty: '', opening_offset_account_id: '',
    })
    setInvItemFormOpen(true)
  }

  function handleInvCategoryChange(category: InventoryCategory) {
    const preset = INVENTORY_CATEGORIES.find(c => c.value === category)
    setInvItemForm(f => ({ ...f, category, expense_account_code: preset?.defaultAccount ?? f.expense_account_code }))
  }

  async function saveInventoryItem() {
    if (!invItemForm.name.trim() || !activeBranch) { toast('Item name is required', 'error'); return }
    const openingQty = Number(invItemForm.opening_qty) || 0
    if (!editInvItemId && openingQty > 0 && !invItemForm.opening_offset_account_id) {
      toast('Offset account required for opening stock', 'error'); return
    }
    setInvItemSaving(true)
    const payload = {
      name: invItemForm.name.trim(),
      unit: invItemForm.unit.trim() || 'unit',
      category: invItemForm.category,
      expense_account_code: invItemForm.expense_account_code,
      reorder_point: Number(invItemForm.reorder_point) || 0,
      last_unit_cost: Number(invItemForm.last_unit_cost) || 0,
      updated_at: new Date().toISOString(),
    }

    if (editInvItemId) {
      const { error } = await supabase.from('inventory_items').update(payload).eq('id', editInvItemId)
      setInvItemSaving(false)
      if (error) { toast(error.message, 'error'); return }
      toast('Item updated')
      setInvItemFormOpen(false)
      loadInventory()
      return
    }

    const { data: newItem, error } = await supabase.from('inventory_items').insert({ ...payload, branch_id: activeBranch.id }).select().single()
    if (error || !newItem) { toast(error?.message ?? 'Failed to add item', 'error'); setInvItemSaving(false); return }

    if (openingQty > 0) {
      const invAcct = accounts.find(a => a.code === '1300')
      const unitCost = Number(invItemForm.last_unit_cost) || 0
      const amount = Math.round(openingQty * unitCost * 100) / 100
      let jeId: string | null = null

      if (invAcct && amount > 0) {
        const { data: je } = await supabase.from('journal_entries').insert({
          entry_number: generateJournalEntryNumber(), entry_date: todayStr(),
          reference: null, reference_type: 'opening_balance',
          description: `Opening stock — ${newItem.name} (${openingQty} ${newItem.unit})`,
          branch_id: activeBranch.id,
        }).select().single()
        if (je) {
          await supabase.from('journal_entry_lines').insert([
            { entry_id: je.id, account_id: invAcct.id, description: 'Opening Stock', debit: amount, credit: 0 },
            { entry_id: je.id, account_id: invItemForm.opening_offset_account_id, description: 'Opening Stock Offset', debit: 0, credit: amount },
          ])
          jeId = je.id
        }
      }
      // If there's no cost (or 1300 is missing), still record the quantity so
      // on-hand is right — just without a JE, since there's nothing to value it at.
      await supabase.from('inventory_transactions').insert({
        branch_id: activeBranch.id, item_id: newItem.id, transaction_type: 'opening_balance',
        quantity: openingQty, unit_cost: unitCost, notes: 'Opening stock on hand',
        transaction_date: todayStr(), journal_entry_id: jeId,
      })
    }

    toast('Item added')
    setInvItemSaving(false)
    setInvItemFormOpen(false)
    loadInventory()
  }

  async function toggleInventoryItemActive(item: InventoryItem) {
    const { error } = await supabase.from('inventory_items').update({ is_active: !item.is_active }).eq('id', item.id)
    if (error) { toast(error.message, 'error'); return }
    loadInventory()
  }

  // ── Purchase ───────────────────────────────────────────────────

  function openPurchaseModal(itemId?: string) {
    setInvPurchaseItemId(itemId ?? invItems[0]?.id ?? null)
    setInvPurchaseForm({ quantity: '', unit_cost: '', date: todayStr(), notes: '' })
    setInvPurchaseOpen(true)
  }

  async function savePurchase() {
    const item = invItems.find(i => i.id === invPurchaseItemId)
    const qty = Number(invPurchaseForm.quantity)
    const unitCost = Number(invPurchaseForm.unit_cost)
    if (!item) { toast('Select an item', 'error'); return }
    if (!(qty > 0)) { toast('Quantity must be greater than 0', 'error'); return }
    if (!activeBranch) return
    setInvPurchaseSaving(true)

    const cashAcct = accounts.find(a => a.code === '1011') ?? accounts.find(a => a.code === '1010')
    const invAcct  = accounts.find(a => a.code === '1300')
    if (!cashAcct || !invAcct) {
      toast('Missing 1011 (Petty Cash) or 1300 (Inventory & Supplies) in Chart of Accounts', 'error')
      setInvPurchaseSaving(false); return
    }
    const amount = Math.round(qty * unitCost * 100) / 100

    const { data: pcRow, error: pcErr } = await supabase.from('petty_cash_transactions').insert({
      transaction_date: invPurchaseForm.date,
      description: `Stock purchase — ${item.name} (${qty} ${item.unit})`,
      category: 'Inventory Purchase', amount, transaction_type: 'out',
      branch_id: activeBranch.id,
    }).select().single()
    if (pcErr) { toast(pcErr.message, 'error'); setInvPurchaseSaving(false); return }

    const { data: je, error: jeErr } = await supabase.from('journal_entries').insert({
      entry_number: generateJournalEntryNumber(), entry_date: invPurchaseForm.date,
      reference: null, reference_type: 'inventory_purchase',
      description: `Stock purchase — ${item.name} (${qty} ${item.unit})`,
      branch_id: activeBranch.id,
    }).select().single()
    if (jeErr || !je) {
      await supabase.from('petty_cash_transactions').delete().eq('id', pcRow.id)
      toast(jeErr?.message ?? 'Failed to create journal entry', 'error'); setInvPurchaseSaving(false); return
    }
    const { error: lineErr } = await supabase.from('journal_entry_lines').insert([
      { entry_id: je.id, account_id: invAcct.id,  description: item.name, debit: amount, credit: 0 },
      { entry_id: je.id, account_id: cashAcct.id, description: item.name, debit: 0, credit: amount },
    ])
    if (lineErr) {
      await supabase.from('journal_entries').delete().eq('id', je.id)
      await supabase.from('petty_cash_transactions').delete().eq('id', pcRow.id)
      toast('Failed to save journal lines', 'error'); setInvPurchaseSaving(false); return
    }
    await supabase.from('petty_cash_transactions').update({ journal_entry_id: je.id }).eq('id', pcRow.id)

    await supabase.from('inventory_transactions').insert({
      branch_id: activeBranch.id, item_id: item.id, transaction_type: 'purchase',
      quantity: qty, unit_cost: unitCost, notes: invPurchaseForm.notes || null,
      transaction_date: invPurchaseForm.date,
      petty_cash_transaction_id: pcRow.id, journal_entry_id: je.id,
    })
    await supabase.from('inventory_items').update({ last_unit_cost: unitCost, updated_at: new Date().toISOString() }).eq('id', item.id)

    toast('Purchase recorded')
    setInvPurchaseSaving(false); setInvPurchaseOpen(false)
    loadInventory()
  }

  // ── Usage / Adjustment ────────────────────────────────────────

  function openUsageModal(itemId?: string) {
    setInvUsageItemId(itemId ?? invItems[0]?.id ?? null)
    setInvUsageForm({ type: 'consumption', quantity: '', date: todayStr(), notes: '' })
    setInvUsageOpen(true)
  }

  async function saveUsage() {
    const item = invItems.find(i => i.id === invUsageItemId)
    const qty = Number(invUsageForm.quantity)
    if (!item) { toast('Select an item', 'error'); return }
    if (!(qty > 0)) { toast('Quantity must be greater than 0', 'error'); return }
    if (!activeBranch) return
    setInvUsageSaving(true)

    const invAcct = accounts.find(a => a.code === '1300')
    const targetCode = invUsageForm.type === 'consumption' ? item.expense_account_code : ADJUSTMENT_ACCOUNT_CODE
    const targetAcct = accounts.find(a => a.code === targetCode)
    if (!invAcct || !targetAcct) {
      toast(`Missing 1300 or ${targetCode} in Chart of Accounts`, 'error')
      setInvUsageSaving(false); return
    }
    if (item.last_unit_cost <= 0) {
      toast('This item has no purchase cost on record — usage will post at $0', 'info')
    }
    const amount = Math.round(qty * item.last_unit_cost * 100) / 100
    const isOut = invUsageForm.type === 'consumption' || invUsageForm.type === 'adjustment_out'
    const label = invUsageForm.type === 'consumption' ? 'Stock used' : invUsageForm.type === 'adjustment_out' ? 'Stock count — shortage' : 'Stock count — found extra'

    const { data: je, error: jeErr } = await supabase.from('journal_entries').insert({
      entry_number: generateJournalEntryNumber(), entry_date: invUsageForm.date,
      reference: null, reference_type: invUsageForm.type === 'consumption' ? 'inventory_consumption' : 'inventory_adjustment',
      description: `${label} — ${item.name} (${qty} ${item.unit})`,
      branch_id: activeBranch.id,
    }).select().single()
    if (jeErr || !je) { toast(jeErr?.message ?? 'Failed to create journal entry', 'error'); setInvUsageSaving(false); return }

    const lines = isOut
      ? [
          { entry_id: je.id, account_id: targetAcct.id, description: item.name, debit: amount, credit: 0 },
          { entry_id: je.id, account_id: invAcct.id,    description: item.name, debit: 0, credit: amount },
        ]
      : [
          { entry_id: je.id, account_id: invAcct.id,    description: item.name, debit: amount, credit: 0 },
          { entry_id: je.id, account_id: targetAcct.id, description: item.name, debit: 0, credit: amount },
        ]
    const { error: lineErr } = await supabase.from('journal_entry_lines').insert(lines)
    if (lineErr) {
      await supabase.from('journal_entries').delete().eq('id', je.id)
      toast('Failed to save journal lines', 'error'); setInvUsageSaving(false); return
    }

    await supabase.from('inventory_transactions').insert({
      branch_id: activeBranch.id, item_id: item.id, transaction_type: invUsageForm.type,
      quantity: qty, unit_cost: item.last_unit_cost, notes: invUsageForm.notes || null,
      transaction_date: invUsageForm.date, journal_entry_id: je.id,
    })

    toast('Recorded')
    setInvUsageSaving(false); setInvUsageOpen(false)
    loadInventory()
  }

  // ── Render ─────────────────────────────────────────────────────

  const activeItems = invItems.filter(i => i.is_active)
  const lowStock = activeItems.filter(i => invOnHand(i.id) <= i.reorder_point)
  const totalValue = activeItems.reduce((s, i) => s + invOnHand(i.id) * i.last_unit_cost, 0)
  const filteredItems = invItems.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <TopBar title="Inventory" subtitle={`Stock & consumables — ${activeBranch?.location ?? ''}`} />
      <div className="p-4 sm:p-6 lg:p-8 flex-1 section-enter">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          {[
            { label: 'Active Items', value: String(activeItems.length), color: '#583808' },
            { label: 'Low Stock',    value: String(lowStock.length),    color: lowStock.length > 0 ? '#B83232' : '#1A7A4A' },
            { label: 'Total Value',  value: formatCurrency(totalValue), color: '#F05830' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-hborder rounded-2xl p-4 shadow-card relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: s.color }} />
              <p className="text-[11px] text-hmuted uppercase tracking-wide pl-2">{s.label}</p>
              <p className="font-serif text-xl sm:text-2xl text-dark-navy mt-1 pl-2 truncate" title={s.value}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search items…"
              className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy w-full sm:w-56"
            />
            <p className="text-sm text-hmuted whitespace-nowrap">{activeItems.length} active · {invItems.length - activeItems.length} inactive</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {invItems.length > 0 && <Button variant="ghost" onClick={() => openUsageModal()}>Record Usage</Button>}
            {invItems.length > 0 && <Button variant="ghost" onClick={() => openPurchaseModal()}>Record Purchase</Button>}
            <Button onClick={openAddInventoryItem}>+ Add Item</Button>
          </div>
        </div>

        <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead><tr className="bg-hsurface2">
              {([['Item', 'w-[19%]', 'left'], ['Category', 'w-[10%]', 'left'], ['On Hand', 'w-[11%]', 'right'], ['Unit Cost', 'w-[9%]', 'right'], ['Value', 'w-[10%]', 'right'], ['Expense Acct', 'w-[16%]', 'left'], ['Status', 'w-[7%]', 'left'], ['Actions', 'w-[18%]', 'left']] as const).map(([h, w, align]) => (
                <th key={h} className={cn('px-3 py-2.5 text-[11px] font-semibold text-hmuted uppercase tracking-wide', align === 'right' ? 'text-right' : 'text-left', w)}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-hmuted">Loading…</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-hmuted">{invItems.length === 0 ? 'No inventory items yet. Click + Add Item to start tracking stock.' : 'No items match your search.'}</td></tr>
              ) : filteredItems.map(item => {
                const onHand = invOnHand(item.id)
                const low = onHand <= item.reorder_point
                const acct = accounts.find(a => a.code === item.expense_account_code)
                return (
                  <tr key={item.id} className={cn('border-t border-hborder hover:bg-hbg/40', !item.is_active && 'opacity-50')}>
                    <td className="px-3 py-2 h-[52px] align-middle font-medium text-htext truncate" title={item.name}>{item.name}</td>
                    <td className="px-3 py-2 h-[52px] align-middle text-xs text-hmuted capitalize truncate">{INVENTORY_CATEGORIES.find(c => c.value === item.category)?.label ?? item.category}</td>
                    <td className="px-3 py-2 h-[52px] align-middle text-right whitespace-nowrap">
                      <span className={cn('font-semibold tabular-nums', low ? 'text-red-600' : 'text-htext')}>{onHand} {item.unit}</span>
                      {low && <span className="ml-1.5 text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold uppercase align-middle">Low</span>}
                    </td>
                    <td className="px-3 py-2 h-[52px] align-middle text-right text-hmuted tabular-nums whitespace-nowrap">{formatCurrency(item.last_unit_cost)}</td>
                    <td className="px-3 py-2 h-[52px] align-middle text-right font-medium text-dark-navy tabular-nums whitespace-nowrap">{formatCurrency(onHand * item.last_unit_cost)}</td>
                    <td className="px-3 py-2 h-[52px] align-middle text-xs text-hmuted font-mono whitespace-nowrap truncate" title={acct?.name}>{item.expense_account_code}{acct ? ` — ${acct.name}` : ''}</td>
                    <td className="px-3 py-2 h-[52px] align-middle">
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap', item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-2 h-[52px] align-middle whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-2.5 items-center flex-shrink-0">
                          <button onClick={() => openPurchaseModal(item.id)} className="text-xs font-medium text-navy hover:underline">Buy</button>
                          <button onClick={() => openUsageModal(item.id)} className="text-xs font-medium text-navy hover:underline">Use</button>
                        </div>
                        <div className="w-px h-4 bg-hborder flex-shrink-0" />
                        <div className="flex gap-2.5 items-center flex-shrink-0">
                          <button onClick={() => openEditInventoryItem(item)} className="text-xs text-hmuted hover:text-htext hover:underline">Edit</button>
                          <button onClick={() => toggleInventoryItemActive(item)} className="text-xs text-hmuted hover:text-htext hover:underline">
                            {item.is_active ? 'Deactivate' : 'Activate'}
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
      </div>

      {/* ── Add/Edit Item ── */}
      <Modal open={invItemFormOpen} onClose={() => setInvItemFormOpen(false)} title={editInvItemId ? 'Edit Item' : 'Add Inventory Item'} size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-hmuted mb-1">Item Name *</label>
            <input value={invItemForm.name} onChange={e => setInvItemForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Toilet Paper" className={input} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Unit</label>
              <input value={invItemForm.unit} onChange={e => setInvItemForm(f => ({ ...f, unit: e.target.value }))} placeholder="pack, kg, bottle…" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Category</label>
              <select value={invItemForm.category} onChange={e => handleInvCategoryChange(e.target.value as InventoryCategory)} className={input}>
                {INVENTORY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Expense Account (used when stock is consumed)</label>
            <select value={invItemForm.expense_account_code} onChange={e => setInvItemForm(f => ({ ...f, expense_account_code: e.target.value }))} className={input}>
              {expenseAccounts.map(a => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
            <p className="text-[10px] text-hmuted mt-1">Defaults from category — change if this item doesn't fit.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Reorder Point</label>
              <input type="number" min={0} step={0.01} value={invItemForm.reorder_point} onChange={e => setInvItemForm(f => ({ ...f, reorder_point: e.target.value }))} placeholder="0" className={input} />
              <p className="text-[10px] text-hmuted mt-1">Flags Low Stock at or below this quantity.</p>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Starting Unit Cost ($)</label>
              <input type="number" min={0} step={0.01} value={invItemForm.last_unit_cost} onChange={e => setInvItemForm(f => ({ ...f, last_unit_cost: e.target.value }))} placeholder="0.00" className={input} />
              <p className="text-[10px] text-hmuted mt-1">Updated automatically on each purchase.</p>
            </div>
          </div>
          {!editInvItemId && (
            <div className="mt-4 pt-4 border-t border-hborder/50 space-y-3">
              <p className="text-xs font-semibold text-navy uppercase tracking-wide">Opening Stock (optional)</p>
              <p className="text-[10px] text-hmuted -mt-2">Already have some on hand when you start tracking this item? Declare it here — this is not a purchase, so no cash moves.</p>
              <div>
                <label className="block text-xs text-hmuted mb-1">Quantity Already On Hand</label>
                <input type="number" min={0} step={0.01} value={invItemForm.opening_qty} onChange={e => setInvItemForm(f => ({ ...f, opening_qty: e.target.value }))} placeholder="0" className={input} />
              </div>
              {Number(invItemForm.opening_qty) > 0 && (
                <div>
                  <label className="block text-xs text-hmuted mb-1">Offset Account (Equity)</label>
                  <select value={invItemForm.opening_offset_account_id} onChange={e => setInvItemForm(f => ({ ...f, opening_offset_account_id: e.target.value }))} className={input}>
                    <option value="">Select offset account…</option>
                    {accounts.filter(a => a.is_active && a.type === 'equity').map(a => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-hmuted mt-1">Posts DR 1300 Inventory & Supplies / CR this account, valued at Starting Unit Cost.</p>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setInvItemFormOpen(false)}>Cancel</Button>
            <Button onClick={saveInventoryItem} disabled={invItemSaving}>{invItemSaving ? 'Saving…' : editInvItemId ? 'Save Changes' : 'Add Item'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Record Purchase ── */}
      <Modal open={invPurchaseOpen} onClose={() => setInvPurchaseOpen(false)} title="Record Stock Purchase" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-hmuted mb-1">Item</label>
            <select value={invPurchaseItemId ?? ''} onChange={e => setInvPurchaseItemId(e.target.value)} className={input}>
              {invItems.filter(i => i.is_active).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Quantity</label>
              <input type="number" min={0} step={0.01} value={invPurchaseForm.quantity} onChange={e => setInvPurchaseForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Unit Cost ($)</label>
              <input type="number" min={0} step={0.01} value={invPurchaseForm.unit_cost} onChange={e => setInvPurchaseForm(f => ({ ...f, unit_cost: e.target.value }))} placeholder="0.00" className={input} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Date</label>
            <input type="date" value={invPurchaseForm.date} onChange={e => setInvPurchaseForm(f => ({ ...f, date: e.target.value }))} className={input} />
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Notes</label>
            <input value={invPurchaseForm.notes} onChange={e => setInvPurchaseForm(f => ({ ...f, notes: e.target.value }))} placeholder="Supplier, receipt #…" className={input} />
          </div>
          <p className="text-[10px] text-hmuted">
            Creates a Petty Cash payment and posts DR 1300 Inventory & Supplies / CR {(() => { const a = accounts.find(x => x.code === '1011') ?? accounts.find(x => x.code === '1010'); return a ? `${a.code} ${a.name}` : '1011 Petty Cash' })()}.
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setInvPurchaseOpen(false)}>Cancel</Button>
            <Button onClick={savePurchase} disabled={invPurchaseSaving}>{invPurchaseSaving ? 'Saving…' : 'Record Purchase'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Record Usage / Adjustment ── */}
      <Modal open={invUsageOpen} onClose={() => setInvUsageOpen(false)} title="Record Stock Usage" size="sm">
        <div className="space-y-3">
          <div className="flex gap-1 bg-hsurface2 rounded-xl p-1">
            {([
              ['consumption', 'Used'],
              ['adjustment_out', 'Shortage'],
              ['adjustment_in', 'Found Extra'],
            ] as const).map(([v, l]) => (
              <button key={v} onClick={() => setInvUsageForm(f => ({ ...f, type: v }))}
                className={cn('flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors', invUsageForm.type === v ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted')}
              >{l}</button>
            ))}
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Item</label>
            <select value={invUsageItemId ?? ''} onChange={e => setInvUsageItemId(e.target.value)} className={input}>
              {invItems.filter(i => i.is_active).map(i => <option key={i.id} value={i.id}>{i.name} ({invOnHand(i.id)} {i.unit} on hand)</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Quantity</label>
              <input type="number" min={0} step={0.01} value={invUsageForm.quantity} onChange={e => setInvUsageForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" className={input} />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Date</label>
              <input type="date" value={invUsageForm.date} onChange={e => setInvUsageForm(f => ({ ...f, date: e.target.value }))} className={input} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Notes</label>
            <input value={invUsageForm.notes} onChange={e => setInvUsageForm(f => ({ ...f, notes: e.target.value }))} placeholder="What was it used for, or why the discrepancy?" className={input} />
          </div>
          <p className="text-[10px] text-hmuted">
            {invUsageForm.type === 'consumption'
              ? `Posts DR ${invItems.find(i => i.id === invUsageItemId)?.expense_account_code ?? '—'} (item's expense account) / CR 1300 Inventory & Supplies, valued at last purchase cost.`
              : `Stock count corrections post against ${ADJUSTMENT_ACCOUNT_CODE} — Other Expense, not the item's normal expense account.`}
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setInvUsageOpen(false)}>Cancel</Button>
            <Button onClick={saveUsage} disabled={invUsageSaving}>{invUsageSaving ? 'Saving…' : 'Record'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
