-- ============================================================
-- Migration 022: Update Chart of Accounts based on 2026-06-19 Revision
-- Soft-deletes existing accounts and upserts the exact new list for all branches
-- ============================================================

DO $$
DECLARE
  b_id UUID;
BEGIN
  -- Loop through all branches
  FOR b_id IN SELECT id FROM branches LOOP
    
    -- 1. Soft-delete all existing accounts to ensure old/unused codes do not appear
    -- Existing journal entries linked to these IDs will remain intact.
    UPDATE chart_of_accounts 
    SET is_active = false 
    WHERE branch_id = b_id;

    -- 2. Upsert the revised chart of accounts
    INSERT INTO chart_of_accounts (code, name, type, category, branch_id, is_active)
    VALUES
      ('1010', 'Cash', 'asset', 'Bank', b_id, true),
      ('1011', 'Petty Cash ', 'asset', 'Bank', b_id, true),
      ('1012', 'Petty Cash ', 'asset', 'Bank', b_id, true),
      ('1020', 'Bank', 'asset', 'Bank', b_id, true),
      ('1030', 'Cash Advance', 'asset', 'current_asset', b_id, true),
      ('1040', 'Staff Loan ', 'asset', 'current_asset', b_id, true),
      ('1041', 'Staff Loan', 'asset', 'current_asset', b_id, true),
      ('1100', 'Accounts Receivable', 'asset', 'current_asset', b_id, true),
      ('1200', 'Prepaid Expenses', 'asset', 'current_asset', b_id, true),
      ('1300', 'Inventory & Supplies', 'asset', 'current_asset', b_id, true),
      ('1500', 'Buildings', 'asset', 'current_asset', b_id, true),
      ('1501', 'Accumulated Dep. — Buildings', 'asset', 'current_asset', b_id, true),
      ('1510', 'Computers', 'asset', 'current_asset', b_id, true),
      ('1511', 'Accumulated Dep. — Computers', 'asset', 'current_asset', b_id, true),
      ('1520', 'Furniture', 'asset', 'current_asset', b_id, true),
      ('1521', 'Accumulated Dep. — Furniture', 'asset', 'current_asset', b_id, true),
      ('1530', 'Machinery', 'asset', 'current_asset', b_id, true),
      ('1531', 'Accumulated Dep. — Machinery', 'asset', 'current_asset', b_id, true),
      ('1540', 'Vehicles', 'asset', 'current_asset', b_id, true),
      ('1541', 'Accumulated Dep. — Vehicles', 'asset', 'fixed_asset', b_id, true),
      ('2100', 'Accounts Payable', 'liability', 'current_liability', b_id, true),
      ('2200', 'Guest Deposits Received', 'liability', 'current_liability', b_id, true),
      ('3100', 'Owner''s Capital', 'equity', 'equity', b_id, true),
      ('3200', 'Retained Earnings', 'equity', 'equity', b_id, true),
      ('4000', 'House Rental Revenue', 'revenue', 'operating_revenue', b_id, true),
      ('4100', 'Food & Beverage Revenue', 'revenue', 'operating_revenue', b_id, true),
      ('4200', 'Activity & Rental Revenue', 'revenue', 'operating_revenue', b_id, true),
      ('4300', 'Other Revenue', 'revenue', 'operating_revenue', b_id, true),
      ('5000', 'Salary Expense ', 'expense', 'operating_expense', b_id, true),
      ('5010', 'Salary Expense', 'expense', 'operating_expense', b_id, true),
      ('5100', 'Utilities Expense ', 'expense', 'operating_expense', b_id, true),
      ('5110', 'Utilities Expense', 'expense', 'operating_expense', b_id, true),
      ('5200', 'Telephone and Internet Expense ', 'expense', 'operating_expense', b_id, true),
      ('5210', 'Telephone and Internet Expense ', 'expense', 'operating_expense', b_id, true),
      ('5300', 'Food and Grocery Expense ', 'expense', 'operating_expense', b_id, true),
      ('5310', 'Food and Grocery Expense ', 'expense', 'operating_expense', b_id, true),
      ('5400', 'Repairs and Maintenance Expense ', 'expense', 'operating_expense', b_id, true),
      ('5410', 'Repairs and Maintenance Expense ', 'expense', 'operating_expense', b_id, true),
      ('5500', 'Petroleum Expense ', 'expense', 'operating_expense', b_id, true),
      ('5510', 'Petroleum Expense ', 'expense', 'operating_expense', b_id, true),
      ('5600', 'Gas and Charcoal Expense ', 'expense', 'operating_expense', b_id, true),
      ('5610', 'Gas and Charcoal Expense', 'expense', 'operating_expense', b_id, true),
      ('5700', 'Laundry Expense ', 'expense', 'operating_expense', b_id, true),
      ('5710', 'Laundry Expense ', 'expense', 'operating_expense', b_id, true),
      ('5800', 'Delivery Expense ', 'expense', 'operating_expense', b_id, true),
      ('5810', 'Delivery Expense ', 'expense', 'operating_expense', b_id, true),
      ('5900', 'Beverages Expense ', 'expense', 'operating_expense', b_id, true),
      ('5910', 'Beverages Expense ', 'expense', 'operating_expense', b_id, true),
      ('6000', 'Other Expense ', 'expense', 'operating_expense', b_id, true),
      ('6010', 'Other Expense ', 'expense', 'operating_expense', b_id, true)
    ON CONFLICT (code, branch_id) DO UPDATE SET
      name = EXCLUDED.name,
      type = EXCLUDED.type,
      category = EXCLUDED.category,
      is_active = true;

  END LOOP;
END;
$$;
