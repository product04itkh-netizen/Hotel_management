-- Migration 039: Lightweight inventory / stock module
--
-- Distinct from fixed_assets (capital items that depreciate over years) and
-- from the service_catalog (items sold to guests). Inventory is consumable
-- stock (cleaning supplies, laundry chemicals, kitchen ingredients, etc.)
-- that gets purchased into 1300 — Inventory & Supplies (an asset), then
-- expensed only when actually consumed.
--
-- On-hand quantity is intentionally NOT a stored running counter — it's
-- derived client-side by summing inventory_transactions, same pattern the
-- Petty Cash balance already uses, so there's no drift to go wrong.

CREATE TABLE IF NOT EXISTS inventory_items (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id             UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name                  VARCHAR(200) NOT NULL,
  unit                  VARCHAR(30) NOT NULL DEFAULT 'unit',
  category              VARCHAR(20) NOT NULL DEFAULT 'other'
                          CHECK (category IN ('food', 'cleaning', 'laundry', 'beverage', 'fuel', 'other')),
  expense_account_code  VARCHAR(10) NOT NULL DEFAULT '6000',
  reorder_point         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  last_unit_cost        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (last_unit_cost >= 0),
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, name)
);

CREATE INDEX IF NOT EXISTS idx_inv_items_branch ON inventory_items(branch_id, is_active);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory_items'
      AND policyname = 'Authenticated users can manage inventory_items'
  ) THEN
    CREATE POLICY "Authenticated users can manage inventory_items"
      ON inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id                   UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  item_id                     UUID        NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  transaction_type            VARCHAR(20) NOT NULL
                                CHECK (transaction_type IN ('purchase', 'consumption', 'adjustment_in', 'adjustment_out')),
  quantity                    NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_cost                   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  notes                       TEXT,
  transaction_date            DATE        NOT NULL DEFAULT CURRENT_DATE,
  petty_cash_transaction_id   UUID        REFERENCES petty_cash_transactions(id) ON DELETE SET NULL,
  journal_entry_id            UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_txn_branch ON inventory_transactions(branch_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_inv_txn_item   ON inventory_transactions(item_id);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory_transactions'
      AND policyname = 'Authenticated users can manage inventory_transactions'
  ) THEN
    CREATE POLICY "Authenticated users can manage inventory_transactions"
      ON inventory_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
