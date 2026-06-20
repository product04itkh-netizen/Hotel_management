-- ============================================================
-- Migration 024: Add account_code to payment_methods
-- Allows each payment method to map to a specific COA account
-- (not just a binary 1010 / 1020 toggle).
-- ============================================================

ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS account_code TEXT;

-- Back-fill defaults: cash → 1010, everything else → 1020
UPDATE payment_methods
SET account_code = CASE WHEN is_cash THEN '1010' ELSE '1020' END
WHERE account_code IS NULL;
