-- ============================================================
-- LPT Hotel Management System — Initial Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- Updated-at trigger function
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────
-- ROOMS
-- ─────────────────────────────────────────
CREATE TABLE rooms (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_number      VARCHAR(10)    NOT NULL UNIQUE,
  room_type        VARCHAR(50)    NOT NULL DEFAULT 'standard',
  floor            INTEGER        NOT NULL DEFAULT 1,
  status           VARCHAR(20)    NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available','occupied','cleaning','maintenance','out_of_order')),
  price_per_night  NUMERIC(10,2)  NOT NULL DEFAULT 0 CHECK (price_per_night >= 0),
  max_adults       INTEGER        NOT NULL DEFAULT 2,
  max_children     INTEGER        NOT NULL DEFAULT 1,
  amenities        TEXT[]         DEFAULT '{}',
  description      TEXT,
  created_at       TIMESTAMPTZ    DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TRIGGER rooms_updated_at BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_floor  ON rooms(floor);

-- ─────────────────────────────────────────
-- GUESTS
-- ─────────────────────────────────────────
CREATE TABLE guests (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  full_name      VARCHAR(200) NOT NULL,
  email          VARCHAR(200),
  phone          VARCHAR(50),
  nationality    VARCHAR(100),
  id_type        VARCHAR(50),
  id_number      VARCHAR(100),
  date_of_birth  DATE,
  address        TEXT,
  notes          TEXT,
  visit_count    INTEGER DEFAULT 1,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER guests_updated_at BEFORE UPDATE ON guests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_guests_name  ON guests(full_name);
CREATE INDEX idx_guests_email ON guests(email);

-- ─────────────────────────────────────────
-- STAFF
-- ─────────────────────────────────────────
CREATE TABLE staff (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  full_name    VARCHAR(200) NOT NULL,
  role         VARCHAR(50)  NOT NULL DEFAULT 'receptionist'
                 CHECK (role IN ('admin','manager','receptionist','housekeeping','maintenance','accounting')),
  email        VARCHAR(200) UNIQUE,
  phone        VARCHAR(50),
  status       VARCHAR(20)  DEFAULT 'active'
                 CHECK (status IN ('active','inactive','on_leave')),
  department   VARCHAR(100),
  hire_date    DATE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TRIGGER staff_updated_at BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_staff_role   ON staff(role);
CREATE INDEX idx_staff_status ON staff(status);

-- ─────────────────────────────────────────
-- RESERVATIONS
-- ─────────────────────────────────────────
CREATE TABLE reservations (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reservation_number   VARCHAR(30)    NOT NULL UNIQUE,
  guest_id             UUID REFERENCES guests(id) ON DELETE SET NULL,
  room_id              UUID REFERENCES rooms(id) ON DELETE SET NULL,
  check_in_date        DATE           NOT NULL,
  check_out_date       DATE           NOT NULL CHECK (check_out_date > check_in_date),
  actual_check_in      TIMESTAMPTZ,
  actual_check_out     TIMESTAMPTZ,
  status               VARCHAR(30)    NOT NULL DEFAULT 'confirmed'
                         CHECK (status IN ('pending','confirmed','checked_in','checked_out','cancelled','no_show')),
  adults               INTEGER        NOT NULL DEFAULT 1 CHECK (adults >= 1),
  children             INTEGER        NOT NULL DEFAULT 0 CHECK (children >= 0),
  total_amount         NUMERIC(10,2),
  special_requests     TEXT,
  source               VARCHAR(50)    DEFAULT 'walk_in'
                         CHECK (source IN ('walk_in','phone','online','ota','referral')),
  notes                TEXT,
  created_by           UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ    DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TRIGGER reservations_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_res_guest_id      ON reservations(guest_id);
CREATE INDEX idx_res_room_id       ON reservations(room_id);
CREATE INDEX idx_res_check_in_date ON reservations(check_in_date);
CREATE INDEX idx_res_status        ON reservations(status);

-- ─────────────────────────────────────────
-- INVOICES
-- ─────────────────────────────────────────
CREATE TABLE invoices (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  invoice_number   VARCHAR(30)    NOT NULL UNIQUE,
  reservation_id   UUID REFERENCES reservations(id) ON DELETE SET NULL,
  guest_id         UUID REFERENCES guests(id) ON DELETE SET NULL,
  subtotal         NUMERIC(10,2)  NOT NULL DEFAULT 0,
  tax_rate         NUMERIC(5,2)   DEFAULT 10,
  tax_amount       NUMERIC(10,2)  DEFAULT 0,
  discount_amount  NUMERIC(10,2)  DEFAULT 0,
  total            NUMERIC(10,2)  NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(10,2)  DEFAULT 0,
  status           VARCHAR(20)    DEFAULT 'unpaid'
                     CHECK (status IN ('unpaid','partial','paid','refunded','void')),
  payment_method   VARCHAR(50),
  paid_at          TIMESTAMPTZ,
  items            JSONB          DEFAULT '[]'::jsonb,
  notes            TEXT,
  created_at       TIMESTAMPTZ    DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_invoices_status     ON invoices(status);
CREATE INDEX idx_invoices_guest_id   ON invoices(guest_id);
CREATE INDEX idx_invoices_paid_at    ON invoices(paid_at);

-- ─────────────────────────────────────────
-- HOUSEKEEPING TASKS
-- ─────────────────────────────────────────
CREATE TABLE housekeeping_tasks (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_id      UUID REFERENCES rooms(id) ON DELETE CASCADE,
  task_type    VARCHAR(50)  NOT NULL DEFAULT 'cleaning'
                 CHECK (task_type IN ('cleaning','turndown','inspection','maintenance','special')),
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','completed','skipped')),
  priority     VARCHAR(20)  DEFAULT 'normal'
                 CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to  UUID REFERENCES staff(id) ON DELETE SET NULL,
  notes        TEXT,
  due_date     DATE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TRIGGER housekeeping_tasks_updated_at BEFORE UPDATE ON housekeeping_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_hk_room_id ON housekeeping_tasks(room_id);
CREATE INDEX idx_hk_status  ON housekeeping_tasks(status);
CREATE INDEX idx_hk_assigned_to ON housekeeping_tasks(assigned_to);

-- ─────────────────────────────────────────
-- HOTEL SETTINGS
-- ─────────────────────────────────────────
CREATE TABLE hotel_settings (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  hotel_name           VARCHAR(200)  DEFAULT 'Grand Palms Hotel',
  hotel_address        TEXT,
  hotel_phone          VARCHAR(50),
  hotel_email          VARCHAR(200),
  telegram_bot_token   TEXT,
  telegram_chat_id     TEXT,
  telegram_enabled     BOOLEAN       DEFAULT false,
  notification_events  TEXT[]        DEFAULT ARRAY['new_reservation','checkin','checkout','payment'],
  tax_rate             NUMERIC(5,2)  DEFAULT 10,
  currency             VARCHAR(10)   DEFAULT 'USD',
  check_in_time        VARCHAR(10)   DEFAULT '14:00',
  check_out_time       VARCHAR(10)   DEFAULT '12:00',
  created_at           TIMESTAMPTZ   DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TRIGGER hotel_settings_updated_at BEFORE UPDATE ON hotel_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed default settings row
INSERT INTO hotel_settings (hotel_name, tax_rate, currency, check_in_time, check_out_time)
VALUES ('Grand Palms Hotel', 10, 'USD', '14:00', '12:00');

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────
ALTER TABLE rooms               ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff               ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_tasks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_settings      ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "Authenticated users can do everything on rooms"
  ON rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on guests"
  ON guests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on staff"
  ON staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on reservations"
  ON reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on invoices"
  ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on housekeeping_tasks"
  ON housekeeping_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on hotel_settings"
  ON hotel_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────
-- SEED DEMO DATA
-- ─────────────────────────────────────────

-- Sample rooms (3 floors, 5 rooms each)
INSERT INTO rooms (room_number, room_type, floor, status, price_per_night, max_adults, max_children, amenities) VALUES
  ('101', 'standard',     1, 'available',   89.00, 2, 1, ARRAY['WiFi','AC','TV']),
  ('102', 'standard',     1, 'occupied',    89.00, 2, 1, ARRAY['WiFi','AC','TV']),
  ('103', 'deluxe',       1, 'cleaning',   129.00, 2, 2, ARRAY['WiFi','AC','TV','Minibar']),
  ('104', 'standard',     1, 'available',   89.00, 2, 1, ARRAY['WiFi','AC','TV']),
  ('105', 'standard',     1, 'maintenance', 89.00, 2, 1, ARRAY['WiFi','AC','TV']),
  ('201', 'deluxe',       2, 'available',  129.00, 2, 2, ARRAY['WiFi','AC','TV','Minibar','Balcony']),
  ('202', 'deluxe',       2, 'occupied',   129.00, 2, 2, ARRAY['WiFi','AC','TV','Minibar']),
  ('203', 'suite',        2, 'available',  249.00, 3, 2, ARRAY['WiFi','AC','TV','Minibar','Balcony','Jacuzzi']),
  ('204', 'deluxe',       2, 'occupied',   129.00, 2, 2, ARRAY['WiFi','AC','TV','Minibar']),
  ('205', 'suite',        2, 'available',  249.00, 3, 2, ARRAY['WiFi','AC','TV','Minibar','Balcony','Jacuzzi']),
  ('301', 'suite',        3, 'occupied',   249.00, 3, 2, ARRAY['WiFi','AC','TV','Minibar','Jacuzzi','Sea View']),
  ('302', 'suite',        3, 'available',  249.00, 3, 2, ARRAY['WiFi','AC','TV','Minibar','Jacuzzi']),
  ('303', 'presidential', 3, 'available',  499.00, 4, 2, ARRAY['WiFi','AC','TV','Minibar','Jacuzzi','Private Pool','Butler']),
  ('304', 'suite',        3, 'cleaning',   249.00, 3, 2, ARRAY['WiFi','AC','TV','Minibar']),
  ('305', 'presidential', 3, 'occupied',   499.00, 4, 2, ARRAY['WiFi','AC','TV','Minibar','Jacuzzi','Private Pool','Butler']);

-- Sample staff
INSERT INTO staff (full_name, role, email, phone, status, department, hire_date) VALUES
  ('Tann Pisey',      'admin',          'tann@grandpalms.com',     '+855 12 345 678', 'active', 'Management',   '2020-01-01'),
  ('Hong Lim',        'manager',        'honglim@grandpalms.com',  '+855 12 345 679', 'active', 'Management',   '2020-01-01'),
  ('Sophea Chan',     'receptionist',   'sophea@grandpalms.com',   '+855 12 345 680', 'active', 'Front Office', '2021-03-15'),
  ('Dara Meas',       'receptionist',   'dara@grandpalms.com',     '+855 12 345 681', 'active', 'Front Office', '2022-06-01'),
  ('Srey Neang',      'housekeeping',   'srey@grandpalms.com',     '+855 12 345 682', 'active', 'Housekeeping', '2021-09-10'),
  ('Ratha Pich',      'housekeeping',   'ratha@grandpalms.com',    '+855 12 345 683', 'active', 'Housekeeping', '2022-02-14'),
  ('Vuthy Keo',       'maintenance',    'vuthy@grandpalms.com',    '+855 12 345 684', 'active', 'Maintenance',  '2021-11-01'),
  ('Maly Sok',        'accounting',     'maly@grandpalms.com',     '+855 12 345 685', 'active', 'Finance',      '2023-01-05');
