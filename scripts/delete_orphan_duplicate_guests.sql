-- Delete: orphan duplicate guest records.
--
-- Confirmed via diagnose_orphan_duplicate_guests.sql — every id below has
-- has_reservation = false AND has_invoice = false, so none are referenced
-- anywhere in the system. Each is a duplicate stub left over from the same
-- bug that corrupted full_name/email on the real, linked guest record.

DELETE FROM guests
WHERE id IN (
  '92bae43b-a342-41c5-8568-e762e9248833', -- Alec (dup)
  '59ba7dc2-4633-44e5-b8b0-3651badd06e8', -- Change master tech (dup)
  'c1460962-037c-4e08-b8f5-bce2abcee08b', -- Mr. Vantage (dup)
  '0d3802c3-8642-44d8-917d-99575f26ca57', -- Panha (dup)
  '762ddeac-bf0f-4912-a3d1-80b52ae8d64e', -- Reachie (dup)
  '97c90ebe-e8c0-4878-9fe9-0562d6ce77be', -- Siek Mey (dup)
  '3363aa22-479a-46c1-b53c-4d372f6a8e22', -- Sovathara (dup)
  '9a8de1ad-68e5-4401-809a-ac2407bf6cc9', -- Tola (dup)
  '7974c502-6314-41e8-999a-8be1c0a4c5ac'  -- Twenty Two (dup)
)
RETURNING id, full_name;
