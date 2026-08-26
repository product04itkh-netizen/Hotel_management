const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const envStr = fs.readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(envStr.split('\n').map(l => l.split('=')))
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function check() {
  const { data: invoices } = await supabase.from('invoices').select('*').eq('status', 'paid')
  let invTotal = 0
  for (const inv of invoices) {
    invTotal += Number(inv.total)
  }
  console.log('Invoices total:', invTotal)

  const { data: jes } = await supabase.from('journal_entries').select('*, lines:journal_entry_lines(*)').eq('is_void', false)
  let jeRevenue = 0
  for (const je of jes) {
    for (const l of je.lines) {
      const { data: acc } = await supabase.from('chart_of_accounts').select('*').eq('id', l.account_id).single()
      if (acc.type === 'revenue' && l.credit > 0) jeRevenue += Number(l.credit)
    }
  }
  console.log('JE Revenue:', jeRevenue)
  
  const { data: pmts } = await supabase.from('payment_transactions').select('*')
  console.log('Payments:', pmts)
  
  // also check the $100 petty cash
  const { data: pCash } = await supabase.from('petty_cash_transactions').select('*')
  console.log('Petty cash:', pCash)
}

check()
