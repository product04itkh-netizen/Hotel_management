-- ============================================================
-- TEST DATA CLEANUP — Both Branches
-- Backs up then deletes: reservations, billing, journal entries
-- Does NOT touch: fixed_assets, chart_of_accounts, vendors,
--                 bills, staff, houses, rooms, guests, settings,
--                 depreciation_runs, petty_cash_transactions,
--                 accounting_periods, recurring_journal_entries,
--                 payment_methods, bank_reconciliations
--
-- Run in Supabase SQL Editor.
-- Backup tables are prefixed bak_ and stay until you DROP them.
-- ============================================================

DO $$
BEGIN

  -- ── STEP 1: BACKUP ─────────────────────────────────────────
  -- Drop old backups if re-running, then recreate

  DROP TABLE IF EXISTS bak_journal_entry_lines;
  DROP TABLE IF EXISTS bak_journal_entries;
  DROP TABLE IF EXISTS bak_payment_transactions;
  DROP TABLE IF EXISTS bak_checkout_inspections;
  DROP TABLE IF EXISTS bak_check_in_records;
  DROP TABLE IF EXISTS bak_deposit_receipts;
  DROP TABLE IF EXISTS bak_reservation_line_items;
  DROP TABLE IF EXISTS bak_housekeeping_tasks;
  DROP TABLE IF EXISTS bak_invoices;
  DROP TABLE IF EXISTS bak_reservations;

  CREATE TABLE bak_journal_entry_lines    AS SELECT * FROM journal_entry_lines;
  CREATE TABLE bak_journal_entries        AS SELECT * FROM journal_entries;
  CREATE TABLE bak_payment_transactions   AS SELECT * FROM payment_transactions;
  CREATE TABLE bak_checkout_inspections   AS SELECT * FROM checkout_inspections;
  CREATE TABLE bak_check_in_records       AS SELECT * FROM check_in_records;
  CREATE TABLE bak_deposit_receipts       AS SELECT * FROM deposit_receipts;
  CREATE TABLE bak_reservation_line_items AS SELECT * FROM reservation_line_items;
  CREATE TABLE bak_housekeeping_tasks     AS SELECT * FROM housekeeping_tasks;
  CREATE TABLE bak_invoices               AS SELECT * FROM invoices;
  CREATE TABLE bak_reservations           AS SELECT * FROM reservations;

  RAISE NOTICE 'Backup complete.';
  RAISE NOTICE '  bak_journal_entries:        % rows', (SELECT COUNT(*) FROM bak_journal_entries);
  RAISE NOTICE '  bak_journal_entry_lines:    % rows', (SELECT COUNT(*) FROM bak_journal_entry_lines);
  RAISE NOTICE '  bak_invoices:               % rows', (SELECT COUNT(*) FROM bak_invoices);
  RAISE NOTICE '  bak_payment_transactions:   % rows', (SELECT COUNT(*) FROM bak_payment_transactions);
  RAISE NOTICE '  bak_reservations:           % rows', (SELECT COUNT(*) FROM bak_reservations);
  RAISE NOTICE '  bak_reservation_line_items: % rows', (SELECT COUNT(*) FROM bak_reservation_line_items);
  RAISE NOTICE '  bak_check_in_records:       % rows', (SELECT COUNT(*) FROM bak_check_in_records);
  RAISE NOTICE '  bak_checkout_inspections:   % rows', (SELECT COUNT(*) FROM bak_checkout_inspections);
  RAISE NOTICE '  bak_deposit_receipts:       % rows', (SELECT COUNT(*) FROM bak_deposit_receipts);
  RAISE NOTICE '  bak_housekeeping_tasks:     % rows', (SELECT COUNT(*) FROM bak_housekeeping_tasks);

  -- ── STEP 2: CLEAR SELF-REFERENCE IN JOURNAL ENTRIES ────────
  -- void_entry_id is a self-FK; null it before deleting rows
  UPDATE journal_entries SET void_entry_id = NULL WHERE void_entry_id IS NOT NULL;

  -- ── STEP 3: DELETE IN DEPENDENCY ORDER ─────────────────────

  -- Journal entry lines cascade from journal_entries but be explicit
  DELETE FROM journal_entry_lines;
  -- journal_entry_id on petty_cash, bills, bill_payments, depreciation_runs
  -- all have ON DELETE SET NULL — they are auto-nulled by Postgres on delete
  DELETE FROM journal_entries;

  -- Billing
  DELETE FROM payment_transactions;
  DELETE FROM invoices;

  -- Reservation children
  DELETE FROM checkout_inspections;
  DELETE FROM check_in_records;
  DELETE FROM deposit_receipts;
  DELETE FROM reservation_line_items;
  DELETE FROM housekeeping_tasks;

  -- Reservations (parent — deletes last)
  DELETE FROM reservations;

  RAISE NOTICE 'Cleanup complete. Clean slate ready for testing.';
  RAISE NOTICE 'To restore: INSERT INTO <table> SELECT * FROM bak_<table>;';
  RAISE NOTICE 'To drop backups: DROP TABLE bak_reservations, bak_invoices, ... (when no longer needed)';

END $$;
