-- Add explicit invoice_date column so the display date is independent of created_at.
-- Defaults to CURRENT_DATE for all future inserts (no app-side change needed).
-- Backfill strategy:
--   • Invoices linked to a reservation  → reservation check_out_date
--   • Invoices with no reservation link → DATE(created_at)

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS invoice_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Backfill from reservation check_out_date
UPDATE invoices i
SET invoice_date = r.check_out_date::DATE
FROM reservations r
WHERE i.reservation_id = r.id;

-- Backfill remainder from created_at
UPDATE invoices i
SET invoice_date = i.created_at::DATE
WHERE i.reservation_id IS NULL;
