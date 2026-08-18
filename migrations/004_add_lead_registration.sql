-- ============================================================
-- Migration: add a registration flag to leads
-- Run ONCE against your CRM database:
--   mysql -u root -p your_database < backend/migrations/004_add_lead_registration.sql
--
-- ADD COLUMN only — nothing is dropped or changed.
-- Every lead defaults to 'unregistered', so all leads you add
-- (manual "New lead" or bulk Import) are unregistered automatically.
-- Ignore a "Duplicate column" error if you re-run it.
-- ============================================================

ALTER TABLE leads
  ADD COLUMN registration ENUM('registered','unregistered')
    NOT NULL DEFAULT 'unregistered' AFTER status;

-- Optional: index so the dashboard split query stays fast.
ALTER TABLE leads
  ADD INDEX idx_leads_registration (registration);
