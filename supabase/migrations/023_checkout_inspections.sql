-- Phase 3: Check-out inspection & extra charges
-- Records property condition at check-out and any damage/extra charges.

CREATE TABLE IF NOT EXISTS checkout_inspections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id   UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  branch_id        UUID,
  condition        VARCHAR(20) NOT NULL DEFAULT 'good'
                     CHECK (condition IN ('good', 'minor_damage', 'major_damage')),
  inspection_notes TEXT,
  -- JSONB array of {description: string, amount: number, revenue_code: string}
  extra_charges    JSONB NOT NULL DEFAULT '[]',
  total_extra      NUMERIC(10,2) NOT NULL DEFAULT 0,
  inspected_by     UUID REFERENCES staff(id) ON DELETE SET NULL,
  inspected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_inspections_reservation ON checkout_inspections(reservation_id);
CREATE INDEX IF NOT EXISTS idx_checkout_inspections_branch      ON checkout_inspections(branch_id);
