-- ============================================================
-- Migration 007: Fixed Assets module
-- Source: Fixed Asset List.xlsx — sheet "FAS List"
-- Creates fixed_assets table + seeds all 115 historical assets
-- Safe to re-run: table uses IF NOT EXISTS; seed skips if data exists
-- ============================================================

CREATE TABLE IF NOT EXISTS fixed_assets (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  description       TEXT    NOT NULL,
  category          VARCHAR(30) NOT NULL
                      CHECK (category IN ('land','building','computer_office','furniture','machinery','vehicle')),
  type_brand        VARCHAR(150),
  asset_code        VARCHAR(50),
  series_code       VARCHAR(150),
  purchased_date    DATE,
  date_acquired     DATE,
  date_disposed     DATE,
  location          VARCHAR(150),
  incharge          VARCHAR(100),
  quantity          INTEGER NOT NULL DEFAULT 1,
  unit_cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
  depreciation_rate NUMERIC(5,4)  NOT NULL DEFAULT 0,
  is_depreciable    BOOLEAN NOT NULL DEFAULT true,
  invoice_doc_ref   VARCHAR(200),
  notes             TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','disposed','maintenance')),
  branch_id         UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fixed_assets' AND policyname = 'fixed_assets_open'
  ) THEN
    CREATE POLICY fixed_assets_open ON fixed_assets FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Seed historical data ──────────────────────────────────────────────────
