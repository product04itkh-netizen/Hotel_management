-- Reconcile seeded invoices with their linked reservation deposits.
-- Seeded invoices were inserted with amount_paid = total (all "paid"),
-- but reservations only collected a partial deposit in most cases.
-- This migration corrects amount_paid, status, and payment_transactions.
-- Safe to re-run: idempotent via explicit UPDATE/DELETE/INSERT logic.

DO $$
DECLARE
  inv RECORD;
  dep      NUMERIC;
  new_paid NUMERIC;
  new_status VARCHAR(20);
BEGIN
  FOR inv IN
    SELECT i.id, i.total, i.branch_id, COALESCE(r.deposit, 0) AS deposit
    FROM invoices i
    JOIN reservations r ON r.id = i.reservation_id
    WHERE i.reservation_id IS NOT NULL
  LOOP
    dep      := inv.deposit;
    new_paid := LEAST(dep, inv.total);

    IF inv.total > 0 AND new_paid >= inv.total THEN
      new_status := 'paid';
    ELSIF new_paid > 0 THEN
      new_status := 'partial';
    ELSE
      new_status := 'unpaid';
    END IF;

    -- Correct the invoice
    UPDATE invoices SET
      amount_paid = new_paid,
      status      = new_status,
      paid_at     = CASE WHEN new_status = 'paid' THEN NOW() ELSE NULL END,
      updated_at  = NOW()
    WHERE id = inv.id;

    -- Remove stale seeded payment_transactions for this invoice
    DELETE FROM payment_transactions WHERE invoice_id = inv.id;

    -- Re-insert a single deposit transaction where deposit > 0
    IF dep > 0 THEN
      INSERT INTO payment_transactions
        (invoice_id, amount, payment_method, payment_date, notes, branch_id)
      VALUES
        (inv.id, new_paid, 'cash', NOW(),
         'Deposit — reconciled from reservation', inv.branch_id);
    END IF;
  END LOOP;
END $$;
