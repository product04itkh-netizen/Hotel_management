'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { formatDate, capitalize } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import type { Staff, StaffRole, StaffStatus } from '@/types'

const ROLES: StaffRole[] = ['admin', 'manager', 'receptionist', 'housekeeping', 'maintenance', 'accounting']
const STATUSES: StaffStatus[] = ['active', 'inactive', 'on_leave']

const emptyForm = {
  full_name: '', role: 'receptionist' as StaffRole, email: '', phone: '',
  status: 'active' as StaffStatus, department: '', hire_date: '',
}

export default function StaffPage() {
  const supabase = createClient()
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadStaff() }, [])

  async function loadStaff() {
    const { data } = await supabase.from('staff').select('*').order('full_name')
    setStaff(data ?? [])
    setLoading(false)
  }

  const filtered = staff.filter(s => {
    const matchSearch = !search || s.full_name.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || s.role === roleFilter
    return matchSearch && matchRole
  })

  function openCreate() {
    setEditId(null)
    setForm({ ...emptyForm })
    setModalOpen(true)
  }

  function openEdit(member: Staff) {
    setEditId(member.id)
    setForm({
      full_name: member.full_name,
      role: member.role,
      email: member.email ?? '',
      phone: member.phone ?? '',
      status: member.status,
      department: member.department ?? '',
      hire_date: member.hire_date ?? '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.full_name || !form.role) { toast('Name and role are required', 'error'); return }
    setSaving(true)
    const payload = {
      full_name: form.full_name,
      role: form.role,
      email: form.email || null,
      phone: form.phone || null,
      status: form.status,
      department: form.department || null,
      hire_date: form.hire_date || null,
      updated_at: new Date().toISOString(),
    }
    if (editId) {
      const { error } = await supabase.from('staff').update(payload).eq('id', editId)
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      toast('Staff member updated')
    } else {
      const { error } = await supabase.from('staff').insert(payload)
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      toast('Staff member added')
    }
    setSaving(false)
    setModalOpen(false)
    loadStaff()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this staff member?')) return
    await supabase.from('staff').delete().eq('id', id)
    toast('Staff member removed', 'info')
    loadStaff()
  }

  const roleColors: Record<string, string> = {
    admin: '#B83232', manager: '#004AAD', receptionist: '#1A7A4A',
    housekeeping: '#C89B3C', maintenance: '#7C3AED', accounting: '#0891B2',
  }

  const roleStats = ROLES.map(r => ({ role: r, count: staff.filter(s => s.role === r && s.status === 'active').length }))

  return (
    <>
      <TopBar title="Staff & Users" subtitle="Roles & permissions management" />
      <div className="p-8 flex-1 section-enter">
        {/* Role summary */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          {roleStats.map(r => (
            <div key={r.role} className="bg-white border border-hborder rounded-xl p-3 shadow-card text-center">
              <div className="w-2 h-2 rounded-full mx-auto mb-2" style={{ background: roleColors[r.role] }} />
              <p className="text-lg font-bold text-dark-navy">{r.count}</p>
              <p className="text-[11px] text-hmuted capitalize">{r.role}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search staff…"
              className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy w-56"
            />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="border border-hborder rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
            >
              <option value="all">All Roles</option>
              {ROLES.map(r => <option key={r} value={r}>{capitalize(r)}</option>)}
            </select>
          </div>
          <Button onClick={openCreate}>+ Add Staff</Button>
        </div>

        <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hsurface2">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Name</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Role</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Department</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Contact</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Hire Date</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-hmuted">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-hmuted">No staff found</td></tr>
              ) : filtered.map(member => (
                <tr key={member.id} className="border-t border-hborder hover:bg-hbg/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: roleColors[member.role] ?? '#888' }}
                      >
                        {member.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-medium text-htext">{member.full_name}</p>
                        <p className="text-xs text-hmuted">{member.email ?? 'No email'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                      style={{ background: roleColors[member.role] ?? '#888' }}
                    >
                      {capitalize(member.role)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-hmuted">{member.department ?? '—'}</td>
                  <td className="px-5 py-3 text-hmuted">{member.phone ?? '—'}</td>
                  <td className="px-5 py-3 text-hmuted text-xs">{member.hire_date ? formatDate(member.hire_date) : '—'}</td>
                  <td className="px-5 py-3"><Badge status={member.status} /></td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => openEdit(member)} className="text-xs text-navy hover:underline">Edit</button>
                      <button onClick={() => handleDelete(member.id)} className="text-xs text-red-600 hover:underline">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Staff Member' : 'Add Staff Member'} size="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-hmuted mb-1">Full Name *</label>
              <input
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Role *</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as StaffRole }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {ROLES.map(r => <option key={r} value={r}>{capitalize(r)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as StaffStatus }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {STATUSES.map(s => <option key={s} value={s}>{capitalize(s.replace('_', ' '))}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Department</label>
              <input
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                placeholder="Front Office, Housekeeping…"
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Hire Date</label>
              <input
                type="date"
                value={form.hire_date}
                onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editId ? 'Update Staff' : 'Add Staff'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