DO $$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT id INTO v_branch_id FROM branches WHERE location ILIKE '%Srae Ambel%' LIMIT 1;
  IF v_branch_id IS NULL THEN SELECT id INTO v_branch_id FROM branches LIMIT 1; END IF;

  IF EXISTS (SELECT 1 FROM fixed_assets LIMIT 1) THEN
    RAISE NOTICE 'fixed_assets already seeded — skipping';
    RETURN;
  END IF;

  -- ── LAND ─────────────────────────────────────────────────────────────────
  INSERT INTO fixed_assets
    (description, category, type_brand, quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, branch_id)
  VALUES
    ('Land', 'land', 'Land', 1, 0, 0, 0, false, v_branch_id);

  -- ── BUILDINGS & CONSTRUCTION ──────────────────────────────────────────────
  INSERT INTO fixed_assets
    (description, category, quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, branch_id)
  VALUES
    ('Construction',                                                  'building', 1, 0, 0,    0.05, true, v_branch_id),
    ('កញ្ចក់ (Glass)',                                                 'building', 1, 0, 0,    0.05, true, v_branch_id),
    ('ផ្ទះកុងទីន័រ (Container Houses)',                                 'building', 2, 0, 0,    0.05, true, v_branch_id),
    ('កញ្ចក់បន្ទប់ហាត់ប្រាណ (Gym Glass)',                               'building', 1, 0, 0,    0.05, true, v_branch_id),
    ('កញ្ចក់បន្ទប់ទឹក (Bathroom Glass)',                                 'building', 1, 0, 0,    0.05, true, v_branch_id),
    ('ឈើ (Wood Works)',                                                'building', 1, 0, 0,    0.05, true, v_branch_id),
    ('ជាងដែក (Steel Works)',                                           'building', 1, 0, 0,    0.05, true, v_branch_id),
    ('សម្ភារៈផ្ទះបាយ និងបន្ទប់ទឹក (Kitchen & Bathroom Fittings)',       'building', 1, 0, 0,    0.05, true, v_branch_id);

  -- ── COMPUTER & OFFICE EQUIPMENT (Bedding & Linen) ────────────────────────
  INSERT INTO fixed_assets
    (description, category, purchased_date, quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, branch_id)
  VALUES
    ('ពូកសេអូល 1.80m',                            'computer_office', '2026-04-06',  1, 169.00,  169.00, 0.20, true, v_branch_id),
    ('ឈុតកំរាលពូក Bella 1.80m×2.00m',             'computer_office', '2026-04-11',  1,  35.00,   35.00, 0.20, true, v_branch_id),
    ('ឈុតកំរាលពូក Bella 2.00m×2.00m (Set 1)',     'computer_office', '2026-04-11',  4,  46.00,  184.00, 0.20, true, v_branch_id),
    ('ស្រោមខ្នើយកើយ 51×91',                        'computer_office', '2026-04-11', 10,   4.00,   40.00, 0.20, true, v_branch_id),
    ('ឈុតកំរាលពូក Bella 2.00m×2.00m (Set 2)',     'computer_office', '2026-04-11',  5,  46.00,  230.00, 0.20, true, v_branch_id),
    ('ពូក (Mattress)',                             'computer_office', '2026-05-05',  4, 320.00, 1280.00, 0.20, true, v_branch_id),
    ('Bath Towel — White',                        'computer_office', '2026-05-12', 20,   7.50,  150.00, 0.20, true, v_branch_id),
    ('Hand Towel — White',                        'computer_office', '2026-05-12', 20,   3.50,   70.00, 0.20, true, v_branch_id),
    ('ប្រអប់ឫស្សី (Rattan Box)',                    'computer_office', '2026-05-12', 10,   7.00,   70.00, 0.20, true, v_branch_id),
    ('ប្រអប់ក្រដាសឈើ Ashwood',                     'computer_office', '2026-05-12', 10,  10.00,  100.00, 0.20, true, v_branch_id),
    ('តុក្បាលគ្រែ (Bedside Table) — Single',       'computer_office', '2026-05-12',  1,  88.00,   88.00, 0.20, true, v_branch_id),
    ('MPT Hotel 200',                             'computer_office', '2026-06-09',  4,  19.00,   76.00, 0.20, true, v_branch_id),
    ('MPT Hotel 180',                             'computer_office', '2026-06-09',  1,  17.00,   17.00, 0.20, true, v_branch_id),
    ('Bed Sheet 180',                             'computer_office', '2026-06-09', 10,  23.50,  235.00, 0.20, true, v_branch_id),
    ('Duvet Cover 180',                           'computer_office', '2026-06-09',  5,  40.50,  202.50, 0.20, true, v_branch_id),
    ('Duvet Insert 180',                          'computer_office', '2026-06-09',  5,  34.25,  171.25, 0.20, true, v_branch_id),
    ('Pillow Case L',                             'computer_office', '2026-06-09', 20,   6.50,  130.00, 0.20, true, v_branch_id),
    ('Pillow Case S',                             'computer_office', '2026-06-09', 20,   3.75,   75.00, 0.20, true, v_branch_id);

  -- ── FURNITURE & EQUIPMENT ─────────────────────────────────────────────────
  INSERT INTO fixed_assets
    (description, category, purchased_date, quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, branch_id)
  VALUES
    ('គ្រែអត់ក្បាល 220×220×32 (Platform Bed)',      'furniture', '2025-12-25',  1,  350.00,   350.00, 0.20, true, v_branch_id),
    ('ទូ 50×150×450 (Wardrobe)',                   'furniture', '2025-12-25',  1,  450.00,   450.00, 0.20, true, v_branch_id),
    ('ទូពន្យួរសម្លៀកបំពាក់ (Clothes Hanger Stand)', 'furniture', '2026-02-09',  2,   26.00,    52.00, 0.20, true, v_branch_id),
    ('ឈើទូរខោអាវ (Wardrobe Set)',                  'furniture', '2026-03-25',  1,    0.00,   755.00, 0.20, true, v_branch_id),
    ('ទូ (Cabinet)',                               'furniture', '2026-04-11',  1,  230.00,   230.00, 0.20, true, v_branch_id),
    ('តុ (Table)',                                 'furniture', '2026-04-11',  1,  440.00,   440.00, 0.20, true, v_branch_id),
    ('តុក្បាលគ្រែ (Bedside Table) ×8',             'furniture', '2026-05-13',  8,   88.00,   704.00, 0.20, true, v_branch_id),
    ('គ្រែ 180×200 ពណ៍ធម្មជាតិ (Natural King Bed)', 'furniture', '2026-05-13',  1,  260.00,   260.00, 0.20, true, v_branch_id),
    ('ធ្នើរ 30×50 កំពស់ 75 (Shelf)',                'furniture', '2026-05-13',  2,   33.00,    66.00, 0.20, true, v_branch_id),
    ('កៅអី 01 (Chair)',                            'furniture', '2026-05-13', 20,   16.50,   330.00, 0.20, true, v_branch_id),
    ('កៅអីហែលទឹក (Pool Chair)',                    'furniture', '2026-05-14',  2,  175.00,   350.00, 0.20, true, v_branch_id),
    ('តុឃ្លុប (Club Table)',                       'furniture', '2026-05-15',  2,   75.00,   150.00, 0.20, true, v_branch_id),
    ('Mini Bar Table + Chairs 4pcs',              'furniture', '2026-05-19',  1,  130.00,   130.00, 0.20, true, v_branch_id),
    ('ធ្នើរ ខ្នាត 60ស (60cm Shelf)',                'furniture', '2026-05-19',  2,   14.00,    28.00, 0.20, true, v_branch_id),
    ('តាប៊ីយែ (Buffet/Cabinet)',                   'furniture', '2026-06-06',  1, 1800.00,  1800.00, 0.20, true, v_branch_id),
    ('គ្រែឈើស្រឡៅ (Teakwood Bed)',                 'furniture', '2026-06-08',  2,  580.00,  1160.00, 0.20, true, v_branch_id),
    ('NEO Dining Set MED0007',                    'furniture', '2026-06-08',  1, 1783.00,  1783.00, 0.20, true, v_branch_id),
    ('Bed NH103',                                 'furniture', '2026-06-08',  1,  330.00,   330.00, 0.20, true, v_branch_id),
    ('Fabric Bar Chair NCL-LGM 2952',             'furniture', '2026-06-08', 10,  159.33,  1593.30, 0.20, true, v_branch_id),
    ('Fabric Dining Chair NCL-LGM 362',           'furniture', '2026-06-08', 10,  167.33,  1673.30, 0.20, true, v_branch_id),
    ('Fabric Dining Chair NCL-LGM 373',           'furniture', '2026-06-08', 10,  167.33,  1673.30, 0.20, true, v_branch_id),
    ('ACS0380-1',                                 'furniture', '2026-06-08',  2,   12.24,    24.48, 0.20, true, v_branch_id),
    ('ACS0380',                                   'furniture', '2026-06-08',  2,   12.23,    24.46, 0.20, true, v_branch_id),
    ('ACS0384-1',                                 'furniture', '2026-06-08',  1,   19.90,    19.90, 0.20, true, v_branch_id),
    ('ACS0384',                                   'furniture', '2026-06-08',  1,   36.57,    36.57, 0.20, true, v_branch_id),
    ('ACS0388-1',                                 'furniture', '2026-06-08',  1,   18.43,    18.43, 0.20, true, v_branch_id),
    ('ACS0388',                                   'furniture', '2026-06-08',  1,   21.70,    21.70, 0.20, true, v_branch_id),
    ('ACS0389-1',                                 'furniture', '2026-06-08',  1,   18.43,    18.43, 0.20, true, v_branch_id),
    ('ACS0389',                                   'furniture', '2026-06-08',  1,   24.15,    24.15, 0.20, true, v_branch_id);

  -- ── MACHINERY & ELECTRICAL EQUIPMENT ──────────────────────────────────────
  INSERT INTO fixed_assets
    (description, category, purchased_date, quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, branch_id)
  VALUES
    ('ម៉ូទ័របូមប្រេងម៉ូតូទឹក (Water Pump Motor)',          'machinery', '2024-10-09',  1,   75.00,    75.00, 0.10, true, v_branch_id),
    ('Hand Winch Cable 1200LB Silver',                   'machinery', '2024-12-18',  1,   22.00,    22.00, 0.10, true, v_branch_id),
    ('ម៉ូទ័រយោង 220V 1000/2000Kg, Cable 80m (Hoist)',    'machinery', '2024-12-30',  1,  775.00,   775.00, 0.10, true, v_branch_id),
    ('ម៉ូទ័របាញ់លាងអូតូ DLK (Auto Pressure Washer)',     'machinery', '2024-12-30',  1,  100.00,   100.00, 0.10, true, v_branch_id),
    ('ម៉ាស៊ីនត្រជាក់ Panasonic 2HP — Indoor ×4',          'machinery', '2026-01-05',  4,  645.00,  2580.00, 0.10, true, v_branch_id),
    ('ម៉ាស៊ីនត្រជាក់ Panasonic 2HP — Outdoor',            'machinery', '2026-01-05',  1,  910.00,   910.00, 0.10, true, v_branch_id),
    ('ម៉ាស៊ីនត្រជាក់ Panasonic 5HP',                      'machinery', '2026-01-05',  2, 1420.00,  2840.00, 0.10, true, v_branch_id),
    ('Fan Diameter 2m',                                  'machinery', '2026-01-08',  1,  342.65,   342.65, 0.10, true, v_branch_id),
    ('Fan Diameter 2.5m',                                'machinery', '2026-01-08',  1,  347.24,   347.24, 0.10, true, v_branch_id),
    ('Fan Diameter 3m',                                  'machinery', '2026-01-08',  1,  351.83,   351.83, 0.10, true, v_branch_id),
    ('Fan Diameter 3.6m',                                'machinery', '2026-01-08',  1,  451.26,   451.26, 0.10, true, v_branch_id),
    ('Fan Diameter 2.5m — Height of Pillar',             'machinery', '2026-01-08',  1,  385.00,   385.00, 0.10, true, v_branch_id),
    ('Fan Diameter 3m — Height of Pillar',               'machinery', '2026-01-08',  1,  390.02,   390.02, 0.10, true, v_branch_id),
    ('Wall Outdoor Light B026-90B Gray',                 'machinery', '2026-01-08', 18,    7.46,   134.28, 0.10, true, v_branch_id),
    ('HK-376/1 Wall Lamp',                               'machinery', '2026-01-08',  1,    7.60,     7.60, 0.10, true, v_branch_id),
    ('Spot 10W 4000K Queen Round',                       'machinery', '2026-01-08', 49,    6.64,   325.36, 0.10, true, v_branch_id),
    ('Spot 7W 4000K Queen Round',                        'machinery', '2026-01-08',  6,    4.95,    29.70, 0.10, true, v_branch_id),
    ('Downlight 12W 4000K Queen Round',                  'machinery', '2026-01-08', 19,    5.86,   111.34, 0.10, true, v_branch_id),
    ('Spot Light 4W 6500K',                              'machinery', '2026-01-08', 90,    6.20,   558.00, 0.10, true, v_branch_id),
    ('LED Chilli Tube 7W E27 3Tong (Set 1)',             'machinery', '2026-01-08', 40,    2.28,    91.20, 0.10, true, v_branch_id),
    ('Spot LED 18W 4000K Square Thla Queen',             'machinery', '2026-01-08', 52,   12.64,   657.28, 0.10, true, v_branch_id),
    ('LED Square 4W Thla 6000K Crystal',                 'machinery', '2026-01-08', 50,    4.62,   231.00, 0.10, true, v_branch_id),
    ('Fa Chang LED Black 6500K',                         'machinery', '2026-01-08', 10,   14.02,   140.20, 0.10, true, v_branch_id),
    ('Fa Chang LED Silver 6500K',                        'machinery', '2026-01-08', 10,   21.65,   216.50, 0.10, true, v_branch_id),
    ('3M Long Line Glass 20cm×32cm',                     'machinery', '2026-01-08', 20,   15.33,   306.60, 0.10, true, v_branch_id),
    ('3M Long Line Glass Diameter 20cm',                 'machinery', '2026-01-08', 10,   10.73,   107.30, 0.10, true, v_branch_id),
    ('3M Long Line Glass Diameter 15cm',                 'machinery', '2026-01-08', 10,    9.20,    92.00, 0.10, true, v_branch_id),
    ('Fan Wood Leaf 48 Inches',                          'machinery', '2026-01-08',  4,   65.87,   263.48, 0.10, true, v_branch_id),
    ('Star Ceiling 2.8m×4.65m',                         'machinery', '2026-01-08',  1,  525.28,   525.28, 0.10, true, v_branch_id),
    ('LED Chilli Tube 7W E27 3Tong (Set 2)',             'machinery', '2026-01-08', 45,    2.28,   102.60, 0.10, true, v_branch_id),
    ('Kbal Sosor Mol Solar 4W 270×H300',                 'machinery', '2026-01-08',  5,   15.46,    77.30, 0.10, true, v_branch_id),
    ('Kbal Sosor Chroung Solar 4W 270×H300',             'machinery', '2026-01-08', 25,   12.78,   319.50, 0.10, true, v_branch_id),
    ('Alba TV and Cabinets 1 Set',                       'machinery', '2026-02-03',  1, 2088.00,  2088.00, 0.10, true, v_branch_id),
    ('SPL0181 អំពូល (Light Bulb)',                        'machinery', '2026-02-03', 49,    6.64,   325.36, 0.10, true, v_branch_id),
    ('LTR0007 300m អំពូល (Strip Light)',                  'machinery', '2026-02-03',  3,  119.00,   357.00, 0.10, true, v_branch_id),
    ('LTR0018 អំពូល (Light Fitting)',                     'machinery', '2026-02-03', 50,    0.75,    37.50, 0.10, true, v_branch_id),
    ('SPL0132 Wall LED Outdoor 3W 3500K Warm White',     'machinery', '2026-03-09',  9,    5.62,    50.58, 0.10, true, v_branch_id),
    ('SPL0133 Spot Light Wall LED Outdoor 3W 6000K',     'machinery', '2026-03-09', 51,    5.60,   285.60, 0.10, true, v_branch_id),
    ('FAL0075 LED Solar Street 500W',                    'machinery', '2026-03-09',  6,   27.20,   163.20, 0.10, true, v_branch_id),
    ('Motor លាងឡាន (Car Wash Motor)',                     'machinery', '2026-04-09',  1,  111.50,   111.50, 0.10, true, v_branch_id),
    ('ទុយោបាញ់ទឹក 30ម (Water Hose 30m)',                  'machinery', '2026-04-11',  2,   38.00,    76.00, 0.10, true, v_branch_id),
    ('Stain Steel Horizontal Multistage Pump',           'machinery', '2026-04-22',  1,  190.00,   190.00, 0.10, true, v_branch_id),
    ('ប៉ុស្តផ្សា (Welding Post)',                          'machinery', '2026-04-30',  1,   95.03,    95.03, 0.10, true, v_branch_id),
    ('ទូរទឹកកក Hitachi (Hitachi Refrigerator)',            'machinery', '2026-04-30',  1, 1035.00,  1035.00, 0.10, true, v_branch_id),
    ('ធុងចម្រោះទឹកក្តៅ - ត្រជាក់ (Hot/Cold Water Tank)',  'machinery', '2026-05-12',  1,  170.00,   170.00, 0.10, true, v_branch_id),
    ('ឆ្នាំងដាំបាយ (Rice Cooker)',                         'machinery', '2026-05-12',  1,   60.00,    60.00, 0.10, true, v_branch_id),
    ('Smart TV Samsung',                                 'machinery', '2026-05-15',  1, 1050.00,  1050.00, 0.10, true, v_branch_id),
    ('ឈុតរឡូលាងឡាន (Car Wash Equipment Set)',             'machinery', '2026-05-28',  2,   53.00,   106.00, 0.10, true, v_branch_id),
    ('ម៉ាស៊ីនបោកខោអាវ (Washing Machine)',                  'machinery', '2026-06-02',  1,  650.00,   650.00, 0.10, true, v_branch_id),
    ('Microwave Sharp',                                  'machinery', '2026-06-08',  1,  110.00,   110.00, 0.10, true, v_branch_id);

  -- ── VEHICLE & WATERCRAFT ──────────────────────────────────────────────────
  INSERT INTO fixed_assets
    (description, category, purchased_date, quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, branch_id)
  VALUES
    ('Jet Ski',                                           'vehicle', '2024-07-03', 2, 7000.00, 14000.00, 0.10, true, v_branch_id),
    ('Kayak — Yellow',                                    'vehicle', '2024-08-20', 1,  340.00,   340.00, 0.10, true, v_branch_id),
    ('Kayak — Red',                                       'vehicle', '2024-08-20', 1,  330.00,   330.00, 0.10, true, v_branch_id),
    ('Kayak — Blue',                                      'vehicle', '2024-08-20', 1,  330.00,   330.00, 0.10, true, v_branch_id),
    ('Kayak Chain',                                       'vehicle', '2024-08-20', 6,    0.00,     0.00, 0.10, true, v_branch_id),
    ('ពោងបណ្តែតទឹក — ខាងលើឈើ (Floating Platform)',        'vehicle', '2026-05-22', 1, 2300.00,  2300.00, 0.10, true, v_branch_id),
    ('ពោងបណ្តែតទឹក (Water Float)',                         'vehicle', '2026-06-01', 8,   20.00,   160.00, 0.10, true, v_branch_id),
    ('ក្បូនឈើគគីរសុទ្ធ (Pure Teak Wooden Boat)',           'vehicle', '2026-06-04', 1, 2800.00,  2800.00, 0.10, true, v_branch_id),
    ('កក់ម៉ាស៊ីនអូប័រ 30% (Speed Boat Deposit)',           'vehicle', '2026-06-09', 1, 2682.00,  2682.00, 0.10, true, v_branch_id);

  RAISE NOTICE 'Fixed assets seeded — 115 records inserted';
END $$;
