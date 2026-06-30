-- Migration 025: FAS Kampot — 149 fixed assets
-- Run in Supabase SQL editor after migrations 022-024.
-- Idempotent: clears and re-inserts Kampot FA on re-run.

DO $$
DECLARE _bid UUID;
BEGIN
  SELECT id INTO _bid FROM branches WHERE LOWER(name) LIKE '%kampot%' LIMIT 1;
  IF _bid IS NULL THEN
    RAISE EXCEPTION 'Kampot branch not found';
  END IF;

  DELETE FROM fixed_assets WHERE branch_id = _bid;

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Non-Depreciation', 'land', 'Land', NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Construction', 'building', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 359204.99, 359204.99, 0.05, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('កញ្ចក់', 'building', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 35426.89, 35426.89, 0.05, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ផ្ទះកុងទីន័រ', 'building', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 2950.0, 5900.0, 0.05, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('កញ្ចក់បន្ទប់ហាត់ប្រាណ', 'building', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 521.0, 521.0, 0.05, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('កញ្ចក់បន្ទប់ទឹក', 'building', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 1695.0, 1695.0, 0.05, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ឈើ', 'building', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 2937.0, 2937.0, 0.05, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ជាងដែក', 'building', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 3390.0, 3390.0, 0.05, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('សម្ភារៈផ្ទះបាយ និងបន្ទប់ទឹក', 'building', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 7845.95, 7845.95, 0.05, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ពូកសេអូល 1.80m', 'computer_office', NULL, NULL, NULL,
     '2026-04-06', NULL, NULL, NULL, NULL,
     1, 169.0, 169.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ឈុតកំរាលពូក Bella 1.80m*2.00m', 'computer_office', NULL, NULL, NULL,
     '2026-04-11', NULL, NULL, NULL, NULL,
     1, 35.0, 35.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ឈុតកំរាលពូក Bella 2.00m*2.00m', 'computer_office', NULL, NULL, NULL,
     '2026-04-11', NULL, NULL, NULL, NULL,
     4, 46.0, 184.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ស្រោមខ្នើយកើយ 51*91', 'computer_office', NULL, NULL, NULL,
     '2026-04-11', NULL, NULL, NULL, NULL,
     10, 4.0, 40.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ឈុតកំរាលពូក Bella 2.00m*2.00m', 'computer_office', NULL, NULL, NULL,
     '2026-04-11', NULL, NULL, NULL, NULL,
     5, 46.0, 230.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ពូក 2.00m*2.00m', 'computer_office', NULL, NULL, NULL,
     '2026-05-05', NULL, NULL, NULL, NULL,
     4, 320.0, 1280.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Bath Towel - White', 'computer_office', NULL, NULL, NULL,
     '2026-05-12', NULL, NULL, NULL, NULL,
     20, 7.5, 150.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Hand Towel - White', 'computer_office', NULL, NULL, NULL,
     '2026-05-12', NULL, NULL, NULL, NULL,
     20, 3.5, 70.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ប្រអប់ឫស្សី', 'computer_office', NULL, NULL, NULL,
     '2026-05-12', NULL, NULL, NULL, NULL,
     10, 7.0, 70.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ប្រអប់ក្រដាសឈើ Ashwood', 'computer_office', NULL, NULL, NULL,
     '2026-05-12', NULL, NULL, NULL, NULL,
     10, 10.0, 100.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('តុក្បាលគ្រែ', 'computer_office', NULL, NULL, NULL,
     '2026-05-12', NULL, NULL, NULL, NULL,
     1, 88.0, 88.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('MPT Hotel 200 ទ្រនាប់ពូក​ 2ម​x​ 2ម', 'computer_office', NULL, NULL, NULL,
     '2026-06-09', NULL, NULL, NULL, NULL,
     4, 19.0, 76.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('MPT Hotel 180 ទ្រនាប់ពូក​ 1.8​x​ 2ម', 'computer_office', NULL, NULL, NULL,
     '2026-06-09', NULL, NULL, NULL, NULL,
     1, 17.0, 17.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Bed Sheet 180 ស្រោមពូក​ 1.8ម​ x​ 2ម', 'computer_office', NULL, NULL, NULL,
     '2026-06-09', NULL, NULL, NULL, NULL,
     10, 23.5, 235.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Duvet Cover 180 ភួយ​ 1.8​ម​ x​ 2ម', 'computer_office', NULL, NULL, NULL,
     '2026-06-09', NULL, NULL, NULL, NULL,
     5, 40.5, 202.5, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Duvet Insert 180 បណ្តូយភួយ 1.8​ម​ x​ 2ម', 'computer_office', NULL, NULL, NULL,
     '2026-06-09', NULL, NULL, NULL, NULL,
     5, 34.25, 171.25, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Pillow Case L', 'computer_office', NULL, NULL, NULL,
     '2026-06-09', NULL, NULL, NULL, NULL,
     20, 6.5, 130.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Pillow Case S', 'computer_office', NULL, NULL, NULL,
     '2026-06-09', NULL, NULL, NULL, NULL,
     20, 3.75, 75.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('គ្រែអត់ក្បាល 220*220*32', 'furniture', NULL, NULL, NULL,
     '2025-12-25', NULL, NULL, NULL, NULL,
     1, 350.0, 350.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ទូ 50*150*450', 'furniture', NULL, NULL, NULL,
     '2025-12-25', NULL, NULL, NULL, NULL,
     1, 450.0, 450.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ទូពន្យួរសម្លៀកបំពាក់', 'furniture', NULL, NULL, NULL,
     '2026-02-09', NULL, NULL, NULL, NULL,
     2, 26.0, 52.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ឈើទូរខោអាវ', 'furniture', NULL, NULL, NULL,
     '2026-03-25', NULL, NULL, NULL, NULL,
     1, 755.0, 755.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ទូ', 'furniture', NULL, NULL, NULL,
     '2026-04-11', NULL, NULL, NULL, NULL,
     1, 230.0, 230.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('តុ', 'furniture', NULL, NULL, NULL,
     '2026-04-11', NULL, NULL, NULL, NULL,
     1, 440.0, 440.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('តុក្បាលគ្រែ', 'furniture', NULL, NULL, NULL,
     '2026-05-13', NULL, NULL, NULL, NULL,
     8, 88.0, 704.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('គ្រែ 180*200 ពណ៍ធម្មជាតិ', 'furniture', NULL, NULL, NULL,
     '2026-05-13', NULL, NULL, NULL, NULL,
     1, 260.0, 260.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ធ្នើរ 30*50 កំពស់ 75', 'furniture', NULL, NULL, NULL,
     '2026-05-13', NULL, NULL, NULL, NULL,
     2, 33.0, 66.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('កៅអី 01', 'furniture', NULL, NULL, NULL,
     '2026-05-13', NULL, NULL, NULL, NULL,
     20, 16.5, 330.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('កៅអីហែលទឹក', 'furniture', NULL, NULL, NULL,
     '2026-05-14', NULL, NULL, NULL, NULL,
     2, 175.0, 350.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('តុឃ្លុប', 'furniture', NULL, NULL, NULL,
     '2026-05-15', NULL, NULL, NULL, NULL,
     2, 75.0, 150.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Mini Bar Table + Chairs 4pcs', 'furniture', NULL, NULL, NULL,
     '2026-05-19', NULL, NULL, NULL, NULL,
     1, 130.0, 130.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ធ្នើរ ខ្នាត 60សម', 'furniture', NULL, NULL, NULL,
     '2026-05-19', NULL, NULL, NULL, NULL,
     2, 14.0, 28.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('តាប៊ីយែ', 'furniture', NULL, NULL, NULL,
     '2026-06-06', NULL, NULL, NULL, NULL,
     1, 1800.0, 1800.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('គ្រែឈើស្រឡៅ', 'furniture', NULL, NULL, NULL,
     '2026-06-08', NULL, NULL, NULL, NULL,
     2, 580.0, 1160.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('NEO Dining Set MED0007, តុបាយ 1 និង កៅអី8', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 1783.0, 1783.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Bed NH103', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 330.0, 330.0, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fabric Bar Chair NCL-LGM 2952', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     10, 159.33, 1593.3000000000002, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fabric Dining Chair NCL-LGM 362', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     10, 167.33, 1673.3000000000002, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fabric Dining Chair NCL-LGM 373', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     10, 167.33, 1673.3000000000002, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ACS0380-1', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 12.24, 24.48, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ACS0380', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 12.23, 24.46, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ACS0384-1', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 19.9, 19.9, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ACS0384', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 36.57, 36.57, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ACS0388-1', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 18.43, 18.43, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ACS0388', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 21.7, 21.7, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ACS0389-1', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 18.43, 18.43, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ACS0389', 'furniture', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 24.15, 24.15, 0.2, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ម៉ូទ័របូមប្រេងម៉ូតូទឹក', 'machinery', NULL, NULL, NULL,
     '2024-10-09', NULL, NULL, NULL, NULL,
     1, 75.0, 75.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Hand winch cable 1200LB Silver', 'machinery', NULL, NULL, NULL,
     '2024-12-18', NULL, NULL, NULL, NULL,
     1, 22.0, 22.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ម៉ូទ័រយោង 220V 1000/2000Kg, កាប 80ម៉ែត្រ', 'machinery', NULL, NULL, NULL,
     '2024-12-30', NULL, NULL, NULL, NULL,
     1, 775.0, 775.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ម៉ូទ័របាញ់លាងអូតូ DLK', 'machinery', NULL, NULL, NULL,
     '2024-12-30', NULL, NULL, NULL, NULL,
     1, 100.0, 100.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ម៉ាស៊ីនត្រជាក់ Panasonic 2HP', 'machinery', NULL, NULL, NULL,
     '2026-01-05', NULL, NULL, NULL, NULL,
     4, 645.0, 2580.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ម៉ាស៊ីនត្រជាក់ Panasonic 2HP', 'machinery', NULL, NULL, NULL,
     '2026-01-05', NULL, NULL, NULL, NULL,
     1, 910.0, 910.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ម៉ាស៊ីនត្រជាក់ Panasonic 5HP', 'machinery', NULL, NULL, NULL,
     '2026-01-05', NULL, NULL, NULL, NULL,
     2, 1420.0, 2840.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fan Diameter 2m', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     1, 342.65, 342.65, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fan Diameter 2.5m', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     1, 347.24, 347.24, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fan Diameter 3m', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     1, 351.83, 351.83, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fan Diameter 3.6m', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     1, 451.26, 451.26, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('កង្ហារនៅកញ្ចុះខាងមុខ', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     4, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('កង្ហារនៅក្នុងបន្ទប់Gym  និង Minibar', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('កង្ហារនៅក្នុងបផ្ទះកុងតាន័រខាងលើ និងខាងក្រោម', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fan Diameter 2.5m Height of Pillar', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     1, 385.0, 385.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fan Diameter 3m Height of Pillar', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     1, 390.02, 390.02, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Wall Outdoor B026-90B Gray', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     18, 7.46, 134.28, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('HK-376/1 Wall Lamp', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     1, 7.6, 7.6, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Spot 10W 4000K Queen Round', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     49, 6.64, 325.35999999999996, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Spot 7W 4000K Queen Round', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     6, 4.95, 29.700000000000003, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Downlight 12W 4000K Queen Round', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     19, 5.86, 111.34, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Spot Light 4W 6500K', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     90, 6.2, 558.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('LED Chilli Tube 7W E27 3Tong', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     40, 2.28, 91.19999999999999, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Spot LED 18W 4000K Square Thla Queen', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     52, 12.64, 657.28, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('LED Square 4W Thla 6000K Crystal', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     50, 4.62, 231.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fa Chang LED Black 6500K', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     10, 14.02, 140.2, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fa Chang LED Sliver 6500K', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     10, 21.65, 216.5, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('3M Long Line, Glass Size 20cm*32cm', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     20, 15.33, 306.6, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('3M Long Line, Glass Diameter 20cm', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     10, 10.73, 107.30000000000001, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('3M Long Line, Glass Diameter 15cm', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     10, 9.2, 92.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Fan Wood Leaf Size 48 Inches', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     4, 65.87, 263.48, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Star Ceiling Size 2.8m*4.65', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     1, 525.28, 525.28, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('LED Chilli Tube 7W E27 3Tong', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     45, 2.28, 102.6, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Kbal Sosor Mol Solar 4W Size 270*H300', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     5, 15.46, 77.30000000000001, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Kbal Sosor Chroung Solar 4W Size 270*H300', 'machinery', NULL, NULL, NULL,
     '2026-01-08', NULL, NULL, NULL, NULL,
     25, 12.78, 319.5, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Alba TV and Cabinets 1set', 'machinery', NULL, NULL, NULL,
     '2026-02-03', NULL, NULL, NULL, NULL,
     1, 2088.0, 2088.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('SPL0181 អំពូល', 'machinery', NULL, NULL, NULL,
     '2026-02-03', NULL, NULL, NULL, NULL,
     49, 6.64, 325.35999999999996, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('LTR0007 300m អំពូល', 'machinery', NULL, NULL, NULL,
     '2026-02-03', NULL, NULL, NULL, NULL,
     3, 119.0, 357.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('LTR0018 អំពូល', 'machinery', NULL, NULL, NULL,
     '2026-02-03', NULL, NULL, NULL, NULL,
     50, 0.75, 37.5, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('SPL0132 Wall LED Outdoor 3W 3500K Warm White', 'machinery', NULL, NULL, NULL,
     '2026-03-09', NULL, NULL, NULL, NULL,
     9, 5.62, 50.58, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('SPL0133 Spot Light Wall LED Outdoor 3W 6000K White', 'machinery', NULL, NULL, NULL,
     '2026-03-09', NULL, NULL, NULL, NULL,
     51, 5.6, 285.59999999999997, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('FAL0075 FA LED Solar SO7H-500W Street Farms', 'machinery', NULL, NULL, NULL,
     '2026-03-09', NULL, NULL, NULL, NULL,
     6, 27.2, 163.2, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Motor លាងឡាន', 'machinery', NULL, NULL, NULL,
     '2026-04-09', NULL, NULL, NULL, NULL,
     1, 111.5, 111.5, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ទុយោបាញ់ទឹក 30ម៉ែត្រ', 'machinery', NULL, NULL, NULL,
     '2026-04-11', NULL, NULL, NULL, NULL,
     2, 38.0, 76.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Stain Steel Horizontal Multistage pump', 'machinery', NULL, NULL, NULL,
     '2026-04-22', NULL, NULL, NULL, NULL,
     1, 190.0, 190.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Stain Steel Horizontal Multistage pump', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ប៉ុស្តផ្សា', 'machinery', NULL, NULL, NULL,
     '2026-04-30', NULL, NULL, NULL, NULL,
     1, 95.03, 95.03, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ទូរទឹកកក Hitachi', 'machinery', NULL, NULL, NULL,
     '2026-04-30', NULL, NULL, NULL, NULL,
     1, 1035.0, 1035.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ធុងចម្រោះទឹកក្តៅ - ត្រជាក់', 'machinery', NULL, NULL, NULL,
     '2026-05-12', NULL, NULL, NULL, NULL,
     1, 170.0, 170.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ឆ្នាំងដាំបាយ', 'machinery', NULL, NULL, NULL,
     '2026-05-12', NULL, NULL, NULL, NULL,
     1, 60.0, 60.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Smart TV Samsung 85inch', 'machinery', NULL, NULL, NULL,
     '2026-05-15', NULL, NULL, NULL, NULL,
     1, 1050.0, 1050.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ឈុតរឡូលាងឡាន', 'machinery', NULL, NULL, NULL,
     '2026-05-28', NULL, NULL, NULL, NULL,
     2, 53.0, 106.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ម៉ាស៊ីនបោកខោអាវ', 'machinery', NULL, NULL, NULL,
     '2026-06-02', NULL, NULL, NULL, NULL,
     1, 650.0, 650.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Microwave Sharp', 'machinery', NULL, NULL, NULL,
     '2026-06-08', NULL, NULL, NULL, NULL,
     1, 110.0, 110.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('តុឈើដាក់នៅកញ្ចុះ 1.2mx 80m, យកពីផ្ទះចែទៅប្រើ', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     4, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('កៅអីជ័រ', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     30, 6.5, 195.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('តុុដែក ស 1 នឹងកៅអី4 យកពីផ្ទះចែទៅ', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('តុបាយជ័រវែង ព៏ណស យកពីផ្ទះចែទៅ', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     3, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ទោងយោលមូល ស ចែកម្មង់ពីចិន', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('អង្រឹង ស ចែកម្មង់ពីចិន', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ប៉ៅអី អង្គុយឈើ ចែកម្មង់ពីចិន មានស នឹងឆ្នូតខៀវ', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     4, 27.05, 108.2, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ប៉ៅអី អង្គុយឈើ ចែកម្មង់ពីចិន', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 110.45, 220.9, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ប៉ៅអី អង្គុយឈើមូល មានពូក ទិញនៅកំពត', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 60.0, 60.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ប៉ៅអីបត់ប្រផេះ', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ធុុងសំរាមល្អ', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Speakerតូ​ច ចែកម្មង់ពីចិន ស1​  ប្រផេះ1', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Speaker JBL Eaon 1 With Microphone 1set', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('មា៉សុីនកាហ្វេ Philip', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ចង្រ្កា​នហ្គាស', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ធុងហ្គាស 5kg', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ធុងក្លាសេកក ស យកពីផ្ទះចែទៅ', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ខ្នើយតុបតែង ហ៊ានាក់ទិញ', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     8, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ស្មាព្យួរខោអាវអីណុក', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ធ្នើរដាក់អីវ៉ាន់អីណុក', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ទោងយោលរូបកង់', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 150.0, 150.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ឈុតស្រោមBella Blue ទុកសំរាប់ហ៊ាប្រើផ្ទាល់ខ្លួន', 'machinery', 'មិត្តភាព', NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 46.0, 46.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ម៉ាសីនផលិតទឹកកក មួយ', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ឆ័ត្រស នឹងជើងសីម៉ង', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 49.5, 99.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('បំពង់ពន្លត់អគ្គីភ័យ ABC 8Kg', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 17.0, 34.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('បំពង់ពន្លត់អគ្គីភ័យ ABC 4Kg', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 14.0, 28.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('បំពង់ពន្លត់អគ្គីភ័យ ABC 1Kg', 'machinery', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     2, 10.0, 20.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Jet Ski', 'vehicle', NULL, NULL, NULL,
     '2024-07-03', NULL, NULL, NULL, NULL,
     2, 7000.0, 14000.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('អូប័រ', 'vehicle', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Kayak - Yellow', 'vehicle', NULL, NULL, NULL,
     '2024-08-20', NULL, NULL, NULL, NULL,
     1, 340.0, 340.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Kayak - Red', 'vehicle', NULL, NULL, NULL,
     '2024-08-20', NULL, NULL, NULL, NULL,
     1, 330.0, 330.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Kayak - Blue', 'vehicle', NULL, NULL, NULL,
     '2024-08-20', NULL, NULL, NULL, NULL,
     1, 330.0, 330.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Kayak Chain', 'vehicle', NULL, NULL, NULL,
     '2024-08-20', NULL, NULL, NULL, NULL,
     6, 0.0, 0.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ពោងបណ្តែតទឹក (ខាងលើឈើ)', 'vehicle', NULL, NULL, NULL,
     '2026-05-22', NULL, NULL, NULL, NULL,
     1, 2300.0, 2300.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ពោងបណ្តែតទឹក', 'vehicle', NULL, NULL, NULL,
     '2026-06-01', NULL, NULL, NULL, NULL,
     8, 20.0, 160.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ក្បូនឈើគគីរសុទ្ធ', 'vehicle', NULL, NULL, NULL,
     '2026-06-04', NULL, NULL, NULL, NULL,
     1, 2800.0, 2800.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('កក់ម៉ាស៊ីនអូប័រ 30%', 'vehicle', NULL, NULL, NULL,
     '2026-06-09', NULL, NULL, NULL, NULL,
     1, 2682.0, 2682.0, 0.1, true, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('ពោងជ័របណ្តែតទឹកដាក់ Jet Ski', 'vehicle', NULL, NULL, NULL,
     '2026-05-20', NULL, NULL, NULL, NULL,
     1, 1890.0, 1890.0, 0.0, false, 'active', _bid);

  INSERT INTO fixed_assets
    (description, category, type_brand, asset_code, series_code,
     purchased_date, date_acquired, location, incharge, invoice_doc_ref,
     quantity, unit_cost, total_cost, depreciation_rate, is_depreciable, status, branch_id)
  VALUES
    ('Buggy Red (យកពីស្រែអំបិល)', 'vehicle', NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL,
     1, 0.0, 0.0, 0.0, false, 'active', _bid);

END $$;
