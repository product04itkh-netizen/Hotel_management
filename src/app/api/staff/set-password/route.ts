import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  let admin
  try {
    admin = createAdminClient()
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }

  const { staffId, password } = await request.json() as { staffId: string; password: string }
  if (!staffId || !password) {
    return NextResponse.json({ ok: false, error: 'staffId and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const { data: staffRow, error: fetchErr } = await admin.from('staff').select('auth_user_id, branch_id').eq('id', staffId).single()
  if (fetchErr || !staffRow) {
    return NextResponse.json({ ok: false, error: 'Staff member not found' }, { status: 404 })
  }
  if (!staffRow.auth_user_id) {
    return NextResponse.json({ ok: false, error: 'This staff member has no login yet' }, { status: 400 })
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(staffRow.auth_user_id, { password })
  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 })
  }

  // Password changes land in auth.users, which the audit trigger doesn't cover
  // (it's only attached to app tables) — log it explicitly instead.
  await admin.from('audit_logs').insert({
    table_name: 'staff', record_id: staffId, action: 'UPDATE',
    new_data: { note: 'Password reset by admin' },
    performed_by: user.id, branch_id: staffRow.branch_id,
  })

  return NextResponse.json({ ok: true })
}
