'use client'
import React, { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/Toast'
import { formatCurrency, formatDateTime, todayISO } from '@/lib/utils'
import type { HotelSettings, ServiceCatalogItem, ServiceCatalogCategory, AuditLog, AuditAction } from '@/types'
import { useBranch } from '@/context/BranchContext'
import { useCurrentStaff } from '@/hooks/useCurrentStaff'

// v1 audited tables — matches migration 045_audit_logs.sql's trigger list.
const AUDITED_TABLES = [
  'journal_entries', 'invoices', 'reservations', 'fixed_assets',
  'bills', 'bill_payments', 'deposit_receipts', 'petty_cash_transactions',
  'payment_transactions', 'chart_of_accounts', 'accounting_periods',
  'staff', 'depreciation_runs', 'depreciation_entries',
]
const AUDIT_PAGE_SIZE = 50

function diffFields(oldData: Record<string, any> | null | undefined, newData: Record<string, any> | null | undefined) {
  const keys = new Set([...(oldData ? Object.keys(oldData) : []), ...(newData ? Object.keys(newData) : [])])
  const out: { key: string; oldVal: any; newVal: any }[] = []
  keys.forEach(k => {
    const ov = oldData?.[k]
    const nv = newData?.[k]
    if (JSON.stringify(ov) !== JSON.stringify(nv)) out.push({ key: k, oldVal: ov, newVal: nv })
  })
  return out.sort((a, b) => a.key.localeCompare(b.key))
}

function fmtAuditVal(v: any): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const NOTIFICATION_EVENTS = [
  { key: 'new_reservation', label: 'New Reservation' },
  { key: 'checkin', label: 'Guest Check-in' },
  { key: 'checkout', label: 'Guest Check-out' },
  { key: 'payment', label: 'Payment Received' },
  { key: 'housekeeping_complete', label: 'Housekeeping Completed' },
  { key: 'room_maintenance', label: 'Room Maintenance Alert' },
  { key: 'cancellation', label: 'Reservation Cancelled' },
]

interface PaymentMethod {
  id: string
  name: string
  value: string
  is_cash: boolean
  account_code: string
  is_active: boolean
  sort_order: number
}

export default function SettingsPage() {
  const supabase = createClient()
  const { activeBranch, refreshHotelSettings } = useBranch()
  const { isAdmin } = useCurrentStaff()
  const [settingsTab, setSettingsTab] = useState<'general' | 'audit'>('general')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message?: string; confirmLabel?: string; variant?: 'default' | 'danger'; onConfirm: () => void } | null>(null)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [testEvent, setTestEvent] = useState('new_reservation')
  const [settingsId, setSettingsId] = useState<string | null>(null)

  // Payment Methods state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [pmModalOpen, setPmModalOpen] = useState(false)
  const [editingPm, setEditingPm] = useState<PaymentMethod | null>(null)
  const [pmForm, setPmForm] = useState({ name: '', value: '', account_code: '1020' })
  const [pmSaving, setPmSaving] = useState(false)
  const [coaAccounts, setCoaAccounts] = useState<{ id: string; code: string; name: string }[]>([])

  // Service Catalog state
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogItem[]>([])
  const [scCategoryTab, setScCategoryTab] = useState<ServiceCatalogCategory>('activity')
  const [scModalOpen, setScModalOpen] = useState(false)
  const [editingSc, setEditingSc] = useState<ServiceCatalogItem | null>(null)
  const [scForm, setScForm] = useState({
    category: 'activity' as ServiceCatalogCategory,
    code: '', name_en: '', name_kh: '', details: '',
    unit_price: 0, revenue_account_code: '4300', cost_account_code: '6000',
  })
  const [scSaving, setScSaving] = useState(false)
  const [revenueAccounts, setRevenueAccounts] = useState<{ id: string; code: string; name: string }[]>([])
  const [expenseAccounts, setExpenseAccounts] = useState<{ id: string; code: string; name: string }[]>([])

  // Audit Log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditStaff, setAuditStaff] = useState<{ id: string; full_name: string; auth_user_id: string | null }[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditPage, setAuditPage] = useState(0)
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null)
  const [auditFilter, setAuditFilter] = useState({
    table: 'all', action: 'all' as 'all' | AuditAction, performedBy: 'all',
    dateFrom: '', dateTo: '',
  })
  const [form, setForm] = useState({
    hotel_name: 'OnlyOne Homestay',
    hotel_address: '',
    hotel_phone: '',
    hotel_email: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
    telegram_enabled: false,
    notification_events: ['new_reservation', 'checkin', 'checkout', 'payment'] as string[],
    tax_rate: 10,
    currency: 'USD',
    check_in_time: '14:00',
    check_out_time: '12:00',
    bank_name: '',
    bank_account_name: '',
    bank_account_number: '',
  })

  useEffect(() => { if (activeBranch) { loadSettings(); loadPaymentMethods(); loadCoaAccounts(); loadServiceCatalog(); loadRevenueExpenseAccounts() } }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (settingsTab === 'audit' && isAdmin && activeBranch) loadAuditLogs()
  }, [settingsTab, isAdmin, activeBranch, auditFilter, auditPage]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (settingsTab === 'audit' && isAdmin) {
      supabase.from('staff').select('id, full_name, auth_user_id').order('full_name')
        .then(({ data }) => setAuditStaff((data ?? []) as any))
    }
  }, [settingsTab, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setAuditPage(0) }, [auditFilter])

  async function loadAuditLogs() {
    if (!activeBranch) return
    setAuditLoading(true)
    let query = supabase.from('audit_logs').select('*', { count: 'exact' }).eq('branch_id', activeBranch.id)
    if (auditFilter.table !== 'all') query = query.eq('table_name', auditFilter.table)
    if (auditFilter.action !== 'all') query = query.eq('action', auditFilter.action)
    if (auditFilter.performedBy === 'system') query = query.is('performed_by', null)
    else if (auditFilter.performedBy !== 'all') query = query.eq('performed_by', auditFilter.performedBy)
    if (auditFilter.dateFrom) query = query.gte('created_at', `${auditFilter.dateFrom}T00:00:00`)
    if (auditFilter.dateTo) query = query.lte('created_at', `${auditFilter.dateTo}T23:59:59`)
    const from = auditPage * AUDIT_PAGE_SIZE
    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + AUDIT_PAGE_SIZE - 1)
    if (error) { toast(`Failed to load audit log: ${error.message}`, 'error'); setAuditLoading(false); return }
    setAuditLogs((data ?? []) as AuditLog[])
    setAuditTotal(count ?? 0)
    setAuditLoading(false)
  }

  function auditStaffName(performedBy: string | null | undefined): string {
    if (!performedBy) return 'System (direct correction)'
    const s = auditStaff.find(st => st.auth_user_id === performedBy)
    return s?.full_name ?? 'Unknown user'
  }

  async function loadRevenueExpenseAccounts() {
    if (!activeBranch) return
    const [rev, exp] = await Promise.all([
      supabase.from('chart_of_accounts').select('id, code, name').eq('branch_id', activeBranch.id).eq('is_active', true).eq('type', 'revenue').order('code'),
      supabase.from('chart_of_accounts').select('id, code, name').eq('branch_id', activeBranch.id).eq('is_active', true).eq('type', 'expense').order('code'),
    ])
    setRevenueAccounts((rev.data ?? []) as { id: string; code: string; name: string }[])
    setExpenseAccounts((exp.data ?? []) as { id: string; code: string; name: string }[])
  }

  async function loadServiceCatalog() {
    if (!activeBranch) return
    const { data } = await supabase.from('service_catalog_items').select('*').eq('branch_id', activeBranch.id).order('category').order('sort_order')
    setServiceCatalog((data ?? []) as ServiceCatalogItem[])
  }

  function openAddSc() {
    setEditingSc(null)
    setScForm({ category: scCategoryTab, code: '', name_en: '', name_kh: '', details: '', unit_price: 0, revenue_account_code: scCategoryTab === 'fnb' ? '4100' : '4200', cost_account_code: scCategoryTab === 'fnb' ? '5300' : '5400' })
    setScModalOpen(true)
  }

  function openEditSc(item: ServiceCatalogItem) {
    setEditingSc(item)
    setScForm({
      category: item.category, code: item.code, name_en: item.name_en, name_kh: item.name_kh ?? '', details: item.details ?? '',
      unit_price: item.unit_price, revenue_account_code: item.revenue_account_code, cost_account_code: item.cost_account_code,
    })
    setScModalOpen(true)
  }

  async function saveSc() {
    if (!scForm.code.trim()) { toast('Code is required', 'error'); return }
    if (!scForm.name_en.trim()) { toast('Name is required', 'error'); return }
    if (!activeBranch) return
    const codeConflict = serviceCatalog.find(i => i.code === scForm.code.trim() && i.id !== editingSc?.id)
    if (codeConflict) { toast(`Code "${scForm.code.trim()}" is already used by "${codeConflict.name_en}"`, 'error'); return }
    setScSaving(true)
    const payload = {
      category: scForm.category,
      code: scForm.code.trim(),
      name_en: scForm.name_en.trim(),
      name_kh: scForm.name_kh.trim() || null,
      details: scForm.details.trim() || null,
      unit_price: Number(scForm.unit_price),
      revenue_account_code: scForm.revenue_account_code,
      cost_account_code: scForm.cost_account_code,
      updated_at: new Date().toISOString(),
    }
    if (editingSc) {
      const { error } = await supabase.from('service_catalog_items').update(payload).eq('id', editingSc.id)
      if (error) { toast(error.message, 'error'); setScSaving(false); return }
      toast('Catalog item updated')
    } else {
      const nextOrder = serviceCatalog.filter(i => i.category === scForm.category).length + 1
      const { error } = await supabase.from('service_catalog_items').insert({
        ...payload, branch_id: activeBranch.id, is_active: true, sort_order: nextOrder,
      })
      if (error) { toast(error.message, 'error'); setScSaving(false); return }
      toast('Catalog item added')
    }
    setScSaving(false)
    setScModalOpen(false)
    loadServiceCatalog()
  }

  async function toggleScActive(item: ServiceCatalogItem) {
    const { error } = await supabase.from('service_catalog_items').update({ is_active: !item.is_active, updated_at: new Date().toISOString() }).eq('id', item.id)
    if (error) toast(`Failed to update: ${error.message}`, 'error')
    loadServiceCatalog()
  }

  function deleteSc(item: ServiceCatalogItem) {
    setConfirmDialog({
      title: `Delete "${item.name_en}"?`,
      message: `This removes the catalog item permanently. It will no longer appear when building reservations. Existing reservations that already used it keep their line items — only future selections are affected. This cannot be undone.`,
      confirmLabel: 'Delete Item',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null)
        const { error } = await supabase.from('service_catalog_items').delete().eq('id', item.id)
        if (error) { toast(`Failed to delete: ${error.message}`, 'error'); return }
        toast('Catalog item deleted', 'info')
        loadServiceCatalog()
      },
    })
  }

  async function loadCoaAccounts() {
    if (!activeBranch) return
    // Guest payment methods map to a cash/bank asset account (where the money
    // lands). The ITC loan is a bill-payment funding source, not a guest
    // payment channel, so it's handled in Record Bill Payment — not here.
    const { data } = await supabase.from('chart_of_accounts')
      .select('id, code, name')
      .eq('branch_id', activeBranch.id)
      .eq('is_active', true)
      .in('type', ['asset'])
      .order('code')
    setCoaAccounts((data ?? []) as { id: string; code: string; name: string }[])
  }

  async function loadPaymentMethods() {
    if (!activeBranch) return
    const { data } = await supabase.from('payment_methods').select('*').eq('branch_id', activeBranch.id).order('sort_order')
    setPaymentMethods((data ?? []) as PaymentMethod[])
  }

  function openAddPm() {
    setEditingPm(null)
    setPmForm({ name: '', value: '', account_code: '1020' })
    setPmModalOpen(true)
  }

  function openEditPm(pm: PaymentMethod) {
    setEditingPm(pm)
    setPmForm({ name: pm.name, value: pm.value, account_code: pm.account_code || (pm.is_cash ? '1010' : '1020') })
    setPmModalOpen(true)
  }

  async function savePm() {
    if (!pmForm.name.trim()) { toast('Name is required', 'error'); return }
    if (!pmForm.value.trim()) { toast('Slug/value is required', 'error'); return }
    if (!activeBranch) return
    const normalizedSlug = pmForm.value.trim().toLowerCase().replace(/\s+/g, '_')
    const slugConflict = paymentMethods.find(
      m => m.value === normalizedSlug && m.id !== editingPm?.id
    )
    if (slugConflict) { toast(`Slug "${normalizedSlug}" is already used by "${slugConflict.name}"`, 'error'); return }
    setPmSaving(true)
    const isCash = pmForm.account_code === '1010'
    if (editingPm) {
      const { error } = await supabase.from('payment_methods').update({
        name: pmForm.name.trim(),
        value: pmForm.value.trim().toLowerCase().replace(/\s+/g, '_'),
        account_code: pmForm.account_code,
        is_cash: isCash,
        updated_at: new Date().toISOString(),
      }).eq('id', editingPm.id)
      if (error) { toast(error.message, 'error'); setPmSaving(false); return }
      toast('Payment method updated')
    } else {
      const nextOrder = paymentMethods.length > 0 ? Math.max(...paymentMethods.map(m => m.sort_order)) + 1 : 1
      const { error } = await supabase.from('payment_methods').insert({
        branch_id: activeBranch.id,
        name: pmForm.name.trim(),
        value: pmForm.value.trim().toLowerCase().replace(/\s+/g, '_'),
        account_code: pmForm.account_code,
        is_cash: isCash,
        is_active: true,
        sort_order: nextOrder,
      })
      if (error) { toast(error.message, 'error'); setPmSaving(false); return }
      toast('Payment method added')
    }
    setPmSaving(false)
    setPmModalOpen(false)
    loadPaymentMethods()
  }

  async function togglePmActive(pm: PaymentMethod) {
    const { error } = await supabase.from('payment_methods').update({ is_active: !pm.is_active, updated_at: new Date().toISOString() }).eq('id', pm.id)
    if (error) toast(`Failed to update: ${error.message}`, 'error')
    loadPaymentMethods()
  }

  function deletePm(pm: PaymentMethod) {
    setConfirmDialog({
      title: `Delete "${pm.name}"?`,
      message: `This removes the payment method from deposit & invoice forms going forward. Past transactions recorded with it are unaffected and keep their journal entries. This cannot be undone.`,
      confirmLabel: 'Delete Method',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null)
        const { error } = await supabase.from('payment_methods').delete().eq('id', pm.id)
        if (error) { toast(`Failed to delete: ${error.message}`, 'error'); return }
        toast('Payment method deleted', 'info')
        loadPaymentMethods()
      },
    })
  }

  async function movePm(pm: PaymentMethod, dir: 'up' | 'down') {
    const sorted = [...paymentMethods].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(m => m.id === pm.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const a = sorted[idx], b = sorted[swapIdx]
    await Promise.all([
      supabase.from('payment_methods').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('payment_methods').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    loadPaymentMethods()
  }

  async function loadSettings() {
    if (!activeBranch) return
    const { data } = await supabase.from('hotel_settings').select('*').eq('branch_id', activeBranch.id).single()
    if (data) {
      setSettingsId(data.id)
      setForm({
        hotel_name: data.hotel_name ?? 'OnlyOne Homestay',
        hotel_address: data.hotel_address ?? '',
        hotel_phone: data.hotel_phone ?? '',
        hotel_email: data.hotel_email ?? '',
        telegram_bot_token: data.telegram_bot_token ?? '',
        telegram_chat_id: data.telegram_chat_id ?? '',
        telegram_enabled: data.telegram_enabled ?? false,
        notification_events: data.notification_events ?? ['new_reservation', 'checkin', 'checkout', 'payment'],
        tax_rate: Number(data.tax_rate) ?? 10,
        currency: data.currency ?? 'USD',
        check_in_time: data.check_in_time ?? '14:00',
        check_out_time: data.check_out_time ?? '12:00',
        bank_name: data.bank_name ?? '',
        bank_account_name: data.bank_account_name ?? '',
        bank_account_number: data.bank_account_number ?? '',
      })
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!activeBranch) return
    setSaving(true)
    const payload = {
      branch_id: activeBranch.id,
      hotel_name: form.hotel_name,
      hotel_address: form.hotel_address || null,
      hotel_phone: form.hotel_phone || null,
      hotel_email: form.hotel_email || null,
      telegram_bot_token: form.telegram_bot_token || null,
      telegram_chat_id: form.telegram_chat_id || null,
      telegram_enabled: form.telegram_enabled,
      notification_events: form.notification_events,
      tax_rate: form.tax_rate,
      currency: form.currency,
      check_in_time: form.check_in_time,
      check_out_time: form.check_out_time,
      bank_name: form.bank_name || null,
      bank_account_name: form.bank_account_name || null,
      bank_account_number: form.bank_account_number || null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('hotel_settings')
      .upsert(payload, { onConflict: 'branch_id' })
      .select('id')
      .single()
    if (error) { toast(error.message, 'error'); setSaving(false); return }
    if (data?.id) setSettingsId(data.id)
    await refreshHotelSettings()
    toast('Settings saved')
    setSaving(false)
  }

  const TEST_PAYLOADS: Record<string, Record<string, string>> = {
    new_reservation: {
      hotel_name: form.hotel_name,
      guest_name: 'Test Guest',
      house_name: 'House 01',
      check_in:  todayISO(),
      check_out: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
      reservation_number: 'TEST-0001',
      pax: '4 Adults, 2 Children',
      total_amount: '$180.00',
      deposit: '$30.00',
      remaining: '$150.00',
      add_ons: '• Car Rental  $50.00\n• BBQ / Grilling  $20.00',
      status: 'Confirmed',
    },
    checkin: {
      hotel_name: form.hotel_name,
      guest_name: 'Test Guest',
      house_name: 'House 01',
      time: '14:00',
      reservation_number: 'TEST-0001',
    },
    checkout: {
      hotel_name: form.hotel_name,
      guest_name: 'Test Guest',
      house_name: 'House 01',
      time: '12:00',
      reservation_number: 'TEST-0001',
    },
    payment: {
      hotel_name: form.hotel_name,
      guest_name: 'Test Guest',
      amount: '$120.00',
      method: 'Cash',
      invoice_number: 'INV-TEST-001',
    },
    housekeeping_complete: {
      hotel_name: form.hotel_name,
      room_number: 'House 01',
      staff_name: 'Test Staff',
    },
    room_maintenance: {
      hotel_name: form.hotel_name,
      house_name: 'House 01',
      notes: 'Test maintenance alert',
    },
    cancellation: {
      hotel_name: form.hotel_name,
      guest_name: 'Test Guest',
      house_name: 'House 01',
      reservation_number: 'TEST-0001',
      reason: 'Test cancellation',
    },
  }

  async function handleTestTelegram() {
    if (!form.telegram_bot_token || !form.telegram_chat_id) {
      toast('Enter bot token and chat ID first', 'error'); return
    }
    setTestingTelegram(true)
    const res = await fetch('/api/telegram/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: testEvent,
        data: TEST_PAYLOADS[testEvent] ?? {},
        override_token: form.telegram_bot_token,
        override_chat_id: form.telegram_chat_id,
      }),
    })
    const json = await res.json()
    if (json.ok) {
      toast(`Test "${testEvent}" sent — check Telegram.`)
    } else {
      toast(json.error ?? 'Failed to send test message', 'error')
    }
    setTestingTelegram(false)
  }

  function toggleEvent(key: string) {
    setForm(f => ({
      ...f,
      notification_events: f.notification_events.includes(key)
        ? f.notification_events.filter(e => e !== key)
        : [...f.notification_events, key],
    }))
  }

  if (loading) return (
    <>
      <TopBar title="Settings" />
      <div className="p-8 flex items-center justify-center text-hmuted">Loading settings…</div>
    </>
  )

  return (
    <>
      <TopBar title="Settings" subtitle="Property configuration & integrations" />
      <div className="p-4 sm:p-6 flex-1 section-enter overflow-auto">
        {isAdmin && (
          <div className="flex gap-2 mb-6">
            {(['general', 'audit'] as const).map(t => (
              <button
                key={t}
                onClick={() => setSettingsTab(t)}
                className={`text-sm font-semibold px-4 py-2 rounded-full transition-colors ${settingsTab === t ? 'bg-navy text-white' : 'bg-hsurface2 text-hmuted hover:text-navy'}`}
              >
                {t === 'general' ? 'General' : 'Audit Log'}
              </button>
            ))}
          </div>
        )}

        {settingsTab === 'general' && (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* LEFT COLUMN */}
          <div className="space-y-6">
            {/* Property Info */}
            <div className="bg-white border border-hborder rounded-2xl p-6 shadow-card">
              <h3 className="font-serif text-lg text-dark-navy mb-4">Property Information</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-hmuted mb-1">Property Name</label>
                  <input
                    value={form.hotel_name}
                    onChange={e => setForm(f => ({ ...f, hotel_name: e.target.value }))}
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-hmuted mb-1">Address</label>
                  <input
                    value={form.hotel_address}
                    onChange={e => setForm(f => ({ ...f, hotel_address: e.target.value }))}
                    placeholder="123 Main Street, City, Country"
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-hmuted mb-1">Phone</label>
                    <input
                      value={form.hotel_phone}
                      onChange={e => setForm(f => ({ ...f, hotel_phone: e.target.value }))}
                      className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-hmuted mb-1">Email</label>
                    <input
                      type="email"
                      value={form.hotel_email}
                      onChange={e => setForm(f => ({ ...f, hotel_email: e.target.value }))}
                      className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bank Transfer Details */}
            <div className="bg-white border border-hborder rounded-2xl p-6 shadow-card">
              <h3 className="font-serif text-lg text-dark-navy mb-1">Bank Transfer Details</h3>
              <p className="text-xs text-hmuted mb-4">Printed on invoices/receipts paid by bank transfer</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-hmuted mb-1">Bank Name</label>
                  <input
                    value={form.bank_name}
                    onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                    placeholder="e.g. ABA Bank"
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-hmuted mb-1">Account Name</label>
                    <input
                      value={form.bank_account_name}
                      onChange={e => setForm(f => ({ ...f, bank_account_name: e.target.value }))}
                      className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-hmuted mb-1">Account Number</label>
                    <input
                      value={form.bank_account_number}
                      onChange={e => setForm(f => ({ ...f, bank_account_number: e.target.value }))}
                      className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Operations */}
            <div className="bg-white border border-hborder rounded-2xl p-6 shadow-card">
              <h3 className="font-serif text-lg text-dark-navy mb-4">Operations</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-hmuted mb-1">Check-in Time</label>
                  <input
                    type="time"
                    value={form.check_in_time}
                    onChange={e => setForm(f => ({ ...f, check_in_time: e.target.value }))}
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-hmuted mb-1">Check-out Time</label>
                  <input
                    type="time"
                    value={form.check_out_time}
                    onChange={e => setForm(f => ({ ...f, check_out_time: e.target.value }))}
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-hmuted mb-1">Tax Rate (%)</label>
                  <input
                    type="number" min={0} max={100} step={0.1}
                    value={form.tax_rate}
                    onChange={e => setForm(f => ({ ...f, tax_rate: Number(e.target.value) }))}
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-hmuted mb-1">Currency</label>
                  <select
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  >
                    {['USD','EUR','GBP','KHR','THB','SGD','JPY','AUD','CAD'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {form.currency !== 'USD' && (
                    <p className="text-[10px] text-amber-700 mt-1">
                      ⚠ Changes the display symbol only — every amount already in the system is recorded in USD and will not be converted.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            {/* Telegram */}
            <div className="bg-white border border-hborder rounded-2xl p-6 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-serif text-lg text-dark-navy">Telegram Notifications</h3>
                  <p className="text-xs text-hmuted mt-0.5">Push alerts to your Telegram channel or group</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.telegram_enabled}
                    onChange={e => setForm(f => ({ ...f, telegram_enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-navy transition-colors shadow-inner after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow after:transition-all peer-checked:after:translate-x-5"></div>
                </label>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-hmuted mb-1">Bot Token</label>
                  <input
                    type="password"
                    value={form.telegram_bot_token}
                    onChange={e => setForm(f => ({ ...f, telegram_bot_token: e.target.value }))}
                    placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg font-mono"
                  />
                  <p className="text-xs text-hlight mt-1">Get a bot token from @BotFather on Telegram</p>
                </div>
                <div>
                  <label className="block text-xs text-hmuted mb-1">Chat ID</label>
                  <input
                    value={form.telegram_chat_id}
                    onChange={e => setForm(f => ({ ...f, telegram_chat_id: e.target.value }))}
                    placeholder="-1001234567890"
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg font-mono"
                  />
                  <p className="text-xs text-hlight mt-1">Use @userinfobot to find your chat ID</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-hmuted uppercase tracking-wide mb-2">Notification Events</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {NOTIFICATION_EVENTS.map(ev => (
                      <label key={ev.key} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.notification_events.includes(ev.key)}
                          onChange={() => toggleEvent(ev.key)}
                          className="w-4 h-4 rounded border-hborder text-navy focus:ring-navy"
                        />
                        <span className="text-sm text-htext">{ev.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 items-center">
                  <select
                    value={testEvent}
                    onChange={e => setTestEvent(e.target.value)}
                    className="flex-1 border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  >
                    {NOTIFICATION_EVENTS.map(ev => (
                      <option key={ev.key} value={ev.key}>{ev.label}</option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    onClick={handleTestTelegram}
                    disabled={testingTelegram}
                  >
                    {testingTelegram ? 'Sending…' : '📨 Test'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} size="lg">
                {saving ? 'Saving…' : 'Save Settings'}
              </Button>
            </div>
          </div>

        </div>

        {/* ── Payment Methods CRUD ── */}
        <div className="mt-6 bg-white border border-hborder rounded-2xl p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg text-dark-navy">Payment Methods</h3>
              <p className="text-xs text-hmuted mt-0.5">Manage accepted deposit &amp; invoice payment methods for this branch</p>
            </div>
            <Button onClick={openAddPm} size="sm">+ Add Method</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-hsurface2">
                  {['Order', 'Name', 'Value / Slug', 'Maps to Account', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paymentMethods.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-hmuted text-sm">No payment methods yet — click "+ Add Method" to start.</td></tr>
                ) : paymentMethods.map((pm, idx) => (
                  <tr key={pm.id} className="border-t border-hborder hover:bg-hbg/40 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => movePm(pm, 'up')} disabled={idx === 0} className="text-hmuted hover:text-navy disabled:opacity-30 text-xs px-1">▲</button>
                        <button onClick={() => movePm(pm, 'down')} disabled={idx === paymentMethods.length - 1} className="text-hmuted hover:text-navy disabled:opacity-30 text-xs px-1">▼</button>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-medium text-htext max-w-[130px] truncate" title={pm.name}>{pm.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-hmuted whitespace-nowrap">{pm.value}</td>
                    <td className="px-3 py-2">
                      {(() => {
                        const code = (pm as any).account_code || (pm.is_cash ? '1010' : '1020')
                        const acct = coaAccounts.find(a => a.code === code)
                        const isCash = code === '1010'
                        return (
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${isCash ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}
                            title={acct?.name}
                          >
                            {code}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => togglePmActive(pm)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${pm.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-700'}`}
                      >
                        {pm.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-3">
                        <button onClick={() => openEditPm(pm)} className="text-xs text-navy hover:underline">Edit</button>
                        <button onClick={() => deletePm(pm)} className="text-xs text-red-500 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Service Catalog CRUD ── */}
        <div className="mt-6 bg-white border border-hborder rounded-2xl p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg text-dark-navy">Service Catalog</h3>
              <p className="text-xs text-hmuted mt-0.5">Activities, services & F&amp;B items available as reservation add-ons for this branch</p>
            </div>
            <Button onClick={openAddSc} size="sm">+ Add Item</Button>
          </div>
          <div className="flex gap-2 mb-4">
            {(['activity', 'fnb'] as ServiceCatalogCategory[]).map(cat => (
              <button
                key={cat}
                onClick={() => setScCategoryTab(cat)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${scCategoryTab === cat ? 'bg-navy text-white' : 'bg-hsurface2 text-hmuted hover:text-navy'}`}
              >
                {cat === 'activity' ? 'Activities & Services' : 'Food & Beverage'}
                <span className="ml-1.5 opacity-70">({serviceCatalog.filter(i => i.category === cat).length})</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-hsurface2">
                  {['Code', 'Name', 'Details', 'Price', 'Revenue Acct', 'Cost Acct', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {serviceCatalog.filter(i => i.category === scCategoryTab).length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-hmuted text-sm">No items yet — click "+ Add Item" to start.</td></tr>
                ) : serviceCatalog.filter(i => i.category === scCategoryTab).map(item => (
                  <tr key={item.id} className="border-t border-hborder hover:bg-hbg/40 transition-colors">
                    <td className="px-3 py-2 h-[52px] align-middle font-mono text-xs text-hmuted whitespace-nowrap">{item.code}</td>
                    <td className="px-3 py-2 h-[52px] align-middle max-w-[170px]">
                      <p className="font-medium text-htext truncate text-xs" title={item.name_en}>{item.name_en}</p>
                      {item.name_kh && <p className="text-[11px] text-hmuted truncate" title={item.name_kh}>{item.name_kh}</p>}
                    </td>
                    <td className="px-3 py-2 h-[52px] align-middle text-xs text-hmuted max-w-[150px] truncate" title={item.details ?? undefined}>{item.details ?? '—'}</td>
                    <td className="px-3 py-2 h-[52px] align-middle font-medium text-htext text-xs whitespace-nowrap">{formatCurrency(item.unit_price)}</td>
                    <td className="px-3 py-2 h-[52px] align-middle">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap"
                        title={revenueAccounts.find(a => a.code === item.revenue_account_code)?.name ?? undefined}
                      >
                        {item.revenue_account_code}
                      </span>
                    </td>
                    <td className="px-3 py-2 h-[52px] align-middle">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap"
                        title={expenseAccounts.find(a => a.code === item.cost_account_code)?.name ?? undefined}
                      >
                        {item.cost_account_code}
                      </span>
                    </td>
                    <td className="px-3 py-2 h-[52px] align-middle">
                      <button
                        onClick={() => toggleScActive(item)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors whitespace-nowrap ${item.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-700'}`}
                      >
                        {item.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-3 py-2 h-[52px] align-middle">
                      <div className="flex gap-3">
                        <button onClick={() => openEditSc(item)} className="text-xs text-navy hover:underline">Edit</button>
                        <button onClick={() => deleteSc(item)} className="text-xs text-red-500 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
        )}

        {settingsTab === 'audit' && isAdmin && (
          <div className="bg-white border border-hborder rounded-2xl p-6 shadow-card">
            <div className="mb-4">
              <h3 className="font-serif text-lg text-dark-navy">Audit Log</h3>
              <p className="text-xs text-hmuted mt-0.5">
                Every change to journal entries, invoices, reservations, fixed assets, bills, deposits, petty cash,
                chart of accounts, accounting periods, staff records and depreciation for this branch. Entries made
                directly against the database outside the app (e.g. a one-off data correction) show as
                "System (direct correction)" since there's no logged-in staff identity to attach.
              </p>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
              <div>
                <label className="block text-[11px] text-hmuted mb-1">Table</label>
                <select
                  value={auditFilter.table}
                  onChange={e => setAuditFilter(f => ({ ...f, table: e.target.value }))}
                  className="w-full border border-hborder rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-navy bg-hbg"
                >
                  <option value="all">All tables</option>
                  {AUDITED_TABLES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-hmuted mb-1">Action</label>
                <select
                  value={auditFilter.action}
                  onChange={e => setAuditFilter(f => ({ ...f, action: e.target.value as any }))}
                  className="w-full border border-hborder rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-navy bg-hbg"
                >
                  <option value="all">All actions</option>
                  <option value="INSERT">Created</option>
                  <option value="UPDATE">Updated</option>
                  <option value="DELETE">Deleted</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-hmuted mb-1">Performed by</label>
                <select
                  value={auditFilter.performedBy}
                  onChange={e => setAuditFilter(f => ({ ...f, performedBy: e.target.value }))}
                  className="w-full border border-hborder rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-navy bg-hbg"
                >
                  <option value="all">Everyone</option>
                  <option value="system">System (direct correction)</option>
                  {auditStaff.filter(s => s.auth_user_id).map(s => (
                    <option key={s.id} value={s.auth_user_id!}>{s.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-hmuted mb-1">From</label>
                <input
                  type="date"
                  value={auditFilter.dateFrom}
                  onChange={e => setAuditFilter(f => ({ ...f, dateFrom: e.target.value }))}
                  className="w-full border border-hborder rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
              <div>
                <label className="block text-[11px] text-hmuted mb-1">To</label>
                <input
                  type="date"
                  value={auditFilter.dateTo}
                  onChange={e => setAuditFilter(f => ({ ...f, dateTo: e.target.value }))}
                  className="w-full border border-hborder rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-navy bg-hbg"
                />
              </div>
            </div>

            {/* Results */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-hsurface2">
                    {['When', 'By', 'Table', 'Action', 'Record', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLoading ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-hmuted text-sm">Loading…</td></tr>
                  ) : auditLogs.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-hmuted text-sm">No matching activity yet.</td></tr>
                  ) : auditLogs.map(log => {
                    const diffs = diffFields(log.old_data, log.new_data)
                    const expanded = expandedAuditId === log.id
                    const actionColor = log.action === 'INSERT' ? 'bg-emerald-100 text-emerald-700' : log.action === 'DELETE' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'
                    return (
                      <React.Fragment key={log.id}>
                        <tr className="border-t border-hborder hover:bg-hbg/40 transition-colors cursor-pointer" onClick={() => setExpandedAuditId(expanded ? null : log.id)}>
                          <td className="px-3 py-2 text-xs text-hmuted whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                          <td className="px-3 py-2 text-xs text-htext whitespace-nowrap">{auditStaffName(log.performed_by)}</td>
                          <td className="px-3 py-2 text-xs font-mono text-hmuted whitespace-nowrap">{log.table_name}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${actionColor}`}>
                              {log.action === 'INSERT' ? 'Created' : log.action === 'DELETE' ? 'Deleted' : 'Updated'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs font-mono text-hmuted whitespace-nowrap">{log.record_id?.slice(0, 8) ?? '—'}</td>
                          <td className="px-3 py-2 text-xs text-navy whitespace-nowrap">{expanded ? '▲ Hide' : diffs.length > 0 ? `▼ ${diffs.length} field${diffs.length === 1 ? '' : 's'}` : ''}</td>
                        </tr>
                        {expanded && (
                          <tr className="border-t border-hborder bg-hbg/30">
                            <td colSpan={6} className="px-4 py-3">
                              {diffs.length === 0 ? (
                                <p className="text-xs text-hmuted italic">No field-level changes recorded.</p>
                              ) : (
                                <table className="text-xs w-full max-w-2xl">
                                  <thead>
                                    <tr className="text-hmuted">
                                      <th className="text-left pr-4 py-1 font-semibold">Field</th>
                                      <th className="text-left pr-4 py-1 font-semibold">Before</th>
                                      <th className="text-left py-1 font-semibold">After</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {diffs.map(d => (
                                      <tr key={d.key} className="border-t border-hborder/50">
                                        <td className="pr-4 py-1 font-mono text-hmuted whitespace-nowrap align-top">{d.key}</td>
                                        <td className="pr-4 py-1 text-red-600 align-top break-all">{fmtAuditVal(d.oldVal)}</td>
                                        <td className="py-1 text-emerald-700 align-top break-all">{fmtAuditVal(d.newVal)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {auditTotal > AUDIT_PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 text-xs text-hmuted">
                <span>{auditPage * AUDIT_PAGE_SIZE + 1}–{Math.min((auditPage + 1) * AUDIT_PAGE_SIZE, auditTotal)} of {auditTotal}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAuditPage(p => Math.max(0, p - 1))}
                    disabled={auditPage === 0}
                    className="px-3 py-1.5 rounded-lg border border-hborder disabled:opacity-30 hover:border-navy hover:text-navy transition-colors"
                  >Prev</button>
                  <button
                    onClick={() => setAuditPage(p => p + 1)}
                    disabled={(auditPage + 1) * AUDIT_PAGE_SIZE >= auditTotal}
                    className="px-3 py-1.5 rounded-lg border border-hborder disabled:opacity-30 hover:border-navy hover:text-navy transition-colors"
                  >Next</button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Payment Method Modal ── */}
      <Modal open={pmModalOpen} onClose={() => setPmModalOpen(false)} title={editingPm ? 'Edit Payment Method' : 'Add Payment Method'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-hmuted mb-1">Display Name *</label>
            <input
              value={pmForm.name}
              onChange={e => setPmForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. ABA Pay"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Slug / Value *</label>
            <input
              value={pmForm.value}
              onChange={e => setPmForm(f => ({ ...f, value: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') }))}
              placeholder="e.g. aba_pay"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg font-mono"
            />
            <p className="text-[10px] text-hmuted mt-1">Lowercase letters, numbers and underscores only. Used internally as the method key.</p>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Maps to Account (Accounting) *</label>
            <select
              value={pmForm.account_code}
              onChange={e => setPmForm(f => ({ ...f, account_code: e.target.value }))}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            >
              {coaAccounts.length === 0 ? (
                <>
                  <option value="1010">1010 — Cash on Hand (default)</option>
                  <option value="1020">1020 — Bank (default)</option>
                </>
              ) : (
                coaAccounts.map(a => (
                  <option key={a.id} value={a.code}>{a.code} — {a.name}</option>
                ))
              )}
            </select>
            <p className="text-[10px] text-hmuted mt-1">
              When this payment method is used, the journal entry will debit/credit this account.
              {pmForm.account_code === '1010' ? ' ✔ Marked as Cash on Hand.' : ' This account will be treated as a Bank / Electronic account.'}
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setPmModalOpen(false)}>Cancel</Button>
            <Button onClick={savePm} disabled={pmSaving}>{pmSaving ? 'Saving…' : editingPm ? 'Update' : 'Add Method'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Service Catalog Item Modal ── */}
      <Modal open={scModalOpen} onClose={() => setScModalOpen(false)} title={editingSc ? 'Edit Catalog Item' : 'Add Catalog Item'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-hmuted mb-1">Category *</label>
            <div className="flex gap-2">
              {(['activity', 'fnb'] as ServiceCatalogCategory[]).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setScForm(f => ({ ...f, category: cat }))}
                  className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${scForm.category === cat ? 'border-navy bg-navy/8 text-navy' : 'border-hborder text-hmuted hover:border-navy/40'}`}
                >
                  {cat === 'activity' ? 'Activity / Service' : 'Food & Beverage'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hmuted mb-1">Code *</label>
              <input
                value={scForm.code}
                onChange={e => setScForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. ACT-08"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Price ($) *</label>
              <input
                type="number" min={0} step={0.01}
                value={scForm.unit_price}
                onChange={e => setScForm(f => ({ ...f, unit_price: Number(e.target.value) }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Name (English) *</label>
            <input
              value={scForm.name_en}
              onChange={e => setScForm(f => ({ ...f, name_en: e.target.value }))}
              placeholder="e.g. Jet Ski"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Name (Khmer)</label>
            <input
              value={scForm.name_kh}
              onChange={e => setScForm(f => ({ ...f, name_kh: e.target.value }))}
              placeholder="e.g. ម៉ូតូទឹក"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Details</label>
            <input
              value={scForm.details}
              onChange={e => setScForm(f => ({ ...f, details: e.target.value }))}
              placeholder="e.g. 1hr, or For 10-15 people"
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            />
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Revenue Account *</label>
            <select
              value={scForm.revenue_account_code}
              onChange={e => setScForm(f => ({ ...f, revenue_account_code: e.target.value }))}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            >
              {revenueAccounts.map(a => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Cost Account *</label>
            <select
              value={scForm.cost_account_code}
              onChange={e => setScForm(f => ({ ...f, cost_account_code: e.target.value }))}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
            >
              {expenseAccounts.map(a => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setScModalOpen(false)}>Cancel</Button>
            <Button onClick={saveSc} disabled={scSaving}>{scSaving ? 'Saving…' : editingSc ? 'Update' : 'Add Item'}</Button>
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
    </>
  )
}
