-- Fix: JE-20260729-4462 posted its expense line to 5700 (Laundry Expense)
-- but should have been posted to 5800 (Delivery Expense).
-- Scoped to this JE's own branch (chart_of_accounts is one row per code
-- per branch — see UNIQUE(code, branch_id)), so this won't touch any
-- other branch's accounts.

DO $$
DECLARE
  v_je_id       UUID;
  v_branch_id   UUID;
  v_wrong_acct  UUID;
  v_correct_acct UUID;
  v_line_id     UUID;
  v_debit       NUMERIC;
BEGIN
  SELECT id, branch_id INTO v_je_id, v_branch_id
  FROM journal_entries WHERE entry_number = 'JE-20260729-4462';

  IF v_je_id IS NULL THEN
    RAISE EXCEPTION 'JE-20260729-4462 not found';
  END IF;

  SELECT id INTO v_wrong_acct   FROM chart_of_accounts WHERE code = '5700' AND branch_id = v_branch_id;
  SELECT id INTO v_correct_acct FROM chart_of_accounts WHERE code = '5800' AND branch_id = v_branch_id;

  IF v_wrong_acct IS NULL OR v_correct_acct IS NULL THEN
    RAISE EXCEPTION 'Could not resolve 5700/5800 for this JE''s branch (%). Check chart_of_accounts.', v_branch_id;
  END IF;

  SELECT id, debit INTO v_line_id, v_debit
  FROM journal_entry_lines
  WHERE entry_id = v_je_id AND account_id = v_wrong_acct AND debit > 0;

  IF v_line_id IS NULL THEN
    RAISE EXCEPTION 'No debit line on this JE currently posted to 5700 — nothing to fix (may already be corrected).';
  END IF;

  UPDATE journal_entry_lines
  SET account_id = v_correct_acct
  WHERE id = v_line_id;

  RAISE NOTICE 'JE-20260729-4462: moved debit line ($%) from 5700 (Laundry Expense) to 5800 (Delivery Expense).', v_debit;
END $$;

-- Verify
SELECT je.entry_number, coa.code, coa.name, jel.debit, jel.credit
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.entry_id = je.id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.entry_number = 'JE-20260729-4462'
ORDER BY jel.debit DESC;
