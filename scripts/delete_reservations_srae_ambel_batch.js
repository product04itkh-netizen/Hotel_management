// Deletes a SPECIFIC list of Srae Ambel reservations and everything linked to
// each: line items, deposit receipts, check-in records, checkout inspections,
// invoices, payments, and the journal entries (+lines) tied to the reservation
// number OR any of its invoice numbers. Petty cash is UNLINKED (reservation_id
// → NULL), never deleted. Guests are left intact.
//
// Targets ONLY the reservation numbers in TARGETS below, on the Srae Ambel
// branch. Aborts if any target is missing or resolves to a different branch.
//
// Takes a combined pre-delete backup snapshot first, deletes in dependency
// order, then verifies.
//
// Run: node scripts/delete_reservations_srae_ambel_batch.js
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).map(line => {
    const idx = line.indexOf('=')
    return [line.slice(0, idx), line.slice(idx + 1).trim()]
  })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const TARGETS = [
  'RES-20260722-3722', 'RES-20260713-9290', 'RES-20260713-3619',
  'RES-20260630-3068', 'RES-20260630-7312', 'RES-20260630-4867',
  'RES-20260630-3675', 'RES-20260630-3974', 'RES-20260630-9455',
  'RES-20260630-9676', 'RES-20260630-8020', 'RES-20260630-4703',
  'RES-20260630-2167', 'RES-20260630-6349', 'RES-20260630-7087',
  'RES-20260630-3179',
]

