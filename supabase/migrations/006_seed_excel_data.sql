-- ============================================================
-- Migration 006: Seed historical booking data from Excel
-- Source: Booking Schedule Resort.xlsx — sheet "OnlyOne Srea ombel"
-- Branch: Srae Ambel | House: OnlyOne Home Stay
-- Safe to re-run: checks NOT EXISTS before every insert
-- ============================================================
--
-- Excel column mapping:
--   Col A = Date, Col B = Time, Col C = Customer, Col E = Phone
--   Col F = Status, Col G = Notes (pax), Col I = 4-Wheel Vehicle Rental
--   Col J = Cooking/Food Service, Col K = Rice Cooking, Col L = Ice
--   Col M = House Price (តំលៃផ្ទះ), Col N = Tent Rental, Col O = Bedding Set
--   Col P = Deposit, Col Q = Paid (remaining after deposit)
--
-- Total = House + all add-ons; Amount Paid = Deposit + Paid (for completed)
-- ============================================================

DO $$
DECLARE
  v_branch_id  UUID;
  v_house_id   UUID;
  v_guest_id   UUID;
  v_res_id     UUID;
  v_inv_id     UUID;
BEGIN

  -- Resolve Srae Ambel branch + OnlyOne Home Stay house
  SELECT id INTO v_branch_id FROM branches WHERE location ILIKE '%Srae Ambel%' LIMIT 1;
  SELECT id INTO v_house_id  FROM houses  WHERE name = 'OnlyOne Home Stay' AND branch_id = v_branch_id LIMIT 1;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch "Srae Ambel" not found — run migration 004 first';
  END IF;
  IF v_house_id IS NULL THEN
    RAISE EXCEPTION 'House "OnlyOne Home Stay" not found — run migration 004 first';
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 1. ខាងម៉ូតូត្រៃ | 2026-03-21 17:00 | 10 Pax | $0 | Confirm
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'ខាងម៉ូតូត្រៃ' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, visit_count)
    VALUES ('ខាងម៉ូតូត្រៃ', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260321-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit, notes
    ) VALUES (
      'RES-20260321-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-03-21', '2026-03-22', 'checked_out',
      10, 0, 10, '17:00', 'phone',
      0.00, 0.00, 'No charge recorded in booking schedule'
    ) RETURNING id INTO v_res_id;

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items, notes
    ) VALUES (
      'INV-20260321-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      0, 0, 0, 0, 0, 0,
      'paid', 'cash', '2026-03-22T08:00:00+00',
      '[{"description":"House Rental — OnlyOne Home Stay (1 night)","quantity":1,"unit_price":0,"total":0}]',
      'No charge recorded. ABA Hea.'
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 2. ហួតជាមួយមិត្ត | 2026-04-06 08:00 | 6 Pax | $0 | Confirm
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'ហួតជាមួយមិត្ត' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, visit_count)
    VALUES ('ហួតជាមួយមិត្ត', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260406-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit
    ) VALUES (
      'RES-20260406-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-04-06', '2026-04-07', 'checked_out',
      6, 0, 6, '08:00', 'phone',
      0.00, 0.00
    ) RETURNING id INTO v_res_id;

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items
    ) VALUES (
      'INV-20260406-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      0, 0, 0, 0, 0, 0,
      'paid', 'cash', '2026-04-07T08:00:00+00',
      '[{"description":"House Rental — OnlyOne Home Stay (1 night)","quantity":1,"unit_price":0,"total":0}]'
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 3. ចែ Sokchean | 2026-04-12 08:00 | 18 Pax | $263.75 | Confirm
  --    House $100 + Vehicle $100 + Food $50 + Rice $10 + Ice $3.75
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'ចែ Sokchean' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, phone, visit_count)
    VALUES ('ចែ Sokchean', '011544599', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260412-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit
    ) VALUES (
      'RES-20260412-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-04-12', '2026-04-13', 'checked_out',
      18, 0, 18, '08:00', 'phone',
      263.75, 0.00
    ) RETURNING id INTO v_res_id;

    INSERT INTO reservation_line_items (reservation_id, label, amount, sort_order) VALUES
      (v_res_id, '4-Wheel Vehicle Rental',   100.00, 1),
      (v_res_id, 'Cooking / Food Service',    50.00, 2),
      (v_res_id, 'Rice Cooking',              10.00, 3),
      (v_res_id, 'Ice',                        3.75, 4);

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items, notes
    ) VALUES (
      'INV-20260412-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      263.75, 0, 0, 0, 263.75, 263.75,
      'paid', 'bank_transfer', '2026-04-13T08:00:00+00',
      '[
        {"description":"House Rental — OnlyOne Home Stay (1 night, custom rate)","quantity":1,"unit_price":100.00,"total":100.00},
        {"description":"4-Wheel Vehicle Rental","quantity":1,"unit_price":100.00,"total":100.00},
        {"description":"Cooking / Food Service","quantity":1,"unit_price":50.00,"total":50.00},
        {"description":"Rice Cooking","quantity":1,"unit_price":10.00,"total":10.00},
        {"description":"Ice","quantity":1,"unit_price":3.75,"total":3.75}
      ]',
      'ABA 010 992 825 — already transferred to Je.Pisey ($264)'
    ) RETURNING id INTO v_inv_id;

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 263.75, 'bank_transfer', '2026-04-13T08:00:00+00', 'ABA 010 992 825', v_branch_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 4. Alec | 2026-04-17 08:00 | 4 Pax | $30 | CANCELLED
  --    House $30 (cancellation / deposit forfeited)
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'Alec' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, phone, visit_count)
    VALUES ('Alec', '095945681', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260417-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit
    ) VALUES (
      'RES-20260417-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-04-17', '2026-04-18', 'cancelled',
      4, 0, 4, '08:00', 'phone',
      30.00, 0.00
    ) RETURNING id INTO v_res_id;

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items, notes
    ) VALUES (
      'INV-20260417-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      30.00, 0, 0, 0, 30.00, 30.00,
      'void', 'bank_transfer', '2026-04-17T08:00:00+00',
      '[{"description":"Cancellation — deposit forfeited","quantity":1,"unit_price":30.00,"total":30.00}]',
      'Booking cancelled. ABA 010 992 825 — transferred to Je.Pisey'
    ) RETURNING id INTO v_inv_id;

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 30.00, 'bank_transfer', '2026-04-17T08:00:00+00', 'Cancellation fee — ABA 010 992 825', v_branch_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 5. បងស្រី Vichea | 2026-05-01 08:00 | 16 Pax | $193.75 | Confirm
  --    House $180 + Rice $10 + Ice $3.75 | Deposit $100
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'បងស្រី Vichea' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, phone, visit_count)
    VALUES ('បងស្រី Vichea', '0978008006', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260501-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit
    ) VALUES (
      'RES-20260501-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-05-01', '2026-05-02', 'checked_out',
      16, 0, 16, '08:00', 'phone',
      193.75, 100.00
    ) RETURNING id INTO v_res_id;

    INSERT INTO reservation_line_items (reservation_id, label, amount, sort_order) VALUES
      (v_res_id, 'Rice Cooking',  10.00, 1),
      (v_res_id, 'Ice',            3.75, 2);

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items, notes
    ) VALUES (
      'INV-20260501-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      193.75, 0, 0, 0, 193.75, 193.75,
      'paid', 'bank_transfer', '2026-05-02T08:00:00+00',
      '[
        {"description":"House Rental — OnlyOne Home Stay (1 night)","quantity":1,"unit_price":180.00,"total":180.00},
        {"description":"Rice Cooking","quantity":1,"unit_price":10.00,"total":10.00},
        {"description":"Ice","quantity":1,"unit_price":3.75,"total":3.75}
      ]',
      'Deposit $100 received in advance. ABA 012 859 012 — transferred to Je.Pisey'
    ) RETURNING id INTO v_inv_id;

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 100.00, 'bank_transfer', '2026-04-25T08:00:00+00', 'Deposit — ABA 012 859 012', v_branch_id);

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 93.75, 'bank_transfer', '2026-05-02T08:00:00+00', 'Balance — ABA 012 859 012', v_branch_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 6. kakada | 2026-05-16 08:00 | 2 Pax | $20 | Confirm
  --    Tent Rental $20 only (no house charge)
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'kakada' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, visit_count)
    VALUES ('kakada', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260516-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit
    ) VALUES (
      'RES-20260516-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-05-16', '2026-05-17', 'checked_out',
      2, 0, 2, '08:00', 'walk_in',
      20.00, 0.00
    ) RETURNING id INTO v_res_id;

    INSERT INTO reservation_line_items (reservation_id, label, amount, sort_order) VALUES
      (v_res_id, 'Tent Rental', 20.00, 1);

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items, notes
    ) VALUES (
      'INV-20260516-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      20.00, 0, 0, 0, 20.00, 20.00,
      'paid', 'bank_transfer', '2026-05-17T08:00:00+00',
      '[{"description":"Tent Rental","quantity":1,"unit_price":20.00,"total":20.00}]',
      'ABA 012 859 012 — transferred to Je.Pisey'
    ) RETURNING id INTO v_inv_id;

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 20.00, 'bank_transfer', '2026-05-17T08:00:00+00', 'ABA 012 859 012', v_branch_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 7. Twenty Two | 2026-05-30 08:00 | 10 Pax | $210 | Confirm
  --    House $180 + Food $20 + Rice $10
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'Twenty Two' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, visit_count)
    VALUES ('Twenty Two', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260530-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit
    ) VALUES (
      'RES-20260530-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-05-30', '2026-05-31', 'checked_out',
      10, 0, 10, '08:00', 'walk_in',
      210.00, 0.00
    ) RETURNING id INTO v_res_id;

    INSERT INTO reservation_line_items (reservation_id, label, amount, sort_order) VALUES
      (v_res_id, 'Cooking / Food Service', 20.00, 1),
      (v_res_id, 'Rice Cooking',           10.00, 2);

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items, notes
    ) VALUES (
      'INV-20260530-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      210.00, 0, 0, 0, 210.00, 210.00,
      'paid', 'bank_transfer', '2026-05-31T08:00:00+00',
      '[
        {"description":"House Rental — OnlyOne Home Stay (1 night)","quantity":1,"unit_price":180.00,"total":180.00},
        {"description":"Cooking / Food Service","quantity":1,"unit_price":20.00,"total":20.00},
        {"description":"Rice Cooking","quantity":1,"unit_price":10.00,"total":10.00}
      ]',
      'ABA 012 859 012 — transferred to Je.Pisey'
    ) RETURNING id INTO v_inv_id;

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 210.00, 'bank_transfer', '2026-05-31T08:00:00+00', 'ABA 012 859 012', v_branch_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 8. Panha | 2026-06-08 12:00 | 12 Pax | $203 | Confirm
  --    House $180 + Food $8 + Rice $5 + Bedding $10
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'Panha' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, phone, visit_count)
    VALUES ('Panha', '069919797', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260608-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit
    ) VALUES (
      'RES-20260608-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-06-08', '2026-06-09', 'checked_out',
      12, 0, 12, '12:00', 'phone',
      203.00, 0.00
    ) RETURNING id INTO v_res_id;

    INSERT INTO reservation_line_items (reservation_id, label, amount, sort_order) VALUES
      (v_res_id, 'Cooking / Food Service',  8.00, 1),
      (v_res_id, 'Rice Cooking',             5.00, 2),
      (v_res_id, 'Bedding Set',             10.00, 3);

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items, notes
    ) VALUES (
      'INV-20260608-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      203.00, 0, 0, 0, 203.00, 203.00,
      'paid', 'bank_transfer', '2026-06-09T08:00:00+00',
      '[
        {"description":"House Rental — OnlyOne Home Stay (1 night)","quantity":1,"unit_price":180.00,"total":180.00},
        {"description":"Cooking / Food Service","quantity":1,"unit_price":8.00,"total":8.00},
        {"description":"Rice Cooking","quantity":1,"unit_price":5.00,"total":5.00},
        {"description":"Bedding Set","quantity":1,"unit_price":10.00,"total":10.00}
      ]',
      'ABA 012 859 012 — transferred to Je.Pisey'
    ) RETURNING id INTO v_inv_id;

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 203.00, 'bank_transfer', '2026-06-09T08:00:00+00', 'ABA 012 859 012', v_branch_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 9. Siek Mey | 2026-06-12 12:00 | 12 Pax | $180 | Confirm
  --    House $180 | Deposit $50 + Balance $130
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'Siek Mey' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, visit_count)
    VALUES ('Siek Mey', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260612-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit
    ) VALUES (
      'RES-20260612-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-06-12', '2026-06-13', 'checked_out',
      12, 0, 12, '12:00', 'walk_in',
      180.00, 50.00
    ) RETURNING id INTO v_res_id;

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items, notes
    ) VALUES (
      'INV-20260612-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      180.00, 0, 0, 0, 180.00, 180.00,
      'paid', 'bank_transfer', '2026-06-13T08:00:00+00',
      '[{"description":"House Rental — OnlyOne Home Stay (1 night)","quantity":1,"unit_price":180.00,"total":180.00}]',
      'Deposit $50 paid in advance. ABA 012 859 012 — transferred to Je.Pisey'
    ) RETURNING id INTO v_inv_id;

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 50.00, 'bank_transfer', '2026-06-06T08:00:00+00', 'Deposit — ABA 012 859 012', v_branch_id);

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 130.00, 'bank_transfer', '2026-06-13T08:00:00+00', 'Balance — ABA 012 859 012', v_branch_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 10. Tola | 2026-06-13 12:00 | 12 Pax | $220 | Confirm
  --     House $180 + Bedding Set $40 | Deposit $90 + Balance $130
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'Tola' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, visit_count)
    VALUES ('Tola', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260613-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit
    ) VALUES (
      'RES-20260613-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-06-13', '2026-06-14', 'checked_out',
      12, 0, 12, '12:00', 'walk_in',
      220.00, 90.00
    ) RETURNING id INTO v_res_id;

    INSERT INTO reservation_line_items (reservation_id, label, amount, sort_order) VALUES
      (v_res_id, 'Bedding Set', 40.00, 1);

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items, notes
    ) VALUES (
      'INV-20260613-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      220.00, 0, 0, 0, 220.00, 220.00,
      'paid', 'bank_transfer', '2026-06-14T08:00:00+00',
      '[
        {"description":"House Rental — OnlyOne Home Stay (1 night)","quantity":1,"unit_price":180.00,"total":180.00},
        {"description":"Bedding Set","quantity":1,"unit_price":40.00,"total":40.00}
      ]',
      'Deposit $90 paid in advance. ABA 012 859 012 — transferred to Je.Pisey'
    ) RETURNING id INTO v_inv_id;

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 90.00, 'bank_transfer', '2026-06-07T08:00:00+00', 'Deposit — ABA 012 859 012', v_branch_id);

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 130.00, 'bank_transfer', '2026-06-14T08:00:00+00', 'Balance — ABA 012 859 012', v_branch_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 11. Sovathara | 2026-06-20 12:00 | 12 Pax | $180 | Booking
  --     House $180 — fully paid in advance (deposit $90 + balance $90)
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'Sovathara' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, phone, visit_count)
    VALUES ('Sovathara', '081868696', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260620-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit
    ) VALUES (
      'RES-20260620-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-06-20', '2026-06-21', 'confirmed',
      12, 0, 12, '12:00', 'phone',
      180.00, 90.00
    ) RETURNING id INTO v_res_id;

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items, notes
    ) VALUES (
      'INV-20260620-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      180.00, 0, 0, 0, 180.00, 180.00,
      'paid', 'bank_transfer', '2026-06-16T08:00:00+00',
      '[{"description":"House Rental — OnlyOne Home Stay (1 night)","quantity":1,"unit_price":180.00,"total":180.00}]',
      'Fully paid in advance. ABA 012 859 012 — transferred to Je.Pisey'
    ) RETURNING id INTO v_inv_id;

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 90.00, 'bank_transfer', '2026-06-13T08:00:00+00', 'Deposit — ABA 012 859 012', v_branch_id);

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 90.00, 'bank_transfer', '2026-06-16T08:00:00+00', 'Balance — ABA 012 859 012', v_branch_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 12. Reachie | 2026-06-27 12:00 | 24 Pax | $180 | Booking
  --     House $180 — fully paid in advance (deposit $20 + balance $160)
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests WHERE full_name = 'Reachie' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, phone, visit_count)
    VALUES ('Reachie', '016778196', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260627-0001') THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit
    ) VALUES (
      'RES-20260627-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-06-27', '2026-06-28', 'confirmed',
      24, 0, 24, '12:00', 'phone',
      180.00, 20.00
    ) RETURNING id INTO v_res_id;

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, paid_at, items, notes
    ) VALUES (
      'INV-20260627-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      180.00, 0, 0, 0, 180.00, 180.00,
      'paid', 'bank_transfer', '2026-06-16T08:00:00+00',
      '[{"description":"House Rental — OnlyOne Home Stay (1 night)","quantity":1,"unit_price":180.00,"total":180.00}]',
      'Fully paid in advance. ABA 012 859 012 — transferred to Je.Pisey'
    ) RETURNING id INTO v_inv_id;

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 20.00, 'bank_transfer', '2026-06-10T08:00:00+00', 'Deposit — ABA 012 859 012', v_branch_id);

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 160.00, 'bank_transfer', '2026-06-16T08:00:00+00', 'Balance — ABA 012 859 012', v_branch_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 13. Mr. Vantage | 2026-07-04 12:00 | 12 Pax | Booking
  --     House price TBD — Deposit $90 received
  --     NOTE: Skipped if a reservation for this guest on 2026-07-04
  --     already exists (may have been entered manually in the system)
  -- ═══════════════════════════════════════════════════════════════
  SELECT id INTO v_guest_id FROM guests
  WHERE full_name ILIKE '%vantage%' LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO guests (full_name, phone, visit_count)
    VALUES ('Mr. Vantage', '017881888', 1)
    RETURNING id INTO v_guest_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM reservations
    WHERE guest_id = v_guest_id AND check_in_date = '2026-07-04'
  ) AND NOT EXISTS (
    SELECT 1 FROM reservations WHERE reservation_number = 'RES-20260704-0001'
  ) THEN
    INSERT INTO reservations (
      reservation_number, guest_id, house_id, branch_id,
      check_in_date, check_out_date, status,
      adults, children, pax_count, arrival_time, source,
      total_amount, deposit, notes
    ) VALUES (
      'RES-20260704-0001', v_guest_id, v_house_id, v_branch_id,
      '2026-07-04', '2026-07-05', 'confirmed',
      12, 0, 12, '12:00', 'phone',
      90.00, 90.00,
      'House price to be confirmed. Deposit $90 received.'
    ) RETURNING id INTO v_res_id;

    INSERT INTO invoices (
      invoice_number, reservation_id, guest_id, house_id, branch_id,
      subtotal, tax_rate, tax_amount, discount_amount, total,
      amount_paid, status, payment_method, items, notes
    ) VALUES (
      'INV-20260704-0001', v_res_id, v_guest_id, v_house_id, v_branch_id,
      90.00, 0, 0, 0, 90.00, 90.00,
      'partial', 'bank_transfer',
      '[{"description":"Deposit — house price to be confirmed","quantity":1,"unit_price":90.00,"total":90.00}]',
      'Deposit only. ABA 012 859 012 — transferred to Je.Pisey. Final house charge pending.'
    ) RETURNING id INTO v_inv_id;

    INSERT INTO payment_transactions (invoice_id, amount, payment_method, payment_date, notes, branch_id)
    VALUES (v_inv_id, 90.00, 'bank_transfer', '2026-06-15T08:00:00+00', 'Deposit — ABA 012 859 012', v_branch_id);
  END IF;

END $$;
