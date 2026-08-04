-- Migration 040: Allow 'opening_balance' as an inventory_transactions type
--
-- Add Item only had "Starting Unit Cost" (a cost basis for future usage),
-- with no way to declare quantity you already physically have on hand when
-- onboarding an item. Record Purchase isn't the right tool for that — it
-- always creates a Petty Cash outflow, which is wrong for stock you already
-- own. This adds a distinct 'opening_balance' type, posted DR 1300 /
-- CR an equity offset account, same pattern already used for Chart of
-- Accounts opening balances.

ALTER TABLE inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;

ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (transaction_type IN ('purchase', 'consumption', 'adjustment_in', 'adjustment_out', 'opening_balance'));
