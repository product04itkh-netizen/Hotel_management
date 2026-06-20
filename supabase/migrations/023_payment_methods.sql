-- ============================================================
-- Migration 023: Dynamic Payment Methods table
-- Per-branch, fully editable list of payment methods used
-- for deposits and invoice payments.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID REFERENCES branches(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,          -- Display name, e.g. "ABA Pay"
  value        TEXT NOT NULL,          -- Slug key, e.g. "aba_pay"
  is_cash      BOOLEAN NOT NULL DEFAULT false, -- true → maps to account 1010, false → 1020
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, value)
);

-- Seed default methods for all existing branches
INSERT INTO payment_methods (branch_id, name, value, is_cash, sort_order)
SELECT
  b.id,
  m.name,
  m.value,
  m.is_cash,
  m.sort_order
FROM branches b
CROSS JOIN (
  VALUES
    ('Cash',        'cash',          true,  1),
    ('Bank Transfer','bank_transfer', false, 2),
    ('ABA Pay',     'aba_pay',       false, 3),
    ('Wing',        'wing',          false, 4),
    ('Bakong',      'bakong',        false, 5),
    ('Online (OTA)','online',        false, 6),
    ('Other',       'other',         false, 7)
) AS m(name, value, is_cash, sort_order)
ON CONFLICT (branch_id, value) DO NOTHING;
