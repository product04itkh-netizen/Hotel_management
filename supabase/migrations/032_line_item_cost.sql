-- Migration 032: Add cost tracking to reservation_line_items
-- B1 implementation: cost_amount and cost_account_code stored for margin
-- reporting only. No COGS JE auto-posting — expense is still recorded
-- separately through Petty Cash / Bills to avoid double-counting.

ALTER TABLE reservation_line_items
  ADD COLUMN IF NOT EXISTS cost_amount       NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cost_account_code VARCHAR(10)   DEFAULT NULL;
