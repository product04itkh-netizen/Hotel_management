-- ============================================================
-- Migration 025: Reclassify Historical Revenue JE Lines
-- ============================================================
-- Background:
--   Migration 005 created: 4100 = House Rental Revenue, 4200 = Food & Beverage Revenue
--   Migration 022 re-mapped:  4000 = House Rental Revenue, 4100 = Food & Beverage Revenue
--   The billing code always targeted the ACCOUNT CODE '4000' going forward, but
--   any JE lines posted before migration 022 targeted the account whose code was
--   '4100' at the time (which was called "House Rental Revenue" then, but after
--   migration 022 that same account row was renamed to "Food & Beverage Revenue").
--   This caused the P&L to incorrectly show house rental payments as F&B Revenue.
--
-- Fix: For every branch, re-point JE lines that target the current '4100' account
--      (F&B Revenue, formerly House Rental) to the current '4000' account
--      (House Rental Revenue) when the parent JE reference_type is an invoice
--      payment or deposit_applied (i.e. not a genuine F&B transaction).
-- ============================================================

DO $$
DECLARE
  b_id       UUID;
  old_acc_id UUID;  -- the current '4100' account (was House Rental, now labeled F&B)
  new_acc_id UUID;  -- the current '4000' account (House Rental Revenue)
  rows_updated INT;
BEGIN
  FOR b_id IN SELECT id FROM branches LOOP

    -- Get the current '4100' account for this branch (the F&B-labeled one that held old rentals)
    SELECT id INTO old_acc_id
    FROM chart_of_accounts
    WHERE branch_id = b_id AND code = '4100';

    -- Get the current '4000' account for this branch (House Rental Revenue)
    SELECT id INTO new_acc_id
    FROM chart_of_accounts
    WHERE branch_id = b_id AND code = '4000';

    IF old_acc_id IS NOT NULL AND new_acc_id IS NOT NULL AND old_acc_id <> new_acc_id THEN

      -- Reclassify JE lines on non-voided invoice/deposit JEs from 4100 → 4000
      UPDATE journal_entry_lines jel
      SET account_id = new_acc_id
      FROM journal_entries je
      WHERE jel.entry_id = je.id
        AND je.branch_id = b_id
        AND je.is_void = false
        AND je.reference_type IN ('invoice', 'deposit_applied', 'deposit_applied_manual')
        AND jel.account_id = old_acc_id;

      GET DIAGNOSTICS rows_updated = ROW_COUNT;
      RAISE NOTICE 'Branch %: reclassified % JE lines from account 4100 → 4000', b_id, rows_updated;

    ELSIF old_acc_id IS NULL THEN
      RAISE NOTICE 'Branch %: no 4100 account found, skipping', b_id;
    ELSIF new_acc_id IS NULL THEN
      RAISE NOTICE 'Branch %: no 4000 account found, skipping', b_id;
    END IF;

  END LOOP;
END;
$$;
