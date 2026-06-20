'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/Toast'
import type { HotelSettings } from '@/types'
import { useBranch } from '@/context/BranchContext'

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
  const { activeBranch } = useBranch()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
  })

  useEffect(() => { if (activeBranch) { loadSettings(); loadPaymentMethods(); loadCoaAccounts() } }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCoaAccounts() {
    if (!activeBranch) return
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
    await supabase.from('payment_methods').update({ is_active: !pm.is_active, updated_at: new Date().toISOString() }).eq('id', pm.id)
    loadPaymentMethods()
  }

  async function deletePm(pm: PaymentMethod) {
    if (!confirm(`Delete "${pm.name}"? This cannot be undone.`)) return
    await supabase.from('payment_methods').delete().eq('id', pm.id)
    toast('Payment method deleted', 'info')
    loadPaymentMethods()
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
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('hotel_settings')
      .upsert(payload, { onConflict: 'branch_id' })
      .select('id')
      .single()
    if (error) { toast(error.message, 'error'); setSaving(false); return }
    if (data?.id) setSettingsId(data.id)
    toast('Settings saved')
    setSaving(false)
  }

  const TEST_PAYLOADS: Record<string, Record<string, string>> = {
    new_reservation: {
      hotel_name: form.hotel_name,
      guest_name: 'Test Guest',
      house_name: 'House 01',
      check_in:  new Date().toISOString().split('T')[0],
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
      <div className="p-6 flex-1 section-enter overflow-auto">
        <div className="grid grid-cols-2 gap-6 items-start">

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
                <div className="grid grid-cols-2 gap-3">
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

            {/* Operations */}
            <div className="bg-white border border-hborder rounded-2xl p-6 shadow-card">
              <h3 className="font-serif text-lg text-dark-navy mb-4">Operations</h3>
              <div className="grid grid-cols-2 gap-4">
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
                  <div className="w-11 h-6 bg-hsurface2 rounded-full peer peer-checked:bg-navy transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
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
                  <div className="grid grid-cols-2 gap-2">
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
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paymentMethods.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-hmuted text-sm">No payment methods yet — click "+ Add Method" to start.</td></tr>
                ) : paymentMethods.map((pm, idx) => (
                  <tr key={pm.id} className="border-t border-hborder hover:bg-hbg/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => movePm(pm, 'up')} disabled={idx === 0} className="text-hmuted hover:text-navy disabled:opacity-30 text-xs px-1">▲</button>
                        <button onClick={() => movePm(pm, 'down')} disabled={idx === paymentMethods.length - 1} className="text-hmuted hover:text-navy disabled:opacity-30 text-xs px-1">▼</button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-htext">{pm.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-hmuted">{pm.value}</td>
                    <td className="px-4 py-2.5">
                      {(() => {
                        const code = (pm as any).account_code || (pm.is_cash ? '1010' : '1020')
                        const acct = coaAccounts.find(a => a.code === code)
                        const label = acct ? `${acct.code} — ${acct.name}` : code
                        const isCash = code === '1010'
                        return (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isCash ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {label}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => togglePmActive(pm)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${pm.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-700'}`}
                      >
                        {pm.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
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
    </>
  )
}
