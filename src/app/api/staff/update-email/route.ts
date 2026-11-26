import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Changes a staff member's email AND, when they have a login, the login itself.
// The Staff page used to write the email to the staff table only, so the two
// drifted apart: Dyna Yaneth's record said yaneth@onlyone.com while her login
// was still sale_manager@itcomputerkh.com, and signing in with the new address
// failed with "Invalid login credentials". A login's email can only be changed
// with the service-role admin API, hence a server route.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  let admin
  try {
    admin = createAdminClient()
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }

  // Moving someone's sign-in address is an admin action.
  const { data: caller } = await admin.from('staff').select('role').eq('auth_user_id', user.id).maybeSingle()
  if (caller?.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Only an admin can change a staff member’s email' }, { status: 403 })
  }

  const body = await request.json() as { staffId: string; email: string | null }
  const staffId = body.staffId
  const email = (body.email ?? '').trim().toLowerCase() || null
  if (!staffId) return NextResponse.json({ ok: false, error: 'staffId is required' }, { status: 400 })
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: `“${email}” is not a valid email address` }, { status: 400 })
  }

  const { data: staffRow } = await admin.from('staff')
    .select('email, auth_user_id, branch_id').eq('id', staffId).maybeSingle()
  if (!staffRow) return NextResponse.json({ ok: false, error: 'Staff member not found' }, { status: 404 })

  const oldEmail = staffRow.email ?? null
  if ((oldEmail ?? '').toLowerCase() === (email ?? '')) return NextResponse.json({ ok: true, loginMoved: false })

  let loginMoved = false
  let previousLoginEmail: string | null = null
  if (staffRow.auth_user_id) {
    if (!email) {
      return NextResponse.json({ ok: false, error: 'This staff member has a login, which needs an email — enter one instead of clearing it' }, { status: 400 })
    }
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (listErr) return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 })
    const taken = list.users.find(u => (u.email ?? '').toLowerCase() === email && u.id !== staffRow.auth_user_id)
    if (taken) {
      return NextResponse.json({ ok: false, error: `${email} is already used by another login` }, { status: 409 })
    }
    previousLoginEmail = list.users.find(u => u.id === staffRow.auth_user_id)?.email ?? null

    const { error: authErr } = await admin.auth.admin.updateUserById(staffRow.auth_user_id, { email, email_confirm: true })
    if (authErr) return NextResponse.json({ ok: false, error: `Could not change the login: ${authErr.message}` }, { status: 400 })
    loginMoved = true
  }

  const { error: staffErr } = await admin.from('staff')
    .update({ email, updated_at: new Date().toISOString() }).eq('id', staffId)
  if (staffErr) {
    // Put the login back so the record and the login never disagree.
    if (loginMoved && previousLoginEmail) {
      await admin.auth.admin.updateUserById(staffRow.auth_user_id!, { email: previousLoginEmail, email_confirm: true })
    }
    return NextResponse.json({ ok: false, error: `Could not save the email: ${staffErr.message}` }, { status: 500 })
  }

  // auth.users isn't covered by the audit trigger — record the login move explicitly.
  if (loginMoved) {
    await admin.from('audit_logs').insert({
      table_name: 'staff', record_id: staffId, action: 'UPDATE',
      old_data: { login_email: previousLoginEmail },
      new_data: { login_email: email, note: 'Login email changed by admin' },
      performed_by: user.id, branch_id: staffRow.branch_id,
    })
  }

  return NextResponse.json({ ok: true, loginMoved })
}
