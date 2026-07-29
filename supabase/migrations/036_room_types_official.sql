-- Migration 036: Official room type data
-- Aligns the two real houses with the approved "List of Room Type" doc.
-- Renames existing house rows IN PLACE (same id) so historical reservations/
-- invoices/JEs stay linked. Demo-only houses (Garden Bungalow) are untouched.

ALTER TABLE houses ADD COLUMN IF NOT EXISTS code VARCHAR(20);

-- Kampot: Riverside Villa → OnlyOne Private Villa (OPV-02)
UPDATE houses
SET name = 'OnlyOne Private Villa',
    house_type = 'villa',
    capacity = 10,
    base_rate_per_night = 1000.00,
    code = 'OPV-02',
    description = 'Private villa with direct riverside access & mountain view',
    updated_at = now()
WHERE name = 'Riverside Villa';

-- Srae Ambel: OnlyOne Home Stay → OnlyOne Homestay (OHS-01)
UPDATE houses
SET name = 'OnlyOne Homestay',
    house_type = 'homestay',
    capacity = 8,
    base_rate_per_night = 250.00,
    code = 'OHS-01',
    description = 'Four-bedroom suite, ideal for families',
    updated_at = now()
WHERE name = 'OnlyOne Home Stay';
