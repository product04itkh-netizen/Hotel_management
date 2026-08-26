const fs = require('fs')
const envStr = fs.readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(envStr.split('\n').filter(l => l.includes('=')).map(l => {
  const idx = l.indexOf('=')
  return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
}))
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function check() {
  const { data: res } = await supabase.from('reservations').select('*, items:reservation_line_items(*), invoices(*)').eq('reservation_number', 'RES-20260619-7270').single()
  console.log('Reservation:', JSON.stringify(res, null, 2))
}

check()
