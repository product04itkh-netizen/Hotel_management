-- Fix: strip trailing tab/whitespace characters from guests.full_name.
--
-- Several records came back from the diagnostic with an invisible trailing
-- tab (e.g. "Mr. Vantage\t", "Panha\t", "Sovathara\t") — a leftover artifact
-- from whatever import/paste corrupted the email field on the same rows.
-- Purely cosmetic but worth cleaning since it can cause guest-search /
-- exact-match lookups to silently miss these records.

UPDATE guests
SET full_name = regexp_replace(full_name, '\s+$', ''),
    updated_at = now()
WHERE full_name ~ '\s$'
RETURNING id, full_name AS trimmed_name;
