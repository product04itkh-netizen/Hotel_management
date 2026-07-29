-- Fix: clear corrupted guest.email values.
--
-- All 22 flagged emails are garbage (concatenated booking-summary text —
-- date, time, house, pax, price fields), not one contains a recoverable
-- real email address (no '@' in any of them). Unlike the full_name fix,
-- there's nothing to extract — the correct value is simply "no email on
-- file," so this clears the field rather than parsing it.
--
-- Scoped to the exact same detection used by the diagnostic, so it only
-- touches the 22 rows already reviewed. RETURNING shows what was cleared.

UPDATE guests
SET email = NULL,
    updated_at = now()
WHERE email IS NOT NULL
  AND (email !~ '@' OR email ~* '\$|pax' OR length(email) > 60)
RETURNING id, full_name, phone;
