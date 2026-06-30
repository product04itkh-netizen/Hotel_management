-- Migration 028: Add Depreciation Expense account to COA for all branches
-- Code 5750 — sits between Laundry (5700) and Delivery (5800)
-- Required by assets/page.tsx runDepreciation() DR side

DO $$
DECLARE b_id UUID;
BEGIN
  FOR b_id IN SELECT id FROM branches LOOP
    INSERT INTO chart_of_accounts (code, name, type, category, branch_id, is_active)
    VALUES ('5750', 'Depreciation Expense', 'expense', 'operating_expense', b_id, true)
    ON CONFLICT (code, branch_id) DO UPDATE SET
      name      = EXCLUDED.name,
      type      = EXCLUDED.type,
      category  = EXCLUDED.category,
      is_active = true;
  END LOOP;
END $$;
