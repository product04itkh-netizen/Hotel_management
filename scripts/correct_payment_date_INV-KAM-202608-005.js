// Historical data entry correction: the payment for INV-KAM-202608-005 was
// actually received 2026-07-19, not 2026-08-04 (when it was entered into
// the system). Corrects the date on every linked record together so
// nothing desyncs from the invoice:
//   - journal_entries.entry_date for both JEs tied to this invoice
//   - payment_transactions.payment_date for both payment rows
//   - invoices.paid_at
// Does NOT touch invoice_date/created_at (when the invoice document itself
// was generated) or any amount/account — this is a date-only correction.
//
// Run: node scripts/correct_payment_date_INV-KAM-202608-005.js
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).map(line => {
    const idx = line.indexOf('=')
    return [line.slice(0, idx), line.slice(idx + 1).trim()]
  })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const INVOICE_NUMBER = 'INV-KAM-202608-005'
const CORRECT_DATE = '2026-07-19'
const CORRECT_TIMESTAMP = '2026-07-19T12:00:00Z'

async function main() {
  const { data: inv, error: invErr } = await supabase.from('invoices').select('*').eq('invoice_number', INVOICE_NUMBER).single()
  if (invErr || !inv) throw invErr || new Error('Invoice not found')

  const { data: jes, error: jeErr } = await supabase.from('journal_entries').select('*').eq('reference', INVOICE_NUMBER)
  if (jeErr) throw jeErr
  console.log(`Found ${jes.length} JE(s) for ${INVOICE_NUMBER}:`, jes.map(j => `${j.entry_number} (${j.entry_date} -> ${CORRECT_DATE})`))

  const { data: payments, error: payErr } = await supabase.from('payment_transactions').select('*').eq('invoice_id', inv.id)
  if (payErr) throw payErr
  console.log(`Found ${payments.length} payment_transaction(s):`, payments.map(p => `$${p.amount} (${p.payment_date} -> ${CORRECT_TIMESTAMP})`))

  console.log(`Invoice paid_at: ${inv.paid_at} -> ${CORRECT_TIMESTAMP}`)

  for (const je of jes) {
    const { error } = await supabase.from('journal_entries').update({ entry_date: CORRECT_DATE, updated_at: new Date().toISOString() }).eq('id', je.id)
    if (error) throw error
  }
  for (const p of payments) {
    const { error } = await supabase.from('payment_transactions').update({ payment_date: CORRECT_TIMESTAMP }).eq('id', p.id)
    if (error) throw error
  }
  const { error: invUpdErr } = await supabase.from('invoices').update({ paid_at: CORRECT_TIMESTAMP, updated_at: new Date().toISOString() }).eq('id', inv.id)
  if (invUpdErr) throw invUpdErr

  console.log('\nDone. Verifying...')
  const { data: jesAfter } = await supabase.from('journal_entries').select('entry_number, entry_date').eq('reference', INVOICE_NUMBER)
  const { data: paymentsAfter } = await supabase.from('payment_transactions').select('amount, payment_date').eq('invoice_id', inv.id)
  const { data: invAfter } = await supabase.from('invoices').select('paid_at').eq('id', inv.id).single()
  console.log('JEs:', jesAfter)
  console.log('payment_transactions:', paymentsAfter)
  console.log('invoice paid_at:', invAfter.paid_at)
}

main().catch(err => { console.error('Failed:', err); process.exit(1) })
