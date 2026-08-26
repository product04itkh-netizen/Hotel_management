const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if(k && v) acc[k] = v.trim();
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY); // use service role!

async function run() {
  const { data: invs } = await supabase.from('invoices').select('*').eq('invoice_number', 'INV-SA-202606-011');
  console.log('Invoice:', invs);

  const { data: jes } = await supabase.from('journal_entries').select('*, journal_entry_lines(*)').eq('reference', 'INV-SA-202606-011');
  console.log('\nJournal Entries:', JSON.stringify(jes, null, 2));

  const { data: pts } = await supabase.from('payment_transactions').select('*');
  console.log('\nPayment Transactions:', pts.filter(p => p.invoice_id === (invs[0] ? invs[0].id : null)));
}

run();
