-- ============================================================
-- Migration 043: Fixed assets — useful_life_months as source of truth
-- Problem: depreciation_rate was a free-form column the app wrote directly.
-- It was seeded wrong at initial load (007_fixed_assets.sql used 0.10/0.20
-- for machinery/vehicle/furniture instead of the correct 0.25, and 0.20 flat
-- for every linen item regardless of its actual useful life) and there was
-- nothing stopping it from drifting out of sync again after being corrected.
-- Fix: useful_life_months becomes the only field anyone edits. Rate is
-- recomputed by Postgres itself (GENERATED ALWAYS AS ... STORED), so it is
-- structurally impossible for the two to disagree going forward.
-- Safe to re-run.
-- ============================================================

ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS useful_life_months INTEGER;

ALTER TABLE fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_useful_life_months_check;
ALTER TABLE fixed_assets ADD CONSTRAINT fixed_assets_useful_life_months_check
  CHECK (useful_life_months IS NULL OR useful_life_months > 0);

-- Backfill from the (already-corrected, as of this session) depreciation_rate
-- for every existing depreciable asset that doesn't have it set yet.
UPDATE fixed_assets
SET useful_life_months = ROUND(12.0 / depreciation_rate)
WHERE useful_life_months IS NULL
  AND is_depreciable
  AND depreciation_rate > 0;

-- Swap depreciation_rate for a generated column. Any row whose
-- useful_life_months is NULL (never had a valid basis — e.g. the two
-- flagged Srae Ambel items with no source-file policy) now correctly
-- generates rate = 0 rather than keeping a guessed value.
ALTER TABLE fixed_assets DROP COLUMN IF EXISTS depreciation_rate;
ALTER TABLE fixed_assets ADD COLUMN depreciation_rate NUMERIC(6,4) GENERATED ALWAYS AS (
  CASE WHEN useful_life_months IS NOT NULL AND useful_life_months > 0
       THEN ROUND(12.0 / useful_life_months, 4)
       ELSE 0 END
) STORED;
