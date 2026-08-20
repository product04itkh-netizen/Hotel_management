-- ============================================================
-- Migration 045: Audit trail — who did what, when
-- Every write across reservations, invoices, journal entries, fixed
-- assets, bills, deposits, petty cash, chart of accounts, and staff
-- records was previously silent (journal_entries.created_by existed but
-- was never populated). This adds a generic, tamper-resistant audit log
-- fed by a single reusable trigger function attached to the highest-risk
-- tables. Child/line tables (journal_entry_lines, reservation_line_items)
-- are deliberately NOT triggered — they insert alongside their parent in
-- the same action and would just produce noisy N+1 rows with no
-- independent who/why; their detail already lives inside the parent's
-- logged new_data JSON.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT NOT NULL,
  record_id    UUID,
  action       TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data     JSONB,
  new_data     JSONB,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_id    UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at   ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch       ON audit_logs(branch_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit_logs" ON audit_logs;
CREATE POLICY "Admins can view audit_logs" ON audit_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM staff WHERE staff.auth_user_id = auth.uid() AND staff.role = 'admin'));

-- Client-side inserts are blocked outright — only the SECURITY DEFINER
-- trigger function below (running as the migration owner) can write here,
-- which keeps the log tamper-resistant from the anon/authenticated keys.
DROP POLICY IF EXISTS "No direct client writes to audit_logs" ON audit_logs;
CREATE POLICY "No direct client writes to audit_logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (false);

CREATE OR REPLACE FUNCTION log_audit_event() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL; v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, branch_id)
  VALUES (
    TG_TABLE_NAME,
    COALESCE((v_new->>'id')::uuid, (v_old->>'id')::uuid),
    TG_OP, v_old, v_new, auth.uid(),
    COALESCE((v_new->>'branch_id')::uuid, (v_old->>'branch_id')::uuid)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── Attach to v1 priority tables ──────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'journal_entries', 'invoices', 'reservations', 'fixed_assets',
    'bills', 'bill_payments', 'deposit_receipts', 'petty_cash_transactions',
    'payment_transactions', 'chart_of_accounts', 'accounting_periods',
    'staff', 'depreciation_runs', 'depreciation_entries'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_trg ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION log_audit_event()', t
    );
  END LOOP;
END $$;
