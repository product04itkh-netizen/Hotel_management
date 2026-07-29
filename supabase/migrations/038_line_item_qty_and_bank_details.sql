-- Migration 038: Reservation line item quantity + receipt bank transfer details
--
-- Cross-checked against Formats.xlsm (Reservation Form / Reservation / Receipt sheets):
--   - Every add-on slot in the legacy sheets carries Item / Qty / Amount as three
--     separate columns. Our reservation_line_items only stored a lump "amount",
--     so Qty had no home. Adding it here (default 1, so nothing existing breaks).
--   - The legacy Receipt sheet has a "Payment Information" block with bank name /
--     account name / account number for bank-transfer guests. hotel_settings had
--     no equivalent fields to print on our invoice/receipt.

ALTER TABLE reservation_line_items
  ADD COLUMN IF NOT EXISTS qty        INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2);

ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS bank_name           VARCHAR(200),
  ADD COLUMN IF NOT EXISTS bank_account_name   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(100);