async function main() {
  const { data: branches } = await supabase.from('branches').select('*').ilike('location', '%Srae%')
  if (!branches || branches.length !== 1) throw new Error(`Expected exactly 1 Srae Ambel branch, found ${branches?.length ?? 0}`)
  const branch = branches[0]
  console.log(`Branch: ${branch.name} — ${branch.location} (${branch.id})\n`)

  // Resolve targets, scoped to this branch. Abort on any mismatch.
  const { data: reservations, error: resErr } = await supabase.from('reservations').select('*').in('reservation_number', TARGETS)
  if (resErr) throw resErr
  const found = new Set(reservations.map(r => r.reservation_number))
  const missing = TARGETS.filter(t => !found.has(t))
  const wrongBranch = reservations.filter(r => r.branch_id !== branch.id).map(r => r.reservation_number)
  if (missing.length) throw new Error(`Aborting — target(s) not found: ${missing.join(', ')}`)
  if (wrongBranch.length) throw new Error(`Aborting — target(s) not on Srae Ambel: ${wrongBranch.join(', ')}`)
  const srae = reservations.filter(r => r.branch_id === branch.id)
  if (srae.length !== TARGETS.length) throw new Error(`Aborting — resolved ${srae.length} of ${TARGETS.length} targets`)
  const resIds = srae.map(r => r.id)

  // Gather everything linked.
  const { data: lineItems } = await supabase.from('reservation_line_items').select('*').in('reservation_id', resIds)
  const { data: depositReceipts } = await supabase.from('deposit_receipts').select('*').in('reservation_id', resIds)
  const { data: checkInRecords } = await supabase.from('check_in_records').select('*').in('reservation_id', resIds)
  const { data: checkoutInspections } = await supabase.from('checkout_inspections').select('*').in('reservation_id', resIds)
  const { data: invoices } = await supabase.from('invoices').select('*').in('reservation_id', resIds)
  const invoiceIds = (invoices ?? []).map(i => i.id)
  const invoiceNumbers = (invoices ?? []).map(i => i.invoice_number)
  const { data: payments } = invoiceIds.length ? await supabase.from('payment_transactions').select('*').in('invoice_id', invoiceIds) : { data: [] }

  // JEs tied to a reservation number (deposit/check_in) OR an invoice number
  // (invoice/deposit_applied/invoice_correction). References are unique, so this
  // matches only these targets' entries. Branch-scoped as an extra guard.
  const references = [...srae.map(r => r.reservation_number), ...invoiceNumbers]
  const { data: jes } = await supabase.from('journal_entries').select('*').in('reference', references).eq('branch_id', branch.id)
  const jeIds = (jes ?? []).map(j => j.id)
  const { data: jeLines } = jeIds.length ? await supabase.from('journal_entry_lines').select('*').in('entry_id', jeIds) : { data: [] }
  const { data: pettyCash } = await supabase.from('petty_cash_transactions').select('*').in('reservation_id', resIds)

  // Safety-net backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join('backups', `PRE_DELETE_SRAE_BATCH_${timestamp}`)
  fs.mkdirSync(outDir, { recursive: true })
  const snapshot = {
    reservations: srae, reservation_line_items: lineItems, deposit_receipts: depositReceipts,
    check_in_records: checkInRecords, checkout_inspections: checkoutInspections, invoices,
    payment_transactions: payments, journal_entries: jes, journal_entry_lines: jeLines,
    petty_cash_transactions_linked: pettyCash,
  }
  for (const [name, rows] of Object.entries(snapshot)) {
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(rows ?? [], null, 2))
  }
  console.log(`Pre-delete backup: ${outDir}\n`)
  console.log('About to delete:')
  console.log(`  reservations: ${srae.length}`)
  console.log(`  reservation_line_items: ${lineItems.length}`)
  console.log(`  deposit_receipts: ${depositReceipts.length}`)
  console.log(`  check_in_records: ${checkInRecords.length}`)
  console.log(`  checkout_inspections: ${checkoutInspections.length}`)
  console.log(`  invoices: ${invoices.length} (${invoiceNumbers.join(', ')})`)
  console.log(`  payment_transactions: ${payments.length}`)
  console.log(`  journal_entries: ${jes.length} (${jes.map(j => j.entry_number).join(', ')})`)
  console.log(`  journal_entry_lines: ${jeLines.length}`)
  console.log(`  petty_cash to UNLINK (not delete): ${pettyCash.length}\n`)

  // Delete in dependency order.
  if (jeIds.length) {
    await supabase.from('journal_entry_lines').delete().in('entry_id', jeIds)
    await supabase.from('journal_entries').delete().in('id', jeIds)
    console.log(`Deleted ${jeIds.length} journal entries (+lines)`)
  }
  if (invoiceIds.length) {
    await supabase.from('payment_transactions').delete().in('invoice_id', invoiceIds)
    await supabase.from('invoices').delete().in('id', invoiceIds)
    console.log(`Deleted ${invoiceIds.length} invoice(s) (+payments)`)
  }
  if (pettyCash.length) {
    await supabase.from('petty_cash_transactions').update({ reservation_id: null, reservation_line_item_id: null }).in('reservation_id', resIds)
    console.log(`Unlinked ${pettyCash.length} petty cash transaction(s)`)
  }
  await supabase.from('deposit_receipts').delete().in('reservation_id', resIds)
  await supabase.from('checkout_inspections').delete().in('reservation_id', resIds)
  await supabase.from('check_in_records').delete().in('reservation_id', resIds)
  await supabase.from('reservation_line_items').delete().in('reservation_id', resIds)
  console.log('Deleted deposit_receipts / checkout_inspections / check_in_records / reservation_line_items')
  const { error: delResErr } = await supabase.from('reservations').delete().in('id', resIds)
  if (delResErr) throw delResErr
  console.log(`Deleted ${srae.length} reservations`)

  // Verify
  const { count: resRemaining } = await supabase.from('reservations').select('id', { count: 'exact', head: true }).in('reservation_number', TARGETS)
  const { count: invRemaining } = await supabase.from('invoices').select('id', { count: 'exact', head: true }).in('reservation_id', resIds)
  const { count: jeRemaining } = references.length ? await supabase.from('journal_entries').select('id', { count: 'exact', head: true }).in('reference', references).eq('branch_id', branch.id) : { count: 0 }
  console.log(`\nVerify — target reservations remaining: ${resRemaining}, invoices remaining: ${invRemaining}, JEs remaining: ${jeRemaining}`)
  console.log(resRemaining === 0 && invRemaining === 0 && jeRemaining === 0 ? 'Delete complete.' : 'WARNING: something did not delete.')
}

main().catch(err => { console.error('Failed:', err); process.exit(1) })
