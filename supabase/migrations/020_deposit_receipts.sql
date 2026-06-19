-- Deposit receipts: deposits are held as a liability until checkout/cancellation.
-- Status flow: held → applied (invoice created) | held → refunded (cancellation).

CREATE TABLE IF NOT EXISTS deposit_receipts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT UNIQUE NOT NULL,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  branch_id      UUID REFERENCES branches(id),
  amount         NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  receipt_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status         TEXT NOT NULL DEFAULT 'held',  -- held | applied | refunded
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deposit_receipts_reservation_id_idx ON deposit_receipts(reservation_id);
CREATE INDEX IF NOT EXISTS deposit_receipts_branch_id_idx      ON deposit_receipts(branch_id);
CREATE INDEX IF NOT EXISTS deposit_receipts_status_idx         ON deposit_receipts(status);

-- ── Backfill existing reservations ────────────────────────────────────────────
-- Receipt number derives from reservation_number (RES-… → DR-…) for traceability.
-- Status inferred from current reservation status + whether an invoice exists.

INSERT INTO deposit_receipts (
  receipt_number, reservation_id, branch_id,
  amount, payment_method, receipt_date, status
)
SELECT
  'DR-' || SUBSTR(r.reservation_number, 5),   -- e.g. RES-20260618-4210 → DR-20260618-4210
  r.id,
  r.branch_id,
  r.deposit,
  COALESCE(r.deposit_method, 'cash'),
  r.created_at::date,
  CASE
    WHEN r.status IN ('cancelled', 'no_show') THEN 'refunded'
    WHEN EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.reservation_id = r.id
        AND i.status NOT IN ('void')
    ) THEN 'applied'
    ELSE 'held'
  END
FROM reservations r
WHERE r.deposit > 0
ON CONFLICT (receipt_number) DO NOTHING;
