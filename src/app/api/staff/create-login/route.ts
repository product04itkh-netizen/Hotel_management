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

// Provisions a login for a staff row that was created before auto-login existed
// (or was added without an email at the time).
export async function POST(request: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  let admin
  try {
    admin = createAdminClient()
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }

  const { staffId } = await request.json() as { staffId: string }
  if (!staffId) return NextResponse.json({ ok: false, error: 'staffId is required' }, { status: 400 })

  const { data: staffRow, error: fetchErr } = await admin.from('staff').select('*').eq('id', staffId).single()
  if (fetchErr || !staffRow) {
    return NextResponse.json({ ok: false, error: 'Staff member not found' }, { status: 404 })
  }
  if (staffRow.auth_user_id) {
    return NextResponse.json({ ok: false, error: 'This staff member already has a login' }, { status: 400 })
  }
  if (!staffRow.email) {
    return NextResponse.json({ ok: false, error: 'Add an email address before creating a login' }, { status: 400 })
  }

  const tempPassword = generateTempPassword()
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: staffRow.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: staffRow.full_name, role: staffRow.role },
  })
  if (authErr || !authUser?.user) {
    return NextResponse.json({ ok: false, error: authErr?.message ?? 'Failed to create login' }, { status: 400 })
  }

  const { error: updateErr } = await admin.from('staff').update({ auth_user_id: authUser.user.id }).eq('id', staffId)
  if (updateErr) {
    await admin.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, tempPassword })
}
