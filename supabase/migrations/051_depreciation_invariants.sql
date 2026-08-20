-- ============================================================
-- Migration 051: Depreciation invariants
--
-- Every depreciation bug found while reconciling against the workbooks was
-- a silent one -- nothing errored, the numbers were just wrong:
--
--   * assets had no depreciation start date, so the schedule quietly fell
--     back to the purchase date and began charging seven months early;
--   * the monthly amount was derived from depreciation_rate, stored to four
--     decimals, so an 84-month life drifted a fraction of a cent a month;
--   * the posting run and the schedule preview disagreed about when an
--     asset starts, and only the preview was visibly wrong.
--
-- These constraints turn the assumptions the calculation relies on into
-- things the database enforces, so the next one fails loudly instead.
-- Verified clean against current data before being added.
-- Safe to re-run.
-- ============================================================

-- A depreciable asset must say when it starts. Without this the app falls
-- back to purchased_date, which is not the same thing -- the workbooks
-- capitalise assets bought in 2025 but only start depreciating them in
-- August 2026.
ALTER TABLE fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_dep_start_required;
ALTER TABLE fixed_assets ADD CONSTRAINT fixed_assets_dep_start_required
  CHECK (NOT is_depreciable OR depreciation_start_date IS NOT NULL);

-- ...and over how long. useful_life_months is the divisor in the monthly
-- calculation, so a null or zero would silently produce no charge at all.
ALTER TABLE fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_dep_life_required;
ALTER TABLE fixed_assets ADD CONSTRAINT fixed_assets_dep_life_required
  CHECK (NOT is_depreciable OR (useful_life_months IS NOT NULL AND useful_life_months > 0));

-- An asset can never depreciate past what it cost. The app caps each charge
-- at remaining book value; this makes it structural.
ALTER TABLE fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_accum_not_over_cost;
ALTER TABLE fixed_assets ADD CONSTRAINT fixed_assets_accum_not_over_cost
  CHECK (accumulated_depreciation <= total_cost + 0.005);

-- Ledger rows: a posting is always a positive charge leaving a non-negative
-- book value behind it.
ALTER TABLE depreciation_entries DROP CONSTRAINT IF EXISTS depreciation_entries_amount_positive;
ALTER TABLE depreciation_entries ADD CONSTRAINT depreciation_entries_amount_positive
  CHECK (amount > 0);

ALTER TABLE depreciation_entries DROP CONSTRAINT IF EXISTS depreciation_entries_nbv_non_negative;
ALTER TABLE depreciation_entries ADD CONSTRAINT depreciation_entries_nbv_non_negative
  CHECK (nbv_after >= -0.005);
