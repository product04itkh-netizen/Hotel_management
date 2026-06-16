-- ============================================================
-- Full Accounting System: COA, Journal Entries, Petty Cash
-- Safe to re-run: IF NOT EXISTS guards throughout
-- ============================================================

-- ─── 1. payment_transactions ─────────────────────────────────
-- Audit trail for every individual payment event on an invoice
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount            NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method    VARCHAR(50)   NOT NULL DEFAULT 'cash',
  payment_date      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  notes             TEXT,
  journal_entry_id  UUID,         -- populated after JE is created
  branch_id         UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pt_invoice_id ON payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pt_branch_id  ON payment_transactions(branch_id);
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- ─── 2. chart_of_accounts ────────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code       VARCHAR(20)  NOT NULL,
  name       VARCHAR(200) NOT NULL,
  type       VARCHAR(20)  NOT NULL DEFAULT 'expense'
               CHECK (type IN ('asset','liability','equity','revenue','expense')),
  category   VARCHAR(100) NOT NULL DEFAULT '',
  is_active  BOOLEAN      NOT NULL DEFAULT true,
  branch_id  UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  updated_at TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (code, branch_id)
);
DROP TRIGGER IF EXISTS coa_updated_at ON chart_of_accounts;
CREATE TRIGGER coa_updated_at
  BEFORE UPDATE ON chart_of_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS idx_coa_type      ON chart_of_accounts(type);
CREATE INDEX IF NOT EXISTS idx_coa_branch_id ON chart_of_accounts(branch_id);
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

-- ─── 3. journal_entries (header) ─────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  entry_number     VARCHAR(30)  NOT NULL UNIQUE,
  entry_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
  reference        VARCHAR(100),          -- e.g. INV-20260616-0001
  reference_type   VARCHAR(50),           -- invoice | reservation | petty_cash | manual
  description      TEXT         NOT NULL,
  branch_id        UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW()
);
DROP TRIGGER IF EXISTS je_updated_at ON journal_entries;
CREATE TRIGGER je_updated_at
  BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS idx_je_entry_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_je_branch_id  ON journal_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_je_reference  ON journal_entries(reference);
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- ─── 4. journal_entry_lines (debit / credit rows) ────────────
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  entry_id    UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES chart_of_accounts(id),
  description TEXT,
  debit       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jel_entry_id   ON journal_entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account_id ON journal_entry_lines(account_id);
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- ─── 5. petty_cash_transactions ──────────────────────────────
CREATE TABLE IF NOT EXISTS petty_cash_transactions (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  transaction_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
  description       TEXT         NOT NULL,
  category          VARCHAR(100) NOT NULL DEFAULT 'General',
  amount            NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  transaction_type  VARCHAR(10)  NOT NULL DEFAULT 'out'
                      CHECK (transaction_type IN ('in','out')),
  reference         VARCHAR(100),
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  branch_id         UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pc_branch_id ON petty_cash_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_pc_date      ON petty_cash_transactions(transaction_date);
ALTER TABLE petty_cash_transactions ENABLE ROW LEVEL SECURITY;

-- ─── 6. Add house_id to invoices ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='invoices' AND column_name='house_id') THEN
    ALTER TABLE invoices ADD COLUMN house_id UUID REFERENCES houses(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_invoices_house_id ON invoices(house_id);
  END IF;
END;
$$;

-- ─── 7. FK from payment_transactions → journal_entries ───────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payment_transactions_journal_entry_id_fkey'
      AND table_name = 'payment_transactions'
  ) THEN
    ALTER TABLE payment_transactions
      ADD CONSTRAINT payment_transactions_journal_entry_id_fkey
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ─── 8. RLS policies ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payment_transactions'
    AND policyname='Authenticated users can manage payment_transactions') THEN
    CREATE POLICY "Authenticated users can manage payment_transactions"
      ON payment_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chart_of_accounts'
    AND policyname='Authenticated users can manage chart_of_accounts') THEN
    CREATE POLICY "Authenticated users can manage chart_of_accounts"
      ON chart_of_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='journal_entries'
    AND policyname='Authenticated users can manage journal_entries') THEN
    CREATE POLICY "Authenticated users can manage journal_entries"
      ON journal_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='journal_entry_lines'
    AND policyname='Authenticated users can manage journal_entry_lines') THEN
    CREATE POLICY "Authenticated users can manage journal_entry_lines"
      ON journal_entry_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='petty_cash_transactions'
    AND policyname='Authenticated users can manage petty_cash_transactions') THEN
    CREATE POLICY "Authenticated users can manage petty_cash_transactions"
      ON petty_cash_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END;
$$;

-- ─── 9. Seed Chart of Accounts for all branches ──────────────
-- Standard resort COA. Uses UNIQUE(code, branch_id) to avoid duplicates on re-run.
INSERT INTO chart_of_accounts (code, name, type, category, branch_id)
SELECT coa.code, coa.name, coa.type, coa.category, b.id
FROM (VALUES
  ('1010', 'Cash on Hand (Petty Cash)',  'asset',     'current_asset'),
  ('1020', 'Cash at Bank (ABA)',          'asset',     'current_asset'),
  ('1100', 'Accounts Receivable',         'asset',     'current_asset'),
  ('1200', 'Prepaid Expenses',            'asset',     'current_asset'),
  ('1300', 'Inventory & Supplies',        'asset',     'current_asset'),
  ('2100', 'Accounts Payable',            'liability', 'current_liability'),
  ('2200', 'Guest Deposits Received',     'liability', 'current_liability'),
  ('2300', 'VAT / Tax Payable',           'liability', 'current_liability'),
  ('3100', 'Owner''s Capital',            'equity',    'equity'),
  ('3200', 'Retained Earnings',           'equity',    'equity'),
  ('4100', 'House Rental Revenue',        'revenue',   'operating_revenue'),
  ('4200', 'Food & Beverage Revenue',     'revenue',   'operating_revenue'),
  ('4300', 'Activity & Rental Revenue',   'revenue',   'operating_revenue'),
  ('4400', 'Other Revenue',               'revenue',   'operating_revenue'),
  ('5100', 'Payroll & Benefits',          'expense',   'operating_expense'),
  ('5200', 'Utilities',                   'expense',   'operating_expense'),
  ('5300', 'Maintenance & Repairs',       'expense',   'operating_expense'),
  ('5400', 'Supplies & Consumables',      'expense',   'operating_expense'),
  ('5500', 'Marketing & Advertising',     'expense',   'operating_expense'),
  ('5600', 'Bank Charges & Fees',         'expense',   'operating_expense'),
  ('5700', 'Depreciation',               'expense',   'operating_expense'),
  ('5800', 'Miscellaneous Expenses',     'expense',   'operating_expense')
) AS coa(code, name, type, category)
CROSS JOIN branches b
ON CONFLICT (code, branch_id) DO NOTHING;
