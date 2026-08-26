const fs = require('fs')
const envStr = fs.readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(envStr.split('\n').filter(l => l.includes('=')).map(l => {
  const idx = l.indexOf('=')
  return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
}))
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function check() {
  // Get all accounts
  const { data: accounts, error: acctErr } = await supabase.from('chart_of_accounts').select('id, code, name, type, branch_id')
  if (acctErr) { console.error('acct error:', acctErr); return }
  
  const revenueAccts = accounts.filter(a => a.type === 'revenue')
  console.log('\n=== REVENUE ACCOUNTS IN DB ===')
  revenueAccts.forEach(a => console.log(`  [${a.code}] ${a.name} (id: ${a.id})`))

  // Get all non-voided JEs and their lines
  const { data: jes, error: jeErr } = await supabase.from('journal_entries')
    .select('id, entry_number, entry_date, description, is_void, reference_type')
    .eq('is_void', false)
  if (jeErr) { console.error('je error:', jeErr); return }
  console.log(`\n=== TOTAL NON-VOIDED JEs: ${jes.length} ===`)

  if (jes.length === 0) {
    console.log('No journal entries found at all.')
    return
  }

  const jeIds = jes.map(j => j.id)
  const { data: lines, error: lineErr } = await supabase.from('journal_entry_lines')
    .select('entry_id, account_id, debit, credit, description')
    .in('entry_id', jeIds)
  if (lineErr) { console.error('line error:', lineErr); return }
  console.log(`Total JE lines: ${lines.length}`)

  // Group by revenue account
  console.log('\n=== REVENUE BREAKDOWN BY ACCOUNT ===')
  for (const acct of revenueAccts) {
    const acctLines = lines.filter(l => l.account_id === acct.id)
    const net = acctLines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0)
    console.log(`\n[${acct.code}] ${acct.name} — Net Revenue: $${net.toFixed(2)}`)
    acctLines.forEach(l => {
      const je = jes.find(j => j.id === l.entry_id)
      console.log(`    ${je?.entry_number} ${je?.entry_date} | DR:${l.debit} CR:${l.credit} | ${je?.description}`)
    })
  }

  // Also check lines pointing to unknown accounts
  const knownAcctIds = new Set(accounts.map(a => a.id))
  const orphanLines = lines.filter(l => !knownAcctIds.has(l.account_id))
  if (orphanLines.length > 0) {
    console.log(`\n=== ORPHAN JE LINES (account deleted): ${orphanLines.length} ===`)
    orphanLines.forEach(l => {
      const je = jes.find(j => j.id === l.entry_id)
      console.log(`  JE ${je?.entry_number} account_id=${l.account_id} DR:${l.debit} CR:${l.credit}`)
    })
  }
}
check()
