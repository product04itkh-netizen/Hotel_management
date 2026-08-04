// Deletes reservation RES-20260803-3857 (Kampot) and everything linked to it:
// line items, deposit receipt, invoice, payment, and the 2 journal entries
// (deposit + invoice). Does NOT touch petty cash (none linked to this
// reservation anyway) or any other reservation/invoice.
//
// Takes a pre-delete backup snapshot first, deletes in dependency order,
// then verifies.
//
// Run: node scripts/delete_reservation_RES-20260803-3857.js
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

const RESERVATION_NUMBER = 'RES-20260803-3857'

async function main() {
  const { data: branches } = await supabase.from('branches').select('*').ilike('location', '%Kampot%')
  if (!branches || branches.length !== 1) throw new Error(`Expected exactly 1 Kampot branch, found ${branches?.length ?? 0}`)
  const branch = branches[0]

  const { data: res, error: resErr } = await supabase.from('reservations').select('*')
    .eq('reservation_number', RESERVATION_NUMBER).eq('branch_id', branch.id).maybeSingle()
  if (resErr) throw resErr
  if (!res) throw new Error(`${RESERVATION_NUMBER} not found for Kampot branch`)

  const { data: lineItems } = await supabase.from('reservation_line_items').select('*').eq('reservation_id', res.id)
  const { data: depositReceipts } = await supabase.from('deposit_receipts').select('*').eq('reservation_id', res.id)
  const { data: checkInRecords } = await supabase.from('check_in_records').select('*').eq('reservation_id', res.id)
  const { data: checkoutInspections } = await supabase.from('checkout_inspections').select('*').eq('reservation_id', res.id)
  const { data: invoices } = await supabase.from('invoices').select('*').eq('reservation_id', res.id)
  const invoiceIds = (invoices ?? []).map(i => i.id)
  const { data: payments } = invoiceIds.length ? await supabase.from('payment_transactions').select('*').in('invoice_id', invoiceIds) : { data: [] }

  const references = [res.reservation_number, ...(invoices ?? []).map(i => i.invoice_number)]
  const { data: jes } = await supabase.from('journal_entries').select('*').in('reference', references).eq('branch_id', branch.id)
  const jeIds = (jes ?? []).map(j => j.id)
  const { data: jeLines } = jeIds.length ? await supabase.from('journal_entry_lines').select('*').in('entry_id', jeIds) : { data: [] }

  // Safety-net backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join('backups', `PRE_DELETE_${RESERVATION_NUMBER}_${timestamp}`)
  fs.mkdirSync(outDir, { recursive: true })
  const snapshot = { reservation: [res], reservation_line_items: lineItems, deposit_receipts: depositReceipts, check_in_records: checkInRecords, checkout_inspections: checkoutInspections, invoices, payment_transactions: payments, journal_entries: jes, journal_entry_lines: jeLines }
  for (const [name, rows] of Object.entries(snapshot)) {
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(rows ?? [], null, 2))
  }
  console.log(`Pre-delete backup: ${outDir}\n`)
  console.log('About to delete:')
  console.log(`  reservation: ${RESERVATION_NUMBER}`)
  console.log(`  reservation_line_items: ${lineItems.length}`)
  console.log(`  deposit_receipts: ${depositReceipts.length}`)
  console.log(`  check_in_records: ${checkInRecords.length}`)
  console.log(`  checkout_inspections: ${checkoutInspections.length}`)
  console.log(`  invoices: ${invoices.length} (${invoices.map(i => i.invoice_number).join(', ')})`)
  console.log(`  payment_transactions: ${payments.length}`)
  console.log(`  journal_entries: ${jes.length} (${jes.map(j => j.entry_number).join(', ')})`)
  console.log(`  journal_entry_lines: ${jeLines.length}\n`)

  if (jeIds.length) {
    await supabase.from('journal_entry_lines').delete().in('entry_id', jeIds)
    await supabase.from('journal_entries').delete().in('id', jeIds)
    console.log(`Deleted ${jeIds.length} journal entries`)
  }
  if (invoiceIds.length) {
    await supabase.from('payment_transactions').delete().in('invoice_id', invoiceIds)
    await supabase.from('invoices').delete().in('id', invoiceIds)
    console.log(`Deleted ${invoiceIds.length} invoice(s)`)
  }
  await supabase.from('deposit_receipts').delete().eq('reservation_id', res.id)
  await supabase.from('checkout_inspections').delete().eq('reservation_id', res.id)
  await supabase.from('check_in_records').delete().eq('reservation_id', res.id)
  await supabase.from('reservation_line_items').delete().eq('reservation_id', res.id)
  console.log('Deleted deposit_receipts / checkout_inspections / check_in_records / reservation_line_items')
  const { error: delResErr } = await supabase.from('reservations').delete().eq('id', res.id)
  if (delResErr) throw delResErr
  console.log(`Deleted reservation ${RESERVATION_NUMBER}`)

  // Verify
  const { count: resCount } = await supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('id', res.id)
  const { count: invCount } = await supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('reservation_id', res.id)
  console.log(`\nVerify — reservation remaining: ${resCount}, invoices remaining: ${invCount}`)
  console.log(resCount === 0 && invCount === 0 ? 'Delete complete.' : 'WARNING: something did not delete.')
}

main().catch(err => { console.error('Failed:', err); process.exit(1) })
