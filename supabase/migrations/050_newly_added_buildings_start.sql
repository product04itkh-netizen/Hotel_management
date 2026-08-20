-- ============================================================
-- Migration 050: Newly-added Kampot buildings start depreciating September
--
-- The Kampot workbook's Buildings subtotal sums cost and book value over
-- all eight rows but depreciation over only the first four:
--     M9  cost        =SUM(M10:M17)      $416,920.83
--     V9  Aug dep     =SUM(V10:V13)        $1,683.01
--     AB9 book value  =SUM(AB10:AB17)   $415,183.66
--
-- The four excluded rows are flagged បន្ថែមថ្មី ("newly added") -- they were
-- capitalised after the August working paper was computed. So they belong
-- in the register at cost (total stays $826,166.08, confirmed) but carry no
-- August charge; depreciation begins the following month.
--
-- Moving their start date to 2026-09-01 brings Kampot's August total to
-- $3,029.5745, matching the workbook, without disturbing the cost basis or
-- the capitalising entry from migration 048.
--
-- Rows: ឈើ ($2937.00), កញ្ចក់បន្ទប់ទឹក ($1695.00), កញ្ចក់បន្ទប់ហាត់ប្រាណ ($521.00), សម្ភារៈផ្ទះបាយ និងបន្ទប់ទឹក ($7845.95)
-- Combined cost $12998.95; August effect $54.162292.
-- Safe to re-run.
-- ============================================================

UPDATE fixed_assets SET depreciation_start_date = '2026-09-01', updated_at = NOW()
WHERE id IN (
  '87c2f727-6dac-453c-80e0-0da419884626',
  '03bc34b6-fe03-4c76-8efc-8911142306e1',
  '1052a40d-33f1-45cb-97f4-221f5aa08627',
  'e5230d64-bf04-4d37-9b18-a2c647df124b'
);
