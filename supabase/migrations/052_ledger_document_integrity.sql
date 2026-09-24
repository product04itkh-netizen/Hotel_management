-- ============================================================
-- Migration 052: keep the ledger and its source documents honest
--
-- Found during the 2026-09-24 audit of two Srae Ambel electric bills:
-- someone unposted JE-20260912-9464 / JE-20260912-9679, re-converted the
-- riel amounts at 4,059.2 KHR/USD (the book's rate is 4,000 — see Kampot's
-- same-cycle R1,360,000 -> $340.00), re-posted, and the bills kept their
-- original totals. Srae Ambel's payables then read $159.91 on the Bills
-- page and $157.57 in the GL.
--
-- 1. Audit journal_entry_lines. Migration 045 deliberately skipped child
--    tables, which is why that amount change (63.53 -> 62.60) left no
--    record at all — only the posted/draft flips were logged.
-- 2. Make bill numbers unique per branch. They currently repeat across
--    branches (BILL-202608-001/002/003, BILL-202609-001 all exist twice)
--    while journal_entries.reference IS the bill number, so a check keyed
--    on reference can match the other branch's bill.
-- 3. One-off data corrections for what the audit found.
--
-- Safe to re-run: every statement is guarded.
-- ============================================================

-- ─── 1. Audit trail on journal entry lines ────────────────────────────────
-- Own function rather than log_audit_event(): lines carry no branch_id, so
-- the branch (which the audit UI filters on) is read from the parent entry,
-- and the parent's entry_number is folded into the logged JSON so the row
-- is readable without a join.
CREATE OR REPLACE FUNCTION log_journal_line_audit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row     jsonb;
  v_entry   uuid;
  v_number  text;
  v_status  text;
  v_branch  uuid;
  v_context jsonb;
  v_old     jsonb;
  v_new     jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := to_jsonb(OLD); ELSE v_row := to_jsonb(NEW); END IF;
  v_entry := (v_row->>'entry_id')::uuid;

  SELECT entry_number, status, branch_id
    INTO v_number, v_status, v_branch
    FROM journal_entries WHERE id = v_entry;

  v_context := jsonb_build_object('entry_number', v_number, 'entry_status', v_status);

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD) || v_context; v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL; v_new := to_jsonb(NEW) || v_context;
  ELSE
    v_old := to_jsonb(OLD) || v_context; v_new := to_jsonb(NEW) || v_context;
  END IF;

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, branch_id)
  VALUES ('journal_entry_lines', (v_row->>'id')::uuid, TG_OP, v_old, v_new, auth.uid(), v_branch);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_trg ON journal_entry_lines;
CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION log_journal_line_audit();

-- ─── 2. Bill numbers unique within a branch ───────────────────────────────
-- Fails loudly if a single branch ever issued the same number twice; that
-- would be real duplicate data needing a decision, not something to index
-- around. Cross-branch repeats stay legal.
CREATE UNIQUE INDEX IF NOT EXISTS bills_branch_number_uniq ON bills(branch_id, bill_number);

-- ─── 3. One-off corrections from the 2026-09-24 audit ─────────────────────

-- 3a. Restore the two Srae Ambel electric entries to their bills' amounts.
--     Guarded on the wrong value, so re-running does nothing.
UPDATE journal_entry_lines SET debit = 63.53
 WHERE entry_id = (SELECT id FROM journal_entries WHERE entry_number = 'JE-20260912-9464')
   AND debit = 62.60;
UPDATE journal_entry_lines SET credit = 63.53
 WHERE entry_id = (SELECT id FROM journal_entries WHERE entry_number = 'JE-20260912-9464')
   AND credit = 62.60;

UPDATE journal_entry_lines SET debit = 96.38
 WHERE entry_id = (SELECT id FROM journal_entries WHERE entry_number = 'JE-20260912-9679')
   AND debit = 94.97;
UPDATE journal_entry_lines SET credit = 96.38
 WHERE entry_id = (SELECT id FROM journal_entries WHERE entry_number = 'JE-20260912-9679')
   AND credit = 94.97;

-- 3b. JE-20260813-6033 (Kampot, $250) lost its reference, so any check keyed
--     on reference cannot see that BILL-202608-009 is already posted.
UPDATE journal_entries je SET reference = 'BILL-202608-009'
 WHERE je.entry_number = 'JE-20260813-6033'
   AND je.reference IS NULL
   AND EXISTS (SELECT 1 FROM bills b WHERE b.journal_entry_id = je.id AND b.bill_number = 'BILL-202608-009');

-- ─── Verification: run these after applying ───────────────────────────────
-- Every posted bill entry must equal its bill's total:
--   SELECT b.bill_number, br.location, b.total,
--          (SELECT SUM(l.credit) FROM journal_entry_lines l WHERE l.entry_id = b.journal_entry_id) AS je_credit
--     FROM bills b JOIN branches br ON br.id = b.branch_id
--    WHERE b.journal_entry_id IS NOT NULL
--      AND b.total <> (SELECT SUM(l.credit) FROM journal_entry_lines l WHERE l.entry_id = b.journal_entry_id);
--   -- expect 0 rows
--
-- Payables subledger vs GL 2100, per branch:
--   SELECT br.location,
--          (SELECT SUM(b.total - b.amount_paid) FROM bills b WHERE b.branch_id = br.id) AS bills_outstanding,
--          (SELECT COALESCE(SUM(l.credit - l.debit), 0)
--             FROM journal_entry_lines l
--             JOIN journal_entries je ON je.id = l.entry_id
--             JOIN chart_of_accounts a ON a.id = l.account_id
--            WHERE je.branch_id = br.id AND je.status = 'posted' AND NOT je.is_void
--              AND a.branch_id = br.id AND a.code = '2100') AS gl_ap
--     FROM branches br;
--   -- expect the two columns to match for both branches
