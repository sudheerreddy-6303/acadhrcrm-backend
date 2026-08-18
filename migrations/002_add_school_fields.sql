-- ============================================================
-- Migration: fields for the School "Add" form
-- Run ONCE against your CRM database:
--   mysql -u root -p your_database < backend/migrations/002_add_school_fields.sql
--
-- ADD COLUMN statements only — nothing is dropped or changed.
-- Ignore "Duplicate column" errors if you re-run it.
-- ============================================================

ALTER TABLE schools
  ADD COLUMN location      VARCHAR(255) NULL AFTER name,
  ADD COLUMN state         VARCHAR(120) NULL AFTER city,
  ADD COLUMN designation   VARCHAR(160) NULL,   -- contact person's designation
  ADD COLUMN school_email  VARCHAR(160) NULL,   -- school mail id
  ADD COLUMN school_number VARCHAR(60)  NULL,   -- scl number
  ADD COLUMN registration  ENUM('registered','unregistered') NOT NULL DEFAULT 'registered',
  ADD COLUMN note          TEXT         NULL;
