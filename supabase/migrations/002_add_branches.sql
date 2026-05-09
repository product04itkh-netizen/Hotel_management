-- ============================================================
-- OnlyOne Homestay — Multi-Branch Schema
-- Safe to re-run: uses IF NOT EXISTS and ON CONFLICT guards
-- ============================================================

-- ─────────────────────────────────────────
-- BRANCHES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,                  -- e.g. "OnlyOne Homestay"
  location    VARCHAR(200) NOT NULL,                  -- e.g. "Kampot"
  address     TEXT,
  phone       VARCHAR(50),
  email       VARCHAR(200),
  is_active   BOOLEAN       DEFAULT true,
  created_at  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   DEFAULT NOW()
);

DROP TRIGGER IF EXISTS branches_updated_at ON branches;
CREATE TRIGGER branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'branches'
      AND policyname = 'Authenticated users can manage branches'
  ) THEN
    CREATE POLICY "Authenticated users can manage branches"
      ON branches FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END;
$$;

-- Seed the two branches (skipped if already exist)
INSERT INTO branches (name, location, address) VALUES
  ('OnlyOne Homestay', 'Kampot',     'Kampot Province, Cambodia'),
  ('OnlyOne Homestay', 'Srae Ambel', 'Srae Ambel, Koh Kong Province, Cambodia')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────
-- ADD branch_id TO ALL CORE TABLES
-- Uses IF NOT EXISTS so re-running is safe
-- ─────────────────────────────────────────

-- rooms
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='rooms' AND column_name='branch_id') THEN
    ALTER TABLE rooms ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_rooms_branch_id ON rooms(branch_id);
  END IF;
END;
$$;

-- staff
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='staff' AND column_name='branch_id') THEN
    ALTER TABLE staff ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_staff_branch_id ON staff(branch_id);
  END IF;
END;
$$;

-- reservations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='reservations' AND column_name='branch_id') THEN
    ALTER TABLE reservations ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_res_branch_id ON reservations(branch_id);
  END IF;
END;
$$;

-- invoices
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='invoices' AND column_name='branch_id') THEN
    ALTER TABLE invoices ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_invoices_branch_id ON invoices(branch_id);
  END IF;
END;
$$;

-- housekeeping_tasks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='housekeeping_tasks' AND column_name='branch_id') THEN
    ALTER TABLE housekeeping_tasks ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_hk_branch_id ON housekeeping_tasks(branch_id);
  END IF;
END;
$$;

-- hotel_settings — one row per branch (unique index)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='hotel_settings' AND column_name='branch_id') THEN
    ALTER TABLE hotel_settings ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_branch_id ON hotel_settings(branch_id);
  END IF;
END;
$$;

-- ─────────────────────────────────────────
-- BACK-FILL EXISTING DATA → Kampot branch
-- All seed data from migration 001 belongs to Kampot
-- ─────────────────────────────────────────
DO $$
DECLARE
  kampot_id   UUID;
  srae_id     UUID;
BEGIN
  SELECT id INTO kampot_id FROM branches WHERE location = 'Kampot' LIMIT 1;
  SELECT id INTO srae_id   FROM branches WHERE location = 'Srae Ambel' LIMIT 1;

  -- Assign all unassigned rooms to Kampot
  UPDATE rooms SET branch_id = kampot_id WHERE branch_id IS NULL;

  -- Assign all unassigned staff to Kampot
  UPDATE staff SET branch_id = kampot_id WHERE branch_id IS NULL;

  -- Assign the existing hotel_settings row to Kampot and update the name
  UPDATE hotel_settings
    SET branch_id  = kampot_id,
        hotel_name = 'OnlyOne Homestay (Kampot)'
    WHERE branch_id IS NULL;

  -- Insert settings row for Srae Ambel (only if it doesn't exist yet)
  INSERT INTO hotel_settings (hotel_name, tax_rate, currency, check_in_time, check_out_time, branch_id)
  SELECT 'OnlyOne Homestay (Srae Ambel)', 10, 'USD', '14:00', '12:00', srae_id
  WHERE NOT EXISTS (SELECT 1 FROM hotel_settings WHERE branch_id = srae_id);
END;
$$;
