-- Migration 031: COA deduplication cleanup
-- Removes 13 duplicate accounts introduced by migration 022's paired-code pattern.
-- SAFE GUARD: raises EXCEPTION if any journal_entry_lines reference the duplicate
-- account IDs — must resolve those first before this migration can run.

DO $$
DECLARE
  _dup_codes TEXT[] := ARRAY[
    '1012','1041',
    '5010','5110','5210','5310','5410','5510',
    '5610','5710','5810','5910','6010'
  ];
  _je_count INTEGER;
  _conflict TEXT;
BEGIN

  -- ── 1. Safety check: any JE lines pointing at a duplicate account? ──────────
  SELECT COUNT(*)
  INTO _je_count
  FROM journal_entry_lines jel
  JOIN chart_of_accounts  coa ON coa.id = jel.account_id
  WHERE coa.code = ANY(_dup_codes);

  IF _je_count > 0 THEN
    -- Show which accounts are affected so the user knows what to reclassify
    SELECT string_agg(DISTINCT coa.code || ' (' || coa.name || ')', ', ' ORDER BY coa.code || ' (' || coa.name || ')')
    INTO _conflict
    FROM journal_entry_lines jel
    JOIN chart_of_accounts  coa ON coa.id = jel.account_id
    WHERE coa.code = ANY(_dup_codes);

    RAISE EXCEPTION
      'BLOCKED: % journal entry lines reference duplicate accounts [%]. '
      'Reclassify those lines to the kept accounts first.',
      _je_count, _conflict;
  END IF;

  -- ── 2. No JE references — safe to delete duplicates ────────────────────────
  DELETE FROM chart_of_accounts
  WHERE code = ANY(_dup_codes);

  RAISE NOTICE 'Duplicate COA accounts deleted.';
  -- PG echoes "DELETE N" to the message panel automatically

  -- ── 3. Trim trailing spaces from the kept accounts (all branches) ───────────
  UPDATE chart_of_accounts
  SET name = TRIM(name)
  WHERE name <> TRIM(name);

  RAISE NOTICE 'Trailing spaces trimmed from COA names.';

END $$;
