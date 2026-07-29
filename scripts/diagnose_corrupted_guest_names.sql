-- Diagnostic (read-only): find guest records whose full_name looks like it
-- contains more than a name — e.g. a concatenated confirmation message
-- (weekday + date + time + name + house + phone) instead of just the guest's name.
--
-- Flags a row if ANY of:
--   1. full_name is unusually long (> 40 chars — real names are rarely this long)
--   2. full_name contains an AM/PM time marker
--   3. full_name contains a 4-digit number (a year, or part of a phone)
--   4. full_name contains the name of one of this branch's houses as a substring
--      (a guest's name should never contain a property name — strong signal)
--
-- This does NOT modify any data. Run it, review the list, and share the
-- results back before any fix is written — the correct actual name for each
-- affected guest needs to be confirmed, not guessed.

SELECT
  g.id,
  g.full_name,
  g.phone,
  length(g.full_name) AS name_length,
  (
    SELECT string_agg(DISTINCT r.reservation_number, ', ')
    FROM reservations r
    WHERE r.guest_id = g.id
  ) AS linked_reservations
FROM guests g
WHERE length(g.full_name) > 40
   OR g.full_name ~* '\d{1,2}:\d{2}\s*(am|pm)'
   OR g.full_name ~ '[0-9]{4}'
   OR EXISTS (
     SELECT 1 FROM houses h
     WHERE g.full_name ILIKE '%' || h.name || '%'
   )
ORDER BY length(g.full_name) DESC;
