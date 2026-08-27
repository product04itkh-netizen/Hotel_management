const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if(k && v) acc[k] = v.trim();
  return acc;
}, {});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Fetching invoices with multiple items...');
  const { data: invoices, error: invErr } = await supabase.from('invoices').select('*').in('status', ['paid', 'partial']);
  if (invErr) { console.error(invErr); return; }

  let updatedCount = 0;

  for (const inv of invoices) {
    if (!inv.items || inv.items.length < 2) continue;
    
    const accountTotals = {};
    inv.items.forEach(item => {
       const code = item.account_code || '4300';
       accountTotals[code] = (accountTotals[code] || 0) + Number(item.total);
    });
    
    const rawSum = Object.values(accountTotals).reduce((s, v) => s + v, 0);
    const invoiceTotal = Number(inv.total);
    
    if (rawSum > 0.001 && Math.abs(rawSum - invoiceTotal) > 0.01) {
       // It has an invoice-level discount (from reservation)
       const discount = rawSum - invoiceTotal;
       
       if (accountTotals['4000'] && accountTotals['4000'] >= discount) {
         accountTotals['4000'] = Math.round((accountTotals['4000'] - discount) * 100) / 100;
       } else {
         const largestCode = Object.keys(accountTotals).reduce((a, b) => accountTotals[a] > accountTotals[b] ? a : b);
         accountTotals[largestCode] = Math.max(0, Math.round((accountTotals[largestCode] - discount) * 100) / 100);
       }
       
       // Get JEs for this invoice
       const { data: jes } = await supabase.from('journal_entries')
           .select('id, reference_type')
           .eq('reference', inv.invoice_number)
           .eq('branch_id', inv.branch_id)
           .eq('is_void', false);
           
       const alreadyCredited = {};
       
       for (const je of (jes || [])) {
         // Get the revenue lines (credit > 0)
         const { data: lines } = await supabase.from('journal_entry_lines')
            .select('*, account:chart_of_accounts(code, id)')
            .eq('entry_id', je.id)
            .gt('credit', 0);
            
         const revenueLines = lines.filter(l => ['4000','4100','4200','4300','4400'].includes(l.account.code));
         
         if (revenueLines.length > 0) {
            const totalCreditDeleted = revenueLines.reduce((s, l) => s + Number(l.credit), 0);
            
            // Delete old revenue lines
            await supabase.from('journal_entry_lines').delete().in('id', revenueLines.map(l => l.id));
            
            // Re-allocate based on fixed accountTotals
            const codes = Object.keys(accountTotals).sort();
            let remainingPayment = totalCreditDeleted;
            const newLines = [];
            
            for (const code of codes) {
              if (remainingPayment <= 0.001) break;
              
              const { data: accs } = await supabase.from('chart_of_accounts')
                 .select('id')
                 .eq('branch_id', inv.branch_id)
                 .eq('code', code);
              if (!accs || accs.length === 0) continue;
              const accId = accs[0].id;
              
              const already = alreadyCredited[accId] || 0;
              const remainingForItem = Math.max(0, Math.round((accountTotals[code] - already) * 100) / 100);
              const amount = Math.min(remainingForItem, remainingPayment);
              
              if (amount > 0.001) {
                newLines.push({
                   entry_id: je.id,
                   account_id: accId,
                   debit: 0,
                   credit: Math.round(amount * 100) / 100,
                   description: `Revenue — ${inv.invoice_number}`
                });
                remainingPayment = Math.round((remainingPayment - amount) * 100) / 100;
                alreadyCredited[accId] = already + amount;
              }
            }
            
            if (remainingPayment > 0.001 && newLines.length > 0) {
               newLines[newLines.length - 1].credit = Math.round((newLines[newLines.length - 1].credit + remainingPayment) * 100) / 100;
            }
            
            if (newLines.length > 0) {
               await supabase.from('journal_entry_lines').insert(newLines);
               updatedCount++;
            }
         }
       }
    }
  }
  
  console.log(`Successfully fixed revenue splits for ${updatedCount} journal entries.`);
}

run();
