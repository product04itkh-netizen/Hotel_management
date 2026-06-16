-- ============================================================
-- Resort structure: Branch → Houses → Rooms
-- Safe to re-run: uses IF NOT EXISTS guards
-- ============================================================

-- ─── Houses table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS houses (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name                VARCHAR(200) NOT NULL,
  house_type          VARCHAR(50)  NOT NULL DEFAULT 'homestay',
  branch_id           UUID REFERENCES branches(id) ON DELETE CASCADE,
  capacity            INTEGER      NOT NULL DEFAULT 4,
  base_rate_per_night NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (base_rate_per_night >= 0),
  status              VARCHAR(20)  NOT NULL DEFAULT 'available'
                        CHECK (status IN ('available','occupied','maintenance','closed')),
  amenities           TEXT[]       DEFAULT '{}',
  description         TEXT,
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

DROP TRIGGER IF EXISTS houses_updated_at ON houses;
CREATE TRIGGER houses_updated_at
  BEFORE UPDATE ON houses FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_houses_branch_id ON houses(branch_id);
CREATE INDEX IF NOT EXISTS idx_houses_status    ON houses(status);

ALTER TABLE houses ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='houses'
                 AND policyname='Authenticated users can manage houses') THEN
    CREATE POLICY "Authenticated users can manage houses"
      ON houses FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END;
$$;

-- ─── Add house_id to rooms ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='rooms' AND column_name='house_id') THEN
    ALTER TABLE rooms ADD COLUMN house_id UUID REFERENCES houses(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_rooms_house_id ON rooms(house_id);
  END IF;
END;
$$;

-- ─── Add house_id to reservations ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='reservations' AND column_name='house_id') THEN
    ALTER TABLE reservations ADD COLUMN house_id UUID REFERENCES houses(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_res_house_id ON reservations(house_id);
  END IF;
END;
$$;

-- ─── Seed sample houses ───────────────────────────────────────
-- Kampot: Riverside Villa
INSERT INTO houses (name, house_type, branch_id, capacity, base_rate_per_night, status, amenities, description)
SELECT 'Riverside Villa', 'villa', b.id, 10, 180.00, 'available',
       ARRAY['WiFi','Pool','BBQ','Kayak','AC'],
       'Spacious villa by the river, perfect for groups up to 10.'
FROM branches b WHERE b.location = 'Kampot'
AND NOT EXISTS (SELECT 1 FROM houses h WHERE h.branch_id = b.id AND h.name = 'Riverside Villa');

-- Kampot: Garden Bungalow
INSERT INTO houses (name, house_type, branch_id, capacity, base_rate_per_night, status, amenities, description)
SELECT 'Garden Bungalow', 'bungalow', b.id, 6, 90.00, 'available',
       ARRAY['WiFi','Garden','AC','Hammock'],
       'Cozy bungalow surrounded by tropical garden, ideal for small groups.'
FROM branches b WHERE b.location = 'Kampot'
AND NOT EXISTS (SELECT 1 FROM houses h WHERE h.branch_id = b.id AND h.name = 'Garden Bungalow');

-- Srae Ambel: OnlyOne Home Stay (matches Excel)
INSERT INTO houses (name, house_type, branch_id, capacity, base_rate_per_night, status, amenities, description)
SELECT 'OnlyOne Home Stay', 'homestay', b.id, 24, 180.00, 'available',
       ARRAY['WiFi','BBQ','River Access','Kayak','Tent Area','Hammock'],
       'Our flagship homestay with direct river access and full outdoor facilities.'
FROM branches b WHERE b.location = 'Srae Ambel'
AND NOT EXISTS (SELECT 1 FROM houses h WHERE h.branch_id = b.id AND h.name = 'OnlyOne Home Stay');

-- ─── Associate existing demo rooms with Kampot's Riverside Villa ──
UPDATE rooms r
SET house_id = h.id
FROM houses h
JOIN branches b ON h.branch_id = b.id
WHERE r.branch_id = b.id
  AND b.location = 'Kampot'
  AND h.name = 'Riverside Villa'
  AND r.house_id IS NULL;
