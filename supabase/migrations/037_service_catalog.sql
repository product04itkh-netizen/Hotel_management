-- Migration 037: Service catalog (Activities & Services, F&B)
-- Per-branch, editable catalog backing the Reservation add-on picker.
-- Replaces the hardcoded PRESET_ADDONS list with the approved
-- "List of Activities & Service Types" / "List of F&B Type" master data.

CREATE TABLE IF NOT EXISTS service_catalog_items (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id            UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category             VARCHAR(10) NOT NULL CHECK (category IN ('activity', 'fnb')),
  code                 VARCHAR(20) NOT NULL,
  name_en              VARCHAR(200) NOT NULL,
  name_kh              VARCHAR(200),
  details              VARCHAR(200),
  unit_price           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  revenue_account_code VARCHAR(10) NOT NULL DEFAULT '4300',
  cost_account_code    VARCHAR(10) NOT NULL DEFAULT '6000',
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  sort_order           INTEGER     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, code)
);

CREATE INDEX IF NOT EXISTS idx_sci_branch_category ON service_catalog_items(branch_id, category, is_active);

ALTER TABLE service_catalog_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'service_catalog_items'
      AND policyname = 'Authenticated users can manage service_catalog_items'
  ) THEN
    CREATE POLICY "Authenticated users can manage service_catalog_items"
      ON service_catalog_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed the approved catalog for every branch (Kampot + Srae Ambel both get the same list)
INSERT INTO service_catalog_items
  (branch_id, category, code, name_en, name_kh, details, unit_price, revenue_account_code, cost_account_code, sort_order)
SELECT b.id, m.category, m.code, m.name_en, m.name_kh, m.details, m.unit_price, m.revenue_account_code, m.cost_account_code, m.sort_order
FROM branches b
CROSS JOIN (
  VALUES
    ('activity', 'ACT-01', 'Camping Tent',                 'ជួលតង់',                        'Size for 2pax',                              20.00,  '4200', '5400', 1),
    ('activity', 'ACT-02', 'Bring your own Camping Tent',  'យកតង់ចូលដោយខ្លួនឯង',              'Customer brings own tent',                    5.00,  '4300', '6000', 2),
    ('activity', 'ACT-03', 'Four Seater Buggy',            'ឡាន Buggy',                     '2hr',                                         45.00,  '4200', '5500', 3),
    ('activity', 'ACT-04', 'Quicbike',                     'ជួលកង់',                        '2hr',                                         30.00,  '4200', '5500', 4),
    ('activity', 'ACT-05', 'Jet Ski',                      'ម៉ូតូទឹក',                       '1hr',                                        120.00,  '4200', '5500', 5),
    ('activity', 'ACT-06', 'Off Road Car',                 'ឡាន Off Road',                  '1hr',                                         60.00,  '4200', '5500', 6),
    ('activity', 'ACT-07', 'Extra Sleeping Mattress',      'ថែមពូក + ភួយ + ក្នើយ',            '1pax/room, incl. blanket + pillow',           10.00,  '4300', '6000', 7),
    ('fnb',      'FNB-01', 'Cooking Breakfast (Rice + Pork + Fried Eggs)',                          'អាហារពេលព្រឹក បាយស្រូប សាច់ជ្រូក និងពងទាចៀន',   'For 10-15 people', 30.00, '4100', '5300', 1),
    ('fnb',      'FNB-02', 'Cooking Breakfast (Porridge + 5 Salted Egg + 2 Dried Fish)',             'អាហារពេលព្រឹក បបរស ពងទាប្រៃ ត្រីងៀត',           'For 10-15 people', 15.00, '4100', '5300', 2),
    ('fnb',      'FNB-03', 'White Cooked Rice',            'បាយស ១ឆ្នាំង',                   '1 big pot',                                    5.00,  '4100', '5300', 3),
    ('fnb',      'FNB-04', 'Cooking Meals (3-dish menu)',  'សេវាចំអិនម្ហូប 3មុខ',              'Optional 3-meal menu',                        20.00,  '4100', '5300', 4),
    ('fnb',      'FNB-05', 'Ice',                          'ទឹកកកអនាម័យ',                    '1 pack (5kg)',                                  3.75,  '4100', '5300', 5),
    ('fnb',      'FNB-06', 'Cooking Breakfast, Porridge (OHS)', 'សេវាធ្វើអាហារពេលព្រឹក (បបរសរ)', 'For 1 person',                                 10.00,  '4100', '5300', 6),
    ('fnb',      'FNB-07', 'Cooking Breakfast (Rice + Pork + Fried Eggs)', 'សេវាធ្វើអាហារពេលព្រឹក (បាយសាច់ជ្រូក + ពងទាចៀន)', 'For 1 person', 10.00, '4100', '5300', 7)
) AS m(category, code, name_en, name_kh, details, unit_price, revenue_account_code, cost_account_code, sort_order)
ON CONFLICT (branch_id, code) DO NOTHING;
