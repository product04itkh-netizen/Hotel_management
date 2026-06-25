-- Per-item discounts on reservation line items and house rate
ALTER TABLE reservation_line_items ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS house_discount NUMERIC(10,2) NOT NULL DEFAULT 0;
