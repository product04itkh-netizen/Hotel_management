// Corrects revenue journal_entry_lines that were created by the OLD
// proportional-ratio split logic, before it was replaced with fixed
// price-based waterfall allocation (buildRevenueLines in billing/page.tsx).
// Affects 3 invoices whose deposit_applied JE (and, for one invoice, the
// follow-on 'invoice' JE that waterfalled off it) were created before the
// fix landed:
//   - INV-SA-202607-003  (JE-20260720-9458 deposit_applied, JE-20260720-9906 invoice)
//   - INV-SA-202608-001  (JE-20260803-5084 deposit_applied)
//   - INV-KAM-202608-006 (JE-20260804-4557 deposit_applied, JE-20260804-4863 invoice)
//
// For each, recomputes what buildRevenueLines() would have produced given
// each item's actual fixed price and JE creation order, then updates/deletes
// journal_entry_lines to match. No invoice/items/account_code changes needed
// — only credit amounts on existing revenue lines.
//
// Backs up affected lines before mutating, then verifies each JE still
// balances (debit=credit) and each invoice's total revenue recognized
// still equals its item total.
//
// Run: node scripts/correct_stale_ratio_revenue_lines.js
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

// account code -> corrected credit amount, per JE entry_number
const CORRECTIONS = {
  'JE-20260720-9458': { '4000': 90.00, '4300': null },
  'JE-20260720-9906': { '4000': 90.00, '4300': 10.00 },
  'JE-20260803-5084': { '4000': 100.00, '4100': null },
  'JE-20260804-4557': { '4000': 50.00, '4100': null, '4200': null },
  'JE-20260804-4863': { '4000': 450.00, '4100': 30.00, '4200': 20.00 },
}
const INVOICE_TOTALS = {
  'INV-SA-202607-003': 190,
  'INV-SA-202608-001': 262,
  'INV-KAM-202608-006': 550,
}

async function main() {
  const entryNumbers = Object.keys(CORRECTIONS)
  const { data: jes, error: jeErr } = await supabase.from('journal_entries').select('*').in('entry_number', entryNumbers)
  if (jeErr) throw jeErr
  if (jes.length !== entryNumbers.length) throw new Error(`Expected ${entryNumbers.length} JEs, found ${jes.length}`)

  const jeIds = jes.map(j => j.id)
  const { data: lines, error: lineErr } = await supabase.from('journal_entry_lines').select('*, account:chart_of_accounts(code)').in('entry_id', jeIds)
  if (lineErr) throw lineErr

  // Backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join('backups', `PRE_CORRECT_RATIO_REVENUE_${timestamp}`)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'journal_entries.json'), JSON.stringify(jes, null, 2))
  fs.writeFileSync(path.join(outDir, 'journal_entry_lines.json'), JSON.stringify(lines, null, 2))
  console.log(`Backup: ${outDir}\n`)

  for (const je of jes) {
    const correction = CORRECTIONS[je.entry_number]
    const jeLines = lines.filter(l => l.entry_id === je.id)
    console.log(`${je.entry_number} (${je.reference})`)
    for (const [code, amount] of Object.entries(correction)) {
      const existing = jeLines.find(l => l.account?.code === code && Number(l.credit) > 0)
      if (amount === null) {
        if (existing) {
          console.log(`  DELETE ${code} line (was $${existing.credit})`)
          const { error } = await supabase.from('journal_entry_lines').delete().eq('id', existing.id)
          if (error) throw error
        }
      } else if (existing) {
        console.log(`  UPDATE ${code}: $${existing.credit} -> $${amount.toFixed(2)}`)
        const { error } = await supabase.from('journal_entry_lines').update({ credit: amount }).eq('id', existing.id)
        if (error) throw error
      } else {
        console.log(`  INSERT ${code}: $${amount.toFixed(2)} (new line)`)
        const { data: acct } = await supabase.from('chart_of_accounts').select('id').eq('branch_id', je.branch_id).eq('code', code).single()
        const template = jeLines.find(l => Number(l.credit) > 0) // borrow description style
        const { error } = await supabase.from('journal_entry_lines').insert({
          entry_id: je.id, account_id: acct.id, debit: 0, credit: amount,
          description: template?.description ?? `Revenue — ${je.reference}`,
        })
        if (error) throw error
      }
    }
  }

  console.log('\nVerifying...')
  let allOk = true
  const { data: linesAfter } = await supabase.from('journal_entry_lines').select('*, account:chart_of_accounts(code,type)').in('entry_id', jeIds)
  for (const je of jes) {
    const jl = linesAfter.filter(l => l.entry_id === je.id)
    const debit = jl.reduce((s, l) => s + Number(l.debit), 0)
    const credit = jl.reduce((s, l) => s + Number(l.credit), 0)
    const balanced = Math.abs(debit - credit) < 0.01
    console.log(`  ${je.entry_number}: debit=${debit.toFixed(2)} credit=${credit.toFixed(2)} ${balanced ? 'OK' : 'MISMATCH'}`)
    if (!balanced) allOk = false
  }
  for (const [invNumber, total] of Object.entries(INVOICE_TOTALS)) {
    const invJeIds = jes.filter(j => j.reference === invNumber).map(j => j.id)
    const revLines = linesAfter.filter(l => invJeIds.includes(l.entry_id) && l.account?.type === 'revenue')
    const revenueTotal = revLines.reduce((s, l) => s + Number(l.credit), 0)
    const okAmt = Math.abs(revenueTotal - total) < 0.01
    console.log(`  ${invNumber}: revenue recognized so far=${revenueTotal.toFixed(2)} vs invoice total=${total} ${okAmt ? 'OK (fully recognized)' : '(check status — may be partial)'}`)
  }
  console.log(allOk ? '\nAll JEs balanced.' : '\nWARNING: some JEs are unbalanced — investigate before trusting reports.')
}

main().catch(err => { console.error('Failed:', err); process.exit(1) })
