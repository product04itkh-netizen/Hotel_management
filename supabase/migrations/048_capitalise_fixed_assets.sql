-- ============================================================
-- Migration 048: Capitalise the fixed-asset registers into the GL
--
-- The Fixed Assets module and the general ledger have never been
-- connected: 1500-1799 carry no journal activity at all, so the balance
-- sheet showed $0 of fixed assets while the register held $1,073,521.69
-- across the two branches. This books the registers onto the accounts,
-- crediting Owner's Capital, since these are pre-existing assets being
-- brought onto the books rather than new purchases funded by cash.
--
-- Two corrections are needed first:
--   * There was no Land account. Kampot holds $345,000 of land with
--     nowhere to post it, so 1550 Land is added (inside the 1500-1799
--     range the balance sheet groups as Fixed Assets).
--   * The asset accounts were still named Computers / Machinery /
--     Vehicles, which no longer matches the register after migration 046.
--     They are renamed to the workbook categories they now hold --
--     otherwise the linen balance would sit under "Computers" and the
--     kitchen balance under "Machinery" on the face of the balance sheet.
--     Codes are unchanged, so nothing that references them breaks.
--
-- These accounts were also mis-tagged category 'current_asset'; corrected
-- to 'fixed_asset'. That field is descriptive only -- the balance sheet
-- groups by code -- but it was wrong.
--
-- Dated 2026-08-01, the depreciation start date the workbooks use, so the
-- assets are on the books before the first depreciation run. No period is
-- closed. Safe to re-run: the entry is keyed on reference 'FA-OPENING'
-- and is skipped if already present.
-- ============================================================

-- ─── Account names & classification ───────────────────────────
UPDATE chart_of_accounts SET name = 'Buildings, Const. & Renovations', category = 'fixed_asset', updated_at = NOW() WHERE code = '1500';
UPDATE chart_of_accounts SET name = 'Accumulated Dep. — Buildings', category = 'fixed_asset', updated_at = NOW() WHERE code = '1501';
UPDATE chart_of_accounts SET name = 'Operating Equipment / Linen', category = 'fixed_asset', updated_at = NOW() WHERE code = '1510';
UPDATE chart_of_accounts SET name = 'Accumulated Dep. — Operating Equipment / Linen', category = 'fixed_asset', updated_at = NOW() WHERE code = '1511';
UPDATE chart_of_accounts SET name = 'Furniture Fixture & Other Equipment', category = 'fixed_asset', updated_at = NOW() WHERE code = '1520';
UPDATE chart_of_accounts SET name = 'Accumulated Dep. — Furniture Fixture & Other Equipment', category = 'fixed_asset', updated_at = NOW() WHERE code = '1521';
UPDATE chart_of_accounts SET name = 'Kitchen Equipment', category = 'fixed_asset', updated_at = NOW() WHERE code = '1530';
UPDATE chart_of_accounts SET name = 'Accumulated Dep. — Kitchen Equipment', category = 'fixed_asset', updated_at = NOW() WHERE code = '1531';
UPDATE chart_of_accounts SET name = 'Machinery, Vehicle, Truck & Others', category = 'fixed_asset', updated_at = NOW() WHERE code = '1540';
UPDATE chart_of_accounts SET name = 'Accumulated Dep. — Machinery, Vehicle, Truck & Others', category = 'fixed_asset', updated_at = NOW() WHERE code = '1541';
UPDATE chart_of_accounts SET category = 'fixed_asset', updated_at = NOW() WHERE code IN ('1502','1503','1504','1505');

-- ─── Land account (did not exist) ─────────────────────────────
INSERT INTO chart_of_accounts (code, name, type, category, is_active, branch_id)
  SELECT '1550', 'Land', 'asset', 'fixed_asset', true, 'c9f2b971-d2ea-421c-bb80-c5692ea9c60b'
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1550' AND branch_id = 'c9f2b971-d2ea-421c-bb80-c5692ea9c60b');
INSERT INTO chart_of_accounts (code, name, type, category, is_active, branch_id)
  SELECT '1550', 'Land', 'asset', 'fixed_asset', true, '97bca41f-1ab5-4a42-9b65-0d45d6117a30'
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1550' AND branch_id = '97bca41f-1ab5-4a42-9b65-0d45d6117a30');

