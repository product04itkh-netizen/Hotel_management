-- Add deposit_amount to invoices to track the initial deposit captured at invoice creation.
-- Backfill from payment_transactions for existing invoices.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2) DEFAULT 0;

-- Backfill: find the deposit payment transaction recorded at creation time
UPDATE invoices i
SET deposit_amount = COALESCE((
  SELECT pt.amount
  FROM payment_transactions pt
  WHERE pt.invoice_id = i.id
    AND pt.notes = 'Deposit recorded at invoice creation'
  ORDER BY pt.payment_date ASC
  LIMIT 1
), 0);
