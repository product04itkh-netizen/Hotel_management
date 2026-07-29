-- Fix: corrupted guest full_name values.
--
-- Confirmed pattern from the diagnostic results — every affected row is a
-- TAB-separated string: "{Weekday, Month DD, YYYY}<TAB>{H:MM AM/PM}<TAB>{Actual Name}<TAB>{House}<TAB>{Phone}"
-- (house/phone segments sometimes empty). Field 3 (tab-delimited) is always
-- the real guest name. This UPDATE re-runs the exact same detection used by
-- the diagnostic query, so it only touches the 4 rows already reviewed.
--
-- Nothing else is touched — guests.phone, reservations, invoices, JEs are
-- unaffected. RETURNING shows before/after so you can confirm before trusting it.

UPDATE guests
SET full_name = split_part(full_name, chr(9), 3),
    updated_at = now()
WHERE (
    length(full_name) > 40
    OR full_name ~* '\d{1,2}:\d{2}\s*(am|pm)'
    OR full_name ~ '[0-9]{4}'
    OR EXISTS (
      SELECT 1 FROM houses h
      WHERE guests.full_name ILIKE '%' || h.name || '%'
    )
  )
  AND full_name LIKE '%' || chr(9) || '%'   -- only rows that actually contain the tab-separated pattern
RETURNING id, full_name AS fixed_name, phone;
