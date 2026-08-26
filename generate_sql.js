const fs = require('fs');
const data = require('./chart_of_accounts_raw.json');

// Skip the header row
const rows = data.slice(1);

let sql = `-- ============================================================
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
`;

// Format values
const values = rows.map(row => {
    const code = String(row[0]).trim();
    // Escape single quotes in names (e.g., Owner's Capital)
    const name = String(row[1]).replace(/'/g, "''");
    const type = String(row[2]).trim();
    const category = String(row[3]).trim();
    return `      ('${code}', '${name}', '${type}', '${category}', b_id, true)`;
});

sql += values.join(',\n');

sql += `
    ON CONFLICT (code, branch_id) DO UPDATE SET
      name = EXCLUDED.name,
      type = EXCLUDED.type,
      category = EXCLUDED.category,
      is_active = true;

  END LOOP;
END;
$$;
`;

fs.writeFileSync('./supabase/migrations/022_update_chart_of_accounts.sql', sql);
console.log('Successfully generated 022_update_chart_of_accounts.sql');
