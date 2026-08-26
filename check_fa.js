const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://fkpbleuutvwyfljamurz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrcGJsZXV1dHZ3eWZsamFtdXJ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA5NDcyMSwiZXhwIjoyMDkyNjcwNzIxfQ.-hW0UotmtBYwUzy1p5lycF58G5rRWTlIRUWrYRpV7FA'
);

async function check() {
  const { data: accounts } = await supabase.from('chart_of_accounts').select('id, code, name').gte('code', '1500').lt('code', '1800');
  const accountIds = accounts.map(a => a.id);
  const { data: lines } = await supabase.from('journal_entry_lines')
    .select('debit, credit, account_id, entry_id, entry:journal_entries(status, is_void)')
    .in('account_id', accountIds);
  console.log('Fixed Asset Accounts:', accounts.length);
  console.log('Journal Lines for FA:', lines?.length || 0);
  if (lines?.length) {
    const agg = {};
    lines.forEach(l => {
      const c = accounts.find(a => a.id === l.account_id).code;
      if (!agg[c]) agg[c] = {dr: 0, cr: 0};
      agg[c].dr += Number(l.debit);
      agg[c].cr += Number(l.credit);
    });
    console.log('Agg:', agg);
    console.log('Lines:', JSON.stringify(lines, null, 2));
  }
}
check();
