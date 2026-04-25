-- ============================================================
-- Sample Guests + Reservations for demo purposes
-- Run AFTER the migration and AFTER you have added rooms.
-- ============================================================

-- Sample guests
INSERT INTO guests (full_name, email, phone, nationality, id_type, id_number, visit_count) VALUES
  ('James Anderson',   'james.a@email.com',   '+1 555 100 2001', 'American',   'passport',    'USA123456', 3),
  ('Li Wei',           'liwei@email.cn',       '+86 139 0000 1234','Chinese',   'passport',    'CHN987654', 1),
  ('Marie Dubois',     'marie.d@email.fr',     '+33 6 12 34 56 78','French',    'passport',    'FRA456789', 2),
  ('Ahmad Hassan',     'ahmad.h@email.ae',     '+971 50 123 4567', 'Emirati',   'national_id', 'UAE001234', 1),
  ('Sakura Yamamoto',  'sakura.y@email.jp',    '+81 90 1234 5678', 'Japanese',  'passport',    'JPN789012', 4),
  ('Carlos Rivera',    'carlos.r@email.mx',    '+52 55 1234 5678', 'Mexican',   'passport',    'MEX345678', 1);
