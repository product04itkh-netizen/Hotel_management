// One-off backup: exports Srae Ambel branch's Reservation + Billing data to local
// JSON before a targeted test-cleanup delete pass.
//
// Explicitly does NOT touch petty_cash_transactions, inventory_*, bills/vendors (AP),
// fixed_assets/depreciation, chart_of_accounts, or manual journal entries — those
// stay as-is per instruction.
//
// Run: node scripts/backup_srae_ambel_reservations_billing.js
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

// Reservation/Billing-generated journal entries only. Excludes: petty_cash, bill,
// bill_payment, recurring, depreciation, inventory_*, opening_balance, manual.
const RESERVATION_BILLING_REFERENCE_TYPES = ['deposit', 'deposit_refund', 'deposit_applied', 'invoice', 'check_in', 'invoice_correction']

async function main() {
  const { data: branches, error: branchErr } = await supabase.from('branches').select('*').ilike('location', '%Srae%')
  if (branchErr) throw branchErr
  if (!branches || branches.length === 0) throw new Error('No branch found matching "Srae"')
  if (branches.length > 1) {
    console.log('Multiple branches matched "Srae":')
    branches.forEach(b => console.log(`  ${b.name} — ${b.location} [${b.id}]`))
    throw new Error('Ambiguous branch match — refine the ilike filter above')
  }
  const branch = branches[0]
  console.log(`Backing up branch: ${branch.name} — ${branch.location} (${branch.id})\n`)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join('backups', `srae_ambel_reservations_billing_${timestamp}`)
  fs.mkdirSync(outDir, { recursive: true })

  const counts = {}
  function save(name, rows) {
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(rows, null, 2))
    counts[name] = rows.length
    console.log(`  ${name}: ${rows.length} rows`)
  }

  save('branch', [branch])

  const { data: reservations, error: resErr } = await supabase.from('reservations').select('*').eq('branch_id', branch.id)
  if (resErr) throw resErr
  save('reservations', reservations ?? [])
  const reservationIds = (reservations ?? []).map(r => r.id)

  const { data: lineItems, error: liErr } = reservationIds.length
    ? await supabase.from('reservation_line_items').select('*').in('reservation_id', reservationIds)
    : { data: [], error: null }
  if (liErr) throw liErr
  save('reservation_line_items', lineItems ?? [])

  const { data: depositReceipts, error: drErr } = await supabase.from('deposit_receipts').select('*').eq('branch_id', branch.id)
  if (drErr) throw drErr
  save('deposit_receipts', depositReceipts ?? [])

  const { data: checkInRecords, error: cirErr } = await supabase.from('check_in_records').select('*').eq('branch_id', branch.id)
  if (cirErr) throw cirErr
  save('check_in_records', checkInRecords ?? [])

  const { data: checkoutInspections, error: coiErr } = await supabase.from('checkout_inspections').select('*').eq('branch_id', branch.id)
  if (coiErr) throw coiErr
  save('checkout_inspections', checkoutInspections ?? [])

  const { data: invoices, error: invErr } = await supabase.from('invoices').select('*').eq('branch_id', branch.id)
  if (invErr) throw invErr
  save('invoices', invoices ?? [])

  const { data: payments, error: payErr } = await supabase.from('payment_transactions').select('*').eq('branch_id', branch.id)
  if (payErr) throw payErr
  save('payment_transactions', payments ?? [])

  // Guests referenced by these reservations — backed up for reference only, guests are NOT deleted.
  const guestIds = [...new Set((reservations ?? []).map(r => r.guest_id).filter(Boolean))]
  const { data: guests, error: guestErr } = guestIds.length
    ? await supabase.from('guests').select('*').in('id', guestIds)
    : { data: [], error: null }
  if (guestErr) throw guestErr
  save('guests_referenced', guests ?? [])

  // Journal entries generated FROM these reservations/invoices.
  const { data: jes, error: jeErr } = await supabase.from('journal_entries').select('*')
    .eq('branch_id', branch.id).in('reference_type', RESERVATION_BILLING_REFERENCE_TYPES)
  if (jeErr) throw jeErr
  save('journal_entries', jes ?? [])
  const jeIds = (jes ?? []).map(j => j.id)
  const { data: jeLines, error: jeLineErr } = jeIds.length
    ? await supabase.from('journal_entry_lines').select('*').in('entry_id', jeIds)
    : { data: [], error: null }
  if (jeLineErr) throw jeLineErr
  save('journal_entry_lines', jeLines ?? [])

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({
    branch: { id: branch.id, name: branch.name, location: branch.location },
    backed_up_at: new Date().toISOString(),
    row_counts: counts,
    reservation_billing_reference_types_included: RESERVATION_BILLING_REFERENCE_TYPES,
    explicitly_excluded: ['petty_cash_transactions', 'inventory_items', 'inventory_transactions', 'bills', 'vendors', 'fixed_assets', 'depreciation_runs', 'chart_of_accounts', 'manual/recurring/bill journal entries'],
  }, null, 2))

  console.log(`\nBackup complete: ${outDir}`)
}

main().catch(err => { console.error('Backup failed:', err); process.exit(1) })
