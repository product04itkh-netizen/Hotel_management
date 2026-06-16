-- ============================================================
-- Add-ons support for reservations
-- Safe to re-run: uses IF NOT EXISTS guards
-- ============================================================

-- Add deposit, pax_count, arrival_time to reservations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='deposit') THEN
    ALTER TABLE reservations ADD COLUMN deposit NUMERIC(10,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='pax_count') THEN
    ALTER TABLE reservations ADD COLUMN pax_count INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='arrival_time') THEN
    ALTER TABLE reservations ADD COLUMN arrival_time TEXT;
  END IF;
END;
$$;

-- Line items table for per-reservation add-on charges
CREATE TABLE IF NOT EXISTS reservation_line_items (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reservation_id  UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rli_reservation_id ON reservation_line_items(reservation_id);

ALTER TABLE reservation_line_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reservation_line_items'
      AND policyname = 'Authenticated users can manage reservation line items'
  ) THEN
    CREATE POLICY "Authenticated users can manage reservation line items"
      ON reservation_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END;
$$;
