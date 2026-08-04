-- Migration 041: Void-and-reissue support for invoices
--
-- Lets a mistaken invoice be corrected without ever editing a posted
-- invoice/JE in place: void the original (kept permanently for audit),
-- link it to its replacement, and carry forward any cash already
-- collected onto the new invoice.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_superseded_by ON invoices(superseded_by_invoice_id);
