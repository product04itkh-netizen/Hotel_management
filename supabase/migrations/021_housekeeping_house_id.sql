-- Allow housekeeping tasks to be assigned at the house (property) level,
-- not just at the individual room level.
ALTER TABLE housekeeping_tasks ADD COLUMN IF NOT EXISTS house_id UUID REFERENCES houses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS housekeeping_tasks_house_id_idx ON housekeeping_tasks(house_id);

-- Backfill house_id for existing tasks that have a room_id
UPDATE housekeeping_tasks ht
SET house_id = r.house_id
FROM rooms r
WHERE ht.room_id = r.id
  AND r.house_id IS NOT NULL
  AND ht.house_id IS NULL;
