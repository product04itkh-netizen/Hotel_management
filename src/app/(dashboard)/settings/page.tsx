'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/Toast'
import type { HotelSettings } from '@/types'

const NOTIFICATION_EVENTS = [
  { key: 'new_reservation', label: 'New Reservation' },
  { key: 'checkin', label: 'Guest Check-in' },
  { key: 'checkout', label: 'Guest Check-out' },
  { key: 'payment', label: 'Payment Received' },
  { key: 'housekeeping_complete', label: 'Housekeeping Completed' },
  { key: 'room_maintenance', label: 'Room Maintenance Alert' },
  { key: 'cancellation', label: 'Reservation Cancelled' },
]

export default function SettingsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [form, setForm] = useState({
    hotel_name: 'Grand Palms Hotel',
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

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    const { data } = await supabase.from('hotel_settings').select('*').limit(1).single()
    if (data) {
      setSettingsId(data.id)
      setForm({
        hotel_name: data.hotel_name ?? 'Grand Palms Hotel',
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
    setSaving(true)
    const payload = {
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
    if (settingsId) {
      const { error } = await supabase.from('hotel_settings').update(payload).eq('id', settingsId)
      if (error) { toast(error.message, 'error'); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('hotel_settings').insert(payload).select().single()
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      setSettingsId(data?.id ?? null)
    }
    toast('Settings saved')
    setSaving(false)
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
        event: 'new_reservation',
        data: {
          hotel_name: form.hotel_name,
          guest_name: 'Test Guest',
          room_number: '101',
          room_type: 'Deluxe',
          check_in: new Date().toISOString().split('T')[0],
          check_out: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
          reservation_number: 'TEST-0000',
        },
        override_token: form.telegram_bot_token,
        override_chat_id: form.telegram_chat_id,
      })
    })
    const json = await res.json()
    if (json.ok) {
      toast('Test message sent! Check your Telegram.')
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
      <TopBar title="Settings" subtitle="Hotel configuration & integrations" />
      <div className="p-8 flex-1 section-enter max-w-3xl">
        <div className="space-y-6">
          {/* Hotel Info */}
          <div className="bg-white border border-hborder rounded-2xl p-6 shadow-card">
            <h3 className="font-serif text-lg text-dark-navy mb-4">Hotel Information</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-hmuted mb-1">Hotel Name</label>
                  <input
                    value={form.hotel_name}
                    onChange={e => setForm(f => ({ ...f, hotel_name: e.target.value }))}
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-hmuted mb-1">Address</label>
                  <input
                    value={form.hotel_address}
                    onChange={e => setForm(f => ({ ...f, hotel_address: e.target.value }))}
                    placeholder="123 Main Street, City, Country"
                    className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
                  />
                </div>
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

              <Button
                variant="ghost"
                onClick={handleTestTelegram}
                disabled={testingTelegram}
              >
                {testingTelegram ? 'Sending…' : '📨 Send Test Notification'}
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
