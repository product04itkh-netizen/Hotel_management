import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  let pw = ''
  for (let i = 0; i < 14; i++) pw += chars[randomInt(chars.length)]
  return pw
}

export async function POST(request: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  let admin
  try {
    admin = createAdminClient()
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }

  const body = await request.json()
  const { full_name, role, email, phone, status, department, hire_date, branch_id } = body as {
    full_name: string; role: string; email: string; phone?: string
    status: string; department?: string; hire_date?: string; branch_id: string | null
  }

  if (!full_name || !role) {
    return NextResponse.json({ ok: false, error: 'Name and role are required' }, { status: 400 })
  }
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Email is required to create a login' }, { status: 400 })
  }

  const tempPassword = generateTempPassword()

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name, role },
  })
  if (authErr || !authUser?.user) {
    return NextResponse.json({ ok: false, error: authErr?.message ?? 'Failed to create login' }, { status: 400 })
  }

  const { data: staffRow, error: staffErr } = await admin.from('staff').insert({
    full_name,
    role,
    email,
    phone: phone || null,
    status,
    department: department || null,
    hire_date: hire_date || null,
    branch_id: branch_id ?? null,
    auth_user_id: authUser.user.id,
  }).select().single()

  if (staffErr) {
    // Roll back the orphaned auth user so a failed staff insert doesn't leave a dangling login.
    await admin.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ ok: false, error: staffErr.message }, { status: 400 })
  }

  // The audit trigger on `staff` fired for this insert, but under the
  // service-role connection auth.uid() is NULL — correct it to the real
  // caller resolved above, so this doesn't show as an unattributed "System" row.
  await admin.from('audit_logs').update({ performed_by: user.id })
    .eq('table_name', 'staff').eq('record_id', staffRow.id).eq('action', 'INSERT').is('performed_by', null)

  return NextResponse.json({ ok: true, staff: staffRow, tempPassword })
}