-- ─── Kampot: capitalise register  (DR asset accounts / CR 3100)  $826166.08 ───
DO $$
DECLARE v_entry UUID; v_branch UUID := 'c9f2b971-d2ea-421c-bb80-c5692ea9c60b';
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference = 'FA-OPENING' AND branch_id = v_branch AND NOT is_void) THEN
    RAISE NOTICE 'FA-OPENING already posted for Kampot — skipping'; RETURN;
  END IF;

  INSERT INTO journal_entries (entry_number, entry_date, reference, reference_type, description, status, branch_id)
  VALUES ('JE-20260801-5857', '2026-08-01', 'FA-OPENING', 'manual', 'Opening capitalisation of fixed asset register — Kampot', 'posted', v_branch)
  RETURNING id INTO v_entry;

  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  SELECT v_entry, id, 'Buildings, Const. & Renovations', 416920.83, 0 FROM chart_of_accounts WHERE code = '1500' AND branch_id = v_branch;
  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  SELECT v_entry, id, 'Operating Equipment / Linen', 3280.75, 0 FROM chart_of_accounts WHERE code = '1510' AND branch_id = v_branch;
  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  SELECT v_entry, id, 'Furniture Fixture & Other Equipment', 29782.50, 0 FROM chart_of_accounts WHERE code = '1520' AND branch_id = v_branch;
  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  SELECT v_entry, id, 'Kitchen Equipment', 252.00, 0 FROM chart_of_accounts WHERE code = '1530' AND branch_id = v_branch;
  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  SELECT v_entry, id, 'Machinery, Vehicle, Truck & Others', 30930.00, 0 FROM chart_of_accounts WHERE code = '1540' AND branch_id = v_branch;
  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  SELECT v_entry, id, 'Land', 345000.00, 0 FROM chart_of_accounts WHERE code = '1550' AND branch_id = v_branch;

  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  SELECT v_entry, id, 'Opening fixed assets contributed by owner', 0, 826166.08 FROM chart_of_accounts WHERE code = '3100' AND branch_id = v_branch;
END $$;

-- ─── Srae Ambel: capitalise register  (DR asset accounts / CR 3100)  $247355.61 ───
DO $$
DECLARE v_entry UUID; v_branch UUID := '97bca41f-1ab5-4a42-9b65-0d45d6117a30';
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference = 'FA-OPENING' AND branch_id = v_branch AND NOT is_void) THEN
    RAISE NOTICE 'FA-OPENING already posted for Srae Ambel — skipping'; RETURN;
  END IF;

  INSERT INTO journal_entries (entry_number, entry_date, reference, reference_type, description, status, branch_id)
  VALUES ('JE-20260801-9304', '2026-08-01', 'FA-OPENING', 'manual', 'Opening capitalisation of fixed asset register — Srae Ambel', 'posted', v_branch)
  RETURNING id INTO v_entry;

  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  SELECT v_entry, id, 'Buildings, Const. & Renovations', 210041.16, 0 FROM chart_of_accounts WHERE code = '1500' AND branch_id = v_branch;
  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  SELECT v_entry, id, 'Furniture Fixture & Other Equipment', 10114.45, 0 FROM chart_of_accounts WHERE code = '1520' AND branch_id = v_branch;
  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  SELECT v_entry, id, 'Machinery, Vehicle, Truck & Others', 27200.00, 0 FROM chart_of_accounts WHERE code = '1540' AND branch_id = v_branch;

  INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
  SELECT v_entry, id, 'Opening fixed assets contributed by owner', 0, 247355.61 FROM chart_of_accounts WHERE code = '3100' AND branch_id = v_branch;
END $$;
