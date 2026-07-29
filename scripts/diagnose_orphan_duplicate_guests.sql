-- Diagnostic (read-only): confirm the apparent duplicate guest records are
-- truly unreferenced before considering deletion.
--
-- Only two tables have a foreign key to guests(id): reservations.guest_id
-- and invoices.guest_id (both ON DELETE SET NULL). This checks BOTH —
-- a guest with no reservation link could still be attached directly to an
-- invoice, which the earlier diagnostic didn't check.

SELECT
  g.id,
  g.full_name,
  g.email,
  g.phone,
  g.created_at,
  EXISTS (SELECT 1 FROM reservations r WHERE r.guest_id = g.id) AS has_reservation,
  EXISTS (SELECT 1 FROM invoices i WHERE i.guest_id = g.id) AS has_invoice
FROM guests g
WHERE g.id IN (
  'c1460962-037c-4e08-b8f5-bce2abcee08b', -- Mr. Vantage (orphan)
  '0d3802c3-8642-44d8-917d-99575f26ca57', -- Panha (orphan)
  '762ddeac-bf0f-4912-a3d1-80b52ae8d64e', -- Reachie (orphan)
  '97c90ebe-e8c0-4878-9fe9-0562d6ce77be', -- Siek Mey (orphan)
  '3363aa22-479a-46c1-b53c-4d372f6a8e22', -- Sovathara (orphan)
  '9a8de1ad-68e5-4401-809a-ac2407bf6cc9', -- Tola (orphan)
  '7974c502-6314-41e8-999a-8be1c0a4c5ac', -- Twenty Two (orphan)
  '59ba7dc2-4633-44e5-b8b0-3651badd06e8', -- change master tech (orphan)
  '92bae43b-a342-41c5-8568-e762e9248833'  -- Alec (orphan, found earlier)
)
ORDER BY g.full_name;
