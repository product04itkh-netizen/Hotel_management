const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const envStr = fs.readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(
  envStr.split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx), l.slice(idx + 1).trim()]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const billNumber = 'BILL-202608-007'
  
  const { data: bill, error: billErr } = await supabase
    .from('bills')
    .select('*')
    .eq('bill_number', billNumber)
    .single()
    
  if (billErr || !bill) {
    console.error('Bill not found or error:', billErr)
    return
  }
  
  console.log('Found bill:', bill.id, 'with JE:', bill.journal_entry_id)

  const { data: payments } = await supabase
    .from('bill_payments')
    .select('*')
    .eq('bill_id', bill.id)
    
  console.log(`Found ${payments?.length || 0} payments.`)

  const jeIds = []
  if (bill.journal_entry_id) jeIds.push(bill.journal_entry_id)
  if (payments) {
    for (const p of payments) {
      if (p.journal_entry_id) jeIds.push(p.journal_entry_id)
    }
  }

  console.log('Deleting bill (and cascading to payments)...')
  const { error: delBillErr } = await supabase
    .from('bills')
    .delete()
    .eq('id', bill.id)
    
  if (delBillErr) {
    console.error('Failed to delete bill:', delBillErr)
    return
  }

  if (jeIds.length > 0) {
    console.log('Deleting JEs:', jeIds)
    const { error: delJeErr } = await supabase
      .from('journal_entries')
      .delete()
      .in('id', jeIds)
      
    if (delJeErr) {
      console.error('Failed to delete JEs:', delJeErr)
    } else {
      console.log('JEs deleted successfully.')
    }
  } else {
    console.log('No JEs to delete.')
  }

  console.log('Done.')
}

run()
