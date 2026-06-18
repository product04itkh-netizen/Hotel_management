-- Ensure telegram + notification columns exist on hotel_settings.
-- Safe to re-run: IF NOT EXISTS guards prevent errors on already-migrated DBs.

ALTER TABLE hotel_settings ADD COLUMN IF NOT EXISTS telegram_bot_token   TEXT;
ALTER TABLE hotel_settings ADD COLUMN IF NOT EXISTS telegram_chat_id     TEXT;
ALTER TABLE hotel_settings ADD COLUMN IF NOT EXISTS telegram_enabled     BOOLEAN DEFAULT false;
ALTER TABLE hotel_settings ADD COLUMN IF NOT EXISTS notification_events  TEXT[]  DEFAULT ARRAY['new_reservation','checkin','checkout','payment'];
