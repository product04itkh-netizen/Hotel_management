-- Add period lock password for securing accounting periods
ALTER TABLE hotel_settings ADD COLUMN IF NOT EXISTS period_lock_password TEXT;
