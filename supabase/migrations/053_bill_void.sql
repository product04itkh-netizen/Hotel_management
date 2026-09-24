-- ============================================================
-- Migration 053: voiding a bill
--
-- Bills were write-once: no edit, no void. A wrong amount therefore had
-- to be corrected through its journal entry, which is exactly how the
-- bill and the ledger drifted apart in Sep 2026 (see migration 052), and
-- a test bill recorded in June could never be cleared.
--
-- The Bills page can now void a bill (reversing its recording entry and
-- every payment entry) and edit one (moving the bill and its entry
-- together). Voiding keeps the row for audit, so it needs a reason and a
-- timestamp — the same shape invoices already use.
--
-- bills.status already allows 'void' (migration 010), so no constraint
-- change is needed.
--
-- Safe to re-run.
-- ============================================================

ALTER TABLE bills ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;

-- Voided bills are excluded from payables everywhere, so this index keeps
-- the "what do we still owe" reads cheap as void rows accumulate.
CREATE INDEX IF NOT EXISTS idx_bills_branch_status ON bills(branch_id, status);

-- ─── Verification ─────────────────────────────────────────────────────────
-- Columns present:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'bills' AND column_name IN ('void_reason','voided_at');
--   -- expect 2 rows
--
-- After voiding a bill, its entries must all be void and it must drop out
-- of payables:
--   SELECT b.bill_number, b.status, b.void_reason,
--          (SELECT COUNT(*) FROM journal_entries je
--            WHERE je.id = b.journal_entry_id AND NOT je.is_void) AS live_entries
--     FROM bills b WHERE b.status = 'void';
--   -- expect live_entries = 0 for every row
