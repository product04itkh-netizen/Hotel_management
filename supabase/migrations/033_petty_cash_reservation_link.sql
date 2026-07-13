-- Migration 033: Link petty cash transactions to reservations
-- Nullable FKs — most petty cash has no reservation link.
-- reservation_line_item_id is a sub-link to a specific add-on on the reservation.

ALTER TABLE petty_cash_transactions
  ADD COLUMN IF NOT EXISTS reservation_id           UUID REFERENCES reservations(id)            ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservation_line_item_id UUID REFERENCES reservation_line_items(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pc_reservation_id ON petty_cash_transactions(reservation_id);
