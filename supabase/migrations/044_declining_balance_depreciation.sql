-- ============================================================
-- Migration 044: Fixed assets — per-asset declining-balance depreciation
-- Finance confirmed: depreciation_rate (12/useful_life_months, from
-- migration 043) is the correct ANNUAL rate. This migration makes the
-- actual monthly depreciation calculation apply that rate under the
-- DECLINING BALANCE method for every category except buildings —
-- Cambodian GDT Class 1 (buildings) depreciates straight-line on original
-- cost; Classes 2-4 (computer/office, furniture, machinery, vehicle)
-- depreciate declining-balance on net book value. This matches the
-- per-row Total_NBV formulas already confirmed against the source
-- fixed-asset working papers earlier in this project.
--
-- Adds a running per-asset NBV tracker (accumulated_depreciation) and a
-- per-asset, per-period ledger (depreciation_entries) so declining balance
-- can be computed off each asset's own current NBV, and the depreciation
-- schedule can show what was ACTUALLY posted for past periods instead of
-- re-deriving a guess. No historical postings exist yet (0 rows in
-- depreciation_runs as of this migration), so accumulated_depreciation
-- starts safely at 0 for every asset. Safe to re-run.
-- ============================================================

ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS accumulated_depreciation NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_accum_dep_check;
ALTER TABLE fixed_assets ADD CONSTRAINT fixed_assets_accum_dep_check CHECK (accumulated_depreciation >= 0);

CREATE TABLE IF NOT EXISTS depreciation_entries (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id            UUID          NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  depreciation_run_id UUID          NOT NULL REFERENCES depreciation_runs(id) ON DELETE CASCADE,
  run_year            INTEGER       NOT NULL,
  run_month           INTEGER       NOT NULL CHECK (run_month BETWEEN 1 AND 12),
  amount              NUMERIC(12,2) NOT NULL,
  nbv_after           NUMERIC(12,2) NOT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, run_year, run_month)
);
CREATE INDEX IF NOT EXISTS idx_depreciation_entries_asset ON depreciation_entries(asset_id);
CREATE INDEX IF NOT EXISTS idx_depreciation_entries_run ON depreciation_entries(depreciation_run_id);

ALTER TABLE depreciation_entries ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='depreciation_entries'
      AND policyname='Auth users manage depreciation_entries') THEN
    CREATE POLICY "Auth users manage depreciation_entries"
      ON depreciation_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
