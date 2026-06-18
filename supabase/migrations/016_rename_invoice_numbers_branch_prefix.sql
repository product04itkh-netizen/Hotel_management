-- Rename existing invoice numbers to branch-prefixed format.
-- Old format: INV-YYYYMM-NNN
-- New format: INV-{BRANCH_CODE}-YYYYMM-NNN
--   Kampot    → INV-KAM-YYYYMM-NNN
--   Srae Ambel → INV-SA-YYYYMM-NNN
--
-- Also updates journal_entries.reference where it stored the old invoice number.

BEGIN;

-- ── Kampot ────────────────────────────────────────────────────────────────────

UPDATE invoices
SET invoice_number = REGEXP_REPLACE(invoice_number, '^INV-(\d{6}-.+)$', 'INV-KAM-\1')
WHERE branch_id = (SELECT id FROM branches WHERE location = 'Kampot' LIMIT 1)
  AND invoice_number ~ '^INV-\d{6}-.+$';

UPDATE journal_entries
SET reference = REGEXP_REPLACE(reference, '^INV-(\d{6}-.+)$', 'INV-KAM-\1')
WHERE branch_id = (SELECT id FROM branches WHERE location = 'Kampot' LIMIT 1)
  AND reference ~ '^INV-\d{6}-.+$';

-- ── Srae Ambel ────────────────────────────────────────────────────────────────

UPDATE invoices
SET invoice_number = REGEXP_REPLACE(invoice_number, '^INV-(\d{6}-.+)$', 'INV-SA-\1')
WHERE branch_id = (SELECT id FROM branches WHERE location = 'Srae Ambel' LIMIT 1)
  AND invoice_number ~ '^INV-\d{6}-.+$';

UPDATE journal_entries
SET reference = REGEXP_REPLACE(reference, '^INV-(\d{6}-.+)$', 'INV-SA-\1')
WHERE branch_id = (SELECT id FROM branches WHERE location = 'Srae Ambel' LIMIT 1)
  AND reference ~ '^INV-\d{6}-.+$';

COMMIT;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Should show only the new prefixed format; old INV-YYYYMM-NNN rows = 0.

SELECT
  b.location,
  i.invoice_number,
  i.branch_id
FROM invoices i
JOIN branches b ON b.id = i.branch_id
ORDER BY b.location, i.invoice_number;
