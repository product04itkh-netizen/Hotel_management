-- Migration 029: Add revenue_account_code to reservation_line_items
-- Eliminates keyword guessing in billing; set explicitly at reservation time.

ALTER TABLE reservation_line_items
  ADD COLUMN IF NOT EXISTS revenue_account_code VARCHAR(10) NOT NULL DEFAULT '4300';
