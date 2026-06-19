-- Add discount fields to reservations so the reservation is the single source of truth.
-- discount_amount: flat dollar discount applied before invoicing.
-- discount_label:  human-readable reason (e.g. "Loyalty", "Promo code").

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS discount_label  TEXT DEFAULT NULL;
