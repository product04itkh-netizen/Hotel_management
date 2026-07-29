-- Fix: strip leading/trailing tab/whitespace characters from guests.phone.
--
-- Same artifact as the full_name trim — e.g. "016 778 196\t" — leftover from
-- whatever import/paste corrupted the email field on these rows.

UPDATE guests
SET phone = trim(both E' \t' from phone),
    updated_at = now()
WHERE phone ~ '(^\s|\s$)'
RETURNING id, full_name, phone AS trimmed_phone;
