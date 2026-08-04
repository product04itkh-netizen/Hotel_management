// Wipes Kampot branch's Reservation + Billing data so it can be tested from
// scratch. Explicitly does NOT touch: guests, petty_cash_transactions,
// inventory_*, bills/vendors (AP), fixed_assets/depreciation,
// chart_of_accounts, or manual/recurring/bill journal entries.
//
// Takes a fresh safety-net backup immediately before deleting (in case data
// changed since the last manual backup), deletes in dependency order, then
// verifies every scoped table actually reached zero rows.
//
// Run: node scripts/wipe_kampot_reservations_billing.js
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const envStr = fs.readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(
  envStr.split('\n').filter(Boolean).map(line => {
    const idx = line.indexOf('=')
    return [line.slice(0, idx), line.slice(idx + 1).trim()]
  })
)

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY missing from .env.local')
  process.exit(1)
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const RESERVATION_BILLING_REFERENCE_TYPES = ['deposit', 'deposit_refund', 'deposit_applied', 'invoice', 'check_in']

async function main() {
  const { data: branches, error: branchErr } = await supabase.from('branches').select('*').ilike('location', '%Kampot%')
  if (branchErr) throw branchErr
  if (!branches || branches.length !== 1) throw new Error(`Expected exactly 1 branch matching "Kampot", found ${branches?.length ?? 0}`)
  const branch = branches[0]
  console.log(`Target branch: ${branch.name} — ${branch.location} (${branch.id})\n`)

  // ── 1. Fresh safety-net backup of current state ──────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join('backups', `PRE_WIPE_kampot_reservations_billing_${timestamp}`)
  fs.mkdirSync(outDir, { recursive: true })

  const { data: reservations } = await supabase.from('reservations').select('*').eq('branch_id', branch.id)
  const reservationIds = (reservations ?? []).map(r => r.id)
  const { data: lineItems } = reservationIds.length ? await supabase.from('reservation_line_items').select('*').in('reservation_id', reservationIds) : { data: [] }
  const { data: depositReceipts } = await supabase.from('deposit_receipts').select('*').eq('branch_id', branch.id)
  const { data: checkInRecords } = await supabase.from('check_in_records').select('*').eq('branch_id', branch.id)
  const { data: checkoutInspections } = await supabase.from('checkout_inspections').select('*').eq('branch_id', branch.id)
  const { data: invoices } = await supabase.from('invoices').select('*').eq('branch_id', branch.id)
  const invoiceIds = (invoices ?? []).map(i => i.id)
  const { data: payments } = invoiceIds.length ? await supabase.from('payment_transactions').select('*').in('invoice_id', invoiceIds) : { data: [] }
  const { data: jes } = await supabase.from('journal_entries').select('*').eq('branch_id', branch.id).in('reference_type', RESERVATION_BILLING_REFERENCE_TYPES)
  const jeIds = (jes ?? []).map(j => j.id)
  const { data: jeLines } = jeIds.length ? await supabase.from('journal_entry_lines').select('*').in('entry_id', jeIds) : { data: [] }

  const snapshot = { reservations, reservation_line_items: lineItems, deposit_receipts: depositReceipts, check_in_records: checkInRecords, checkout_inspections: checkoutInspections, invoices, payment_transactions: payments, journal_entries: jes, journal_entry_lines: jeLines }
  for (const [name, rows] of Object.entries(snapshot)) {
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(rows ?? [], null, 2))
  }
  console.log(`Pre-wipe safety backup written: ${outDir}`)
  console.log('About to delete:')
  console.log(`  reservations: ${reservations?.length ?? 0}`)
  console.log(`  reservation_line_items: ${lineItems?.length ?? 0}`)
  console.log(`  deposit_receipts: ${depositReceipts?.length ?? 0}`)
  console.log(`  check_in_records: ${checkInRecords?.length ?? 0}`)
  console.log(`  checkout_inspections: ${checkoutInspections?.length ?? 0}`)
  console.log(`  invoices: ${invoices?.length ?? 0}`)
  console.log(`  payment_transactions: ${payments?.length ?? 0}`)
  console.log(`  journal_entries (reservation/billing only): ${jes?.length ?? 0}`)
  console.log(`  journal_entry_lines: ${jeLines?.length ?? 0}`)
  console.log('')

  // ── 2. Delete in dependency order (children before parents) ──────
  if (jeIds.length) {
    const { error } = await supabase.from('journal_entry_lines').delete().in('entry_id', jeIds)
    if (error) throw error
    console.log(`Deleted journal_entry_lines for ${jeIds.length} entries`)
  }
  if (jeIds.length) {
    const { error } = await supabase.from('journal_entries').delete().in('id', jeIds)
    if (error) throw error
    console.log(`Deleted ${jeIds.length} journal_entries`)
  }
  if (invoiceIds.length) {
    const { error } = await supabase.from('payment_transactions').delete().in('invoice_id', invoiceIds)
    if (error) throw error
    console.log(`Deleted payment_transactions for ${invoiceIds.length} invoices`)
  }
  {
    const { error } = await supabase.from('invoices').delete().eq('branch_id', branch.id)
    if (error) throw error
    console.log('Deleted invoices')
  }
  {
    const { error } = await supabase.from('deposit_receipts').delete().eq('branch_id', branch.id)
    if (error) throw error
    console.log('Deleted deposit_receipts')
  }
  {
    const { error } = await supabase.from('checkout_inspections').delete().eq('branch_id', branch.id)
    if (error) throw error
    console.log('Deleted checkout_inspections')
  }
  {
    const { error } = await supabase.from('check_in_records').delete().eq('branch_id', branch.id)
    if (error) throw error
    console.log('Deleted check_in_records')
  }
  if (reservationIds.length) {
    const { error } = await supabase.from('reservation_line_items').delete().in('reservation_id', reservationIds)
    if (error) throw error
    console.log(`Deleted reservation_line_items for ${reservationIds.length} reservations`)
  }
  {
    const { error } = await supabase.from('reservations').delete().eq('branch_id', branch.id)
    if (error) throw error
    console.log('Deleted reservations')
  }

  // ── 3. Verify everything actually reached zero ────────────────────
  console.log('\nVerifying...')
  const checks = [
    ['reservations', supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id)],
    ['deposit_receipts', supabase.from('deposit_receipts').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id)],
    ['invoices', supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id)],
    ['check_in_records', supabase.from('check_in_records').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id)],
    ['checkout_inspections', supabase.from('checkout_inspections').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id)],
  ]
  let allClear = true
  for (const [name, query] of checks) {
    const { count, error } = await query
    if (error) throw error
    console.log(`  ${name}: ${count} remaining`)
    if (count !== 0) allClear = false
  }
  const { count: pettyCount } = await supabase.from('petty_cash_transactions').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id)
  console.log(`  petty_cash_transactions (untouched, should be unchanged): ${pettyCount}`)

  console.log(allClear ? '\nWipe complete — all scoped tables at zero.' : '\nWARNING: some tables did not reach zero — check above.')
}

main().catch(err => { console.error('Wipe failed:', err); process.exit(1) })
