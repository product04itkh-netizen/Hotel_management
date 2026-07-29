-- Diagnostic (read-only): broader sweep for corrupted guest fields, beyond
-- the full_name issue already fixed. Same root cause suspected — stray
-- summary/pricing data landing in the wrong field during data entry/import.
--
-- Checks:
--   1. email: doesn't contain '@', OR contains '$' / the word "Pax" (a dead
--      giveaway it's pricing data, not an address), OR is unusually long
--   2. phone: contains letters other than expected formatting, OR unusually long
--   3. full_name: re-run with a wider net (contains '$', "Pax", or is very long)
--      in case any corrupted rows didn't match the narrower check used before
--
-- Nothing is modified. Review the results before any fix is written.

SELECT
  g.id,
  g.full_name,
  g.email,
  g.phone,
  (
    SELECT string_agg(DISTINCT r.reservation_number, ', ')
    FROM reservations r
    WHERE r.guest_id = g.id
  ) AS linked_reservations,
  CASE
    WHEN g.email IS NOT NULL AND (g.email !~ '@' OR g.email ~* '\$|pax') THEN 'email'
    WHEN g.email IS NOT NULL AND length(g.email) > 60 THEN 'email'
    WHEN g.phone IS NOT NULL AND g.phone ~ '[a-zA-Z]' THEN 'phone'
    WHEN g.phone IS NOT NULL AND length(g.phone) > 20 THEN 'phone'
    WHEN g.full_name ~* '\$|pax' OR length(g.full_name) > 40 THEN 'full_name'
    ELSE 'unknown'
  END AS suspect_field
FROM guests g
WHERE
  (g.email IS NOT NULL AND (g.email !~ '@' OR g.email ~* '\$|pax' OR length(g.email) > 60))
  OR (g.phone IS NOT NULL AND (g.phone ~ '[a-zA-Z]' OR length(g.phone) > 20))
  OR (g.full_name ~* '\$|pax' OR length(g.full_name) > 40)
ORDER BY suspect_field, g.full_name;
