-- Phase 1: True check-in records
-- Stores ID verification data, staff who processed check-in, and links to the revenue JE

-- Add id_expiry to guests (id_type + id_number already exist from 001_initial.sql)
ALTER TABLE guests ADD COLUMN IF NOT EXISTS id_expiry DATE;

-- Central check-in record per reservation
CREATE TABLE IF NOT EXISTS check_in_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id   UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  branch_id        UUID,
  id_type          VARCHAR(50),
  id_number        VARCHAR(100),
  id_expiry        DATE,
  nationality      VARCHAR(100),
  vehicle_plate    VARCHAR(50),
  notes            TEXT,
  checked_in_by    UUID REFERENCES staff(id) ON DELETE SET NULL,
  checked_in_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_records_reservation ON check_in_records(reservation_id);
CREATE INDEX IF NOT EXISTS idx_checkin_records_branch      ON check_in_records(branch_id);
