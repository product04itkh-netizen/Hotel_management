-- Vendors, Bills (AP), and Bill Payments
-- Safe to re-run: IF NOT EXISTS guards throughout

-- ─── 1. vendors ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(200)  NOT NULL,
  contact_name   VARCHAR(150),
  email          VARCHAR(200),
  phone          VARCHAR(50),
  address        TEXT,
  tax_id         VARCHAR(100),
  payment_terms  INTEGER       NOT NULL DEFAULT 30,
  notes          TEXT,
  is_active      BOOLEAN       NOT NULL DEFAULT true,
  branch_id      UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendors_branch_id ON vendors(branch_id);
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

-- ─── 2. bills ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bills (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number         VARCHAR(50)   NOT NULL,
  vendor_id           UUID REFERENCES vendors(id) ON DELETE SET NULL,
  bill_date           DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date            DATE,
  expense_account_id  UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  description         TEXT          NOT NULL,
  subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid         NUMERIC(12,2) NOT NULL DEFAULT 0,
  status              VARCHAR(20)   NOT NULL DEFAULT 'unpaid'
                        CHECK (status IN ('unpaid','partial','paid','void')),
  notes               TEXT,
  journal_entry_id    UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  branch_id           UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bills_branch_id  ON bills(branch_id);
CREATE INDEX IF NOT EXISTS idx_bills_vendor_id  ON bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_bills_status     ON bills(status);
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

-- ─── 3. bill_payments ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bill_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id          UUID          NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  payment_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
  amount           NUMERIC(12,2) NOT NULL,
  payment_method   VARCHAR(30)   NOT NULL DEFAULT 'cash',
  reference        VARCHAR(200),
  notes            TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  branch_id        UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bp_bill_id    ON bill_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_bp_branch_id  ON bill_payments(branch_id);
ALTER TABLE bill_payments ENABLE ROW LEVEL SECURITY;

-- ─── 4. RLS policies ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vendors'
    AND policyname='Authenticated users can manage vendors') THEN
    CREATE POLICY "Authenticated users can manage vendors"
      ON vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bills'
    AND policyname='Authenticated users can manage bills') THEN
    CREATE POLICY "Authenticated users can manage bills"
      ON bills FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bill_payments'
    AND policyname='Authenticated users can manage bill_payments') THEN
    CREATE POLICY "Authenticated users can manage bill_payments"
      ON bill_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
