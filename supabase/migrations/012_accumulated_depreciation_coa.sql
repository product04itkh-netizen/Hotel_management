-- Add accumulated depreciation contra-asset accounts for all branches.
-- Contra-assets carry credit normal balances; shown as deductions under fixed assets.
-- Safe to re-run: ON CONFLICT DO NOTHING

INSERT INTO chart_of_accounts (code, name, type, category, branch_id)
SELECT v.code, v.name, v.type, v.category, b.id
FROM (VALUES
  ('1501', 'Accumulated Dep. — Buildings',  'asset', 'fixed_asset'),
  ('1502', 'Accumulated Dep. — Computers',  'asset', 'fixed_asset'),
  ('1503', 'Accumulated Dep. — Furniture',  'asset', 'fixed_asset'),
  ('1504', 'Accumulated Dep. — Machinery',  'asset', 'fixed_asset'),
  ('1505', 'Accumulated Dep. — Vehicles',   'asset', 'fixed_asset')
) AS v(code, name, type, category)
CROSS JOIN branches b
ON CONFLICT (code, branch_id) DO NOTHING;
