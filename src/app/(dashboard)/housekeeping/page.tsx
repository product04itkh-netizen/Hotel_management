'use client'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { formatDate, capitalize } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import type { HousekeepingTask, Room, Staff } from '@/types'

const TASK_TYPES = ['cleaning', 'turndown', 'inspection', 'maintenance', 'special']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const TABS = ['all', 'pending', 'in_progress', 'completed']

export default function HousekeepingPage() {
  const supabase = createClient()
  const [tasks, setTasks] = useState<HousekeepingTask[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    room_id: '', task_type: 'cleaning', priority: 'normal', assigned_to: '', notes: '', due_date: '',
  })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [taskRes, roomRes, staffRes] = await Promise.all([
      supabase.from('housekeeping_tasks')
        .select('*, room:rooms(room_number, room_type, floor), staff:staff(full_name)')
        .order('created_at', { ascending: false }),
      supabase.from('rooms').select('id, room_number, room_type, floor').order('room_number'),
      supabase.from('staff').select('id, full_name, role').eq('status', 'active').in('role', ['housekeeping', 'maintenance', 'manager']).order('full_name'),
    ])
    setTasks((taskRes.data ?? []) as unknown as HousekeepingTask[])
    setRooms(roomRes.data ?? [])
    setStaff(staffRes.data ?? [])
    setLoading(false)
  }

  const filtered = tasks.filter(t => tab === 'all' || t.status === tab)

  async function updateStatus(id: string, status: string) {
    const update: Record<string, string> = { status, updated_at: new Date().toISOString() }
    if (status === 'completed') {
      update.completed_at = new Date().toISOString()
      const task = tasks.find(t => t.id === id)
      if (task?.room_id) {
        await supabase.from('rooms').update({ status: 'available', updated_at: new Date().toISOString() }).eq('id', task.room_id)
        fetch('/api/telegram/notify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'housekeeping_complete', data: {
            room_number: (task.room as any)?.room_number,
            staff_name: (task.staff as any)?.full_name ?? 'Staff',
          }})
        }).catch(() => {})
      }
    }
    await supabase.from('housekeeping_tasks').update(update).eq('id', id)
    toast(status === 'completed' ? 'Task completed — room marked available' : 'Task updated')
    loadData()
  }

  async function handleAssign(id: string, staffId: string) {
    await supabase.from('housekeeping_tasks').update({ assigned_to: staffId || null, updated_at: new Date().toISOString() }).eq('id', id)
    toast('Task assigned')
    loadData()
  }

  async function handleAdd() {
    if (!form.room_id || !form.task_type) { toast('Room and task type required', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('housekeeping_tasks').insert({
      room_id: form.room_id,
      task_type: form.task_type,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      notes: form.notes || null,
      due_date: form.due_date || null,
      status: 'pending',
    })
    if (error) { toast(error.message, 'error'); setSaving(false); return }
    toast('Task created')
    setSaving(false)
    setAddOpen(false)
    setForm({ room_id: '', task_type: 'cleaning', priority: 'normal', assigned_to: '', notes: '', due_date: '' })
    loadData()
  }

  const counts = {
    all: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
  }

  return (
    <>
      <TopBar title="Housekeeping" subtitle="Room status & task management" />
      <div className="p-8 flex-1 section-enter">
        <div className="flex items-center justify-between mb-5">
          <div className="flex gap-1 bg-hsurface2 rounded-xl p-1">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? 'bg-white text-dark-navy shadow-sm' : 'text-hmuted hover:text-htext'
                }`}
              >
                {capitalize(t.replace('_', ' '))}
                <span className="ml-1.5 text-[11px] opacity-60">
                  {counts[t as keyof typeof counts]}
                </span>
              </button>
            ))}
          </div>
          <Button onClick={() => setAddOpen(true)}>+ New Task</Button>
        </div>

        <div className="bg-white border border-hborder rounded-2xl shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hsurface2">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Room</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Task</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Priority</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Due</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Assigned To</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-hmuted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-hmuted">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-hmuted">No tasks found</td></tr>
              ) : filtered.map(task => (
                <tr key={task.id} className="border-t border-hborder hover:bg-hbg/40">
                  <td className="px-5 py-3">
                    <p className="font-medium text-htext">Room {(task.room as any)?.room_number ?? '—'}</p>
                    <p className="text-xs text-hmuted">{capitalize((task.room as any)?.room_type ?? '')} · Floor {(task.room as any)?.floor}</p>
                  </td>
                  <td className="px-5 py-3 capitalize text-hmuted">{task.task_type}</td>
                  <td className="px-5 py-3"><Badge status={task.priority} /></td>
                  <td className="px-5 py-3 text-hmuted text-xs">{task.due_date ? formatDate(task.due_date) : '—'}</td>
                  <td className="px-5 py-3">
                    <select
                      value={task.assigned_to ?? ''}
                      onChange={e => handleAssign(task.id, e.target.value)}
                      className="border border-hborder rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:border-navy"
                    >
                      <option value="">Unassigned</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3"><Badge status={task.status} /></td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5">
                      {task.status === 'pending' && (
                        <Button size="sm" variant="ghost" onClick={() => updateStatus(task.id, 'in_progress')}>Start</Button>
                      )}
                      {task.status === 'in_progress' && (
                        <Button size="sm" variant="success" onClick={() => updateStatus(task.id, 'completed')}>Complete</Button>
                      )}
                      {task.status === 'pending' && (
                        <Button size="sm" variant="ghost" onClick={() => updateStatus(task.id, 'skipped')}>Skip</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New Housekeeping Task">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-hmuted mb-1">Room *</label>
              <select
                value={form.room_id}
                onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                <option value="">Select room…</option>
                {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number} — Floor {r.floor}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Task Type</label>
              <select
                value={form.task_type}
                onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {TASK_TYPES.map(t => <option key={t} value={t}>{capitalize(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{capitalize(p)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Assign To</label>
              <select
                value={form.assigned_to}
                onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              >
                <option value="">Unassigned</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-hmuted mb-1">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-hmuted mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full border border-hborder rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-hbg resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? 'Creating…' : 'Create Task'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
