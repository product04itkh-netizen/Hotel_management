-- One-time migration: renumber all invoices to INV-YYYYMM-NNN format.
-- Orders by created_at within each month to preserve chronological sequence.
-- Also updates journal_entries.reference where it stored the old invoice number.

DO $$
DECLARE
  rec        RECORD;
  cur_month  TEXT := '';
  seq        INT  := 0;
  month_key  TEXT;
  old_number TEXT;
  new_number TEXT;
BEGIN
  FOR rec IN
    SELECT id, created_at, invoice_number
    FROM invoices
    ORDER BY created_at ASC
  LOOP
    month_key := TO_CHAR(rec.created_at AT TIME ZONE 'UTC', 'YYYYMM');

    IF month_key <> cur_month THEN
      cur_month := month_key;
      seq := 0;
    END IF;

    seq        := seq + 1;
    old_number := rec.invoice_number;
    new_number := 'INV-' || month_key || '-' || LPAD(seq::TEXT, 3, '0');

    UPDATE invoices
    SET invoice_number = new_number
    WHERE id = rec.id;

    -- Keep journal entry references in sync
    UPDATE journal_entries
    SET reference = new_number
    WHERE reference = old_number
      AND reference_type = 'invoice';
  END LOOP;
END $$;
