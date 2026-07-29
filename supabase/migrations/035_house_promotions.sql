-- Migration 035: House promotional rates
-- Per-night pricing override for specific date windows.
-- If multiple promos overlap a night, the one with the lowest rate wins (handled in app logic).

CREATE TABLE IF NOT EXISTS house_promotions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id     UUID        NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  branch_id    UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  promo_rate   DECIMAL(10,2) NOT NULL CHECK (promo_rate >= 0),
  start_date   DATE        NOT NULL,
  end_date     DATE        NOT NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_promo_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_hp_house_id   ON house_promotions(house_id);
CREATE INDEX IF NOT EXISTS idx_hp_branch_id  ON house_promotions(branch_id);
CREATE INDEX IF NOT EXISTS idx_hp_dates      ON house_promotions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_hp_active     ON house_promotions(house_id, is_active);

ALTER TABLE house_promotions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'house_promotions'
      AND policyname = 'Authenticated users can manage house_promotions'
  ) THEN
    CREATE POLICY "Authenticated users can manage house_promotions"
      ON house_promotions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
