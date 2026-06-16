-- Sync reservations.deposit from invoices.amount_paid.
-- Fixes all existing records where payment was recorded in billing
-- but the reservation deposit field was never updated.
-- Safe to re-run: only sets deposit where invoice.amount_paid > reservation.deposit.

UPDATE reservations r
SET
  deposit    = i.amount_paid,
  updated_at = NOW()
FROM invoices i
WHERE i.reservation_id = r.id
  AND i.reservation_id IS NOT NULL
  AND i.amount_paid > COALESCE(r.deposit, 0);
