-- Accounting system enhancements
-- Phase 1 Bug Fixes + Phase 2 Missing Features + Phase 3 Partial Completions
-- Safe to re-run: IF NOT EXISTS / DO $$ guards throughout

-- ─── 1. Void support on journal_entries ──────────────────────────────────────
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS is_void       BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- ─── 2. Unique bill number per branch (Bug Fix 3) ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bills_number_branch_unique'
  ) THEN
    ALTER TABLE bills ADD CONSTRAINT bills_number_branch_unique
      UNIQUE (bill_number, branch_id);
  END IF;
END $$;

-- ─── 3. Accounting periods (Period Close feature) ────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_periods (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  year       INTEGER     NOT NULL,
  month      INTEGER     NOT NULL CHECK (month BETWEEN 1 AND 12),
  status     VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at  TIMESTAMPTZ,
  notes      TEXT,
  branch_id  UUID        REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_branch ON accounting_periods(branch_id);
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;

-- ─── 4. Recurring journal entry templates ────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_journal_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  description   TEXT        NOT NULL,
  frequency     VARCHAR(20) NOT NULL DEFAULT 'monthly'
                  CHECK (frequency IN ('monthly','quarterly','annual')),
  next_due_date DATE        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  lines         JSONB       NOT NULL DEFAULT '[]',
  branch_id     UUID        REFERENCES branches(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rje_branch ON recurring_journal_entries(branch_id);
ALTER TABLE recurring_journal_entries ENABLE ROW LEVEL SECURITY;

-- ─── 5. Bank reconciliations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID         NOT NULL REFERENCES chart_of_accounts(id),
  statement_date    DATE         NOT NULL,
  statement_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  status            VARCHAR(10)  NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  branch_id         UUID         REFERENCES branches(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;

-- ─── 6. Reconciliation columns on journal_entry_lines ────────────────────────
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS is_reconciled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciliation_id UUID    REFERENCES bank_reconciliations(id) ON DELETE SET NULL;

-- ─── 7. Depreciation run log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS depreciation_runs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  run_year         INTEGER       NOT NULL,
  run_month        INTEGER       NOT NULL CHECK (run_month BETWEEN 1 AND 12),
  journal_entry_id UUID          REFERENCES journal_entries(id) ON DELETE SET NULL,
  total_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  asset_count      INTEGER       NOT NULL DEFAULT 0,
  branch_id        UUID          REFERENCES branches(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (run_year, run_month, branch_id)
);
ALTER TABLE depreciation_runs ENABLE ROW LEVEL SECURITY;

-- ─── 8. RLS policies for new tables ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='accounting_periods'
      AND policyname='Auth users manage accounting_periods') THEN
    CREATE POLICY "Auth users manage accounting_periods"
      ON accounting_periods FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recurring_journal_entries'
      AND policyname='Auth users manage recurring_journal_entries') THEN
    CREATE POLICY "Auth users manage recurring_journal_entries"
      ON recurring_journal_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bank_reconciliations'
      AND policyname='Auth users manage bank_reconciliations') THEN
    CREATE POLICY "Auth users manage bank_reconciliations"
      ON bank_reconciliations FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='depreciation_runs'
      AND policyname='Auth users manage depreciation_runs') THEN
    CREATE POLICY "Auth users manage depreciation_runs"
      ON depreciation_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
