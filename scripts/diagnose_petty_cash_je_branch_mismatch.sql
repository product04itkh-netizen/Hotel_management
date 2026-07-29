-- Diagnostic only — no writes. Checks whether petty-cash journal entry lines
-- point at a chart_of_accounts row belonging to a DIFFERENT branch than the
-- entry itself, which migration 034_fix_petty_cash_je_account.sql could have
-- caused (its account lookup and UPDATE were both unscoped by branch_id,
-- even though chart_of_accounts is UNIQUE(code, branch_id) — one row per
-- branch per code).

-- 1. The specific entry in question
SELECT
  je.entry_number,
  je.branch_id            AS je_branch_id,
  b1.location              AS je_branch_location,
  jel.debit, jel.credit,
  coa.code, coa.name,
  coa.branch_id            AS account_branch_id,
  b2.location               AS account_branch_location,
  (coa.branch_id IS DISTINCT FROM je.branch_id) AS branch_mismatch
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.entry_id = je.id
JOIN chart_of_accounts coa   ON coa.id = jel.account_id
LEFT JOIN branches b1 ON b1.id = je.branch_id
LEFT JOIN branches b2 ON b2.id = coa.branch_id
WHERE je.entry_number = 'JE-20260729-4462'
ORDER BY jel.id;

-- 2. Every petty-cash JE line across the whole system where the account's
--    branch doesn't match the entry's own branch. Zero rows = nothing to fix.
SELECT
  je.entry_number, je.entry_date,
  b1.location AS je_branch,
  coa.code, coa.name,
  b2.location AS account_actually_belongs_to
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.entry_id = je.id
JOIN chart_of_accounts coa   ON coa.id = jel.account_id
LEFT JOIN branches b1 ON b1.id = je.branch_id
LEFT JOIN branches b2 ON b2.id = coa.branch_id
WHERE je.reference_type = 'petty_cash'
  AND coa.branch_id IS DISTINCT FROM je.branch_id
ORDER BY je.entry_date;
