-- Migration 034: Correct historical petty cash JE lines from 1010 → 1011
--
-- All petty cash journal entries incorrectly posted the cash side to
-- 1010 (Cash) instead of 1011 (Petty Cash). This remap fixes every
-- affected line retroactively.

DO $$
DECLARE
  acct_1010 UUID;
  acct_1011 UUID;
  rows_updated INT;
BEGIN
  SELECT id INTO acct_1010 FROM chart_of_accounts WHERE code = '1010' LIMIT 1;
  SELECT id INTO acct_1011 FROM chart_of_accounts WHERE code = '1011' LIMIT 1;

  IF acct_1011 IS NULL THEN
    RAISE EXCEPTION 'Account 1011 (Petty Cash) not found in chart_of_accounts — add it before running this migration.';
  END IF;

  IF acct_1010 IS NULL THEN
    RAISE NOTICE 'Account 1010 not found — nothing to remap.';
    RETURN;
  END IF;

  UPDATE journal_entry_lines jel
  SET account_id = acct_1011
  FROM journal_entries je
  WHERE jel.entry_id    = je.id
    AND je.reference_type = 'petty_cash'
    AND jel.account_id    = acct_1010;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE 'Remapped % journal_entry_lines from account 1010 → 1011.', rows_updated;
END $$;
