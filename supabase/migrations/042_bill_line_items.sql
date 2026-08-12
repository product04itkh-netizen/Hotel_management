-- Bills: support multiple expense lines per bill (a single bill can hit several
-- expense accounts). Breakdown stored as JSONB, mirroring invoices.items.
-- Each element: { account_id, account_code, account_name, description, amount }.
-- Safe to re-run.

ALTER TABLE bills ADD COLUMN IF NOT EXISTS line_items JSONB;

-- Backfill existing single-account bills into the new shape so old + new bills
-- render the same way. Uses the bill's expense_account_id + subtotal.
UPDATE bills b
SET line_items = jsonb_build_array(jsonb_build_object(
  'account_id',   b.expense_account_id,
  'account_code', coa.code,
  'account_name', coa.name,
  'description',  b.description,
  'amount',       b.subtotal
))
FROM chart_of_accounts coa
WHERE b.expense_account_id = coa.id
  AND b.line_items IS NULL
  AND b.expense_account_id IS NOT NULL;
