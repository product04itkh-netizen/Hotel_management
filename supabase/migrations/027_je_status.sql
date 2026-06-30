-- Migration 027: Add status (draft/posted) to journal_entries
-- Default is 'posted' so all existing and system-generated entries stay locked.
-- Only manually-created entries via the UI start as 'draft'.

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'posted';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'je_status_chk' AND conrelid = 'journal_entries'::regclass
  ) THEN
    ALTER TABLE journal_entries
      ADD CONSTRAINT je_status_chk CHECK (status IN ('draft', 'posted'));
  END IF;
END $$;

-- All pre-existing entries are considered posted
UPDATE journal_entries SET status = 'posted' WHERE status != 'posted';

CREATE INDEX IF NOT EXISTS idx_je_status ON journal_entries(status);
