-- ============================================================
-- Migration: fields for the Tutor / Teacher "Add" forms
-- Run ONCE against your CRM database:
--   mysql -u root -p your_database < backend/migrations/001_add_tutor_teacher_fields.sql
--
-- These are ADD COLUMN statements only — nothing is dropped or changed.
-- (MySQL has no "ADD COLUMN IF NOT EXISTS"; if a column already exists
--  the line errors harmlessly — just ignore "Duplicate column" on re-runs.)
-- ============================================================

-- ---- Tutors ----
ALTER TABLE tutors
  ADD COLUMN state        VARCHAR(120) NULL AFTER city,
  ADD COLUMN boards       VARCHAR(255) NULL,   -- up to 3, comma-separated
  ADD COLUMN classes      VARCHAR(255) NULL,   -- up to 3, comma-separated
  ADD COLUMN timing       VARCHAR(255) NULL,   -- multiple, comma-separated
  ADD COLUMN registration ENUM('registered','unregistered') NOT NULL DEFAULT 'registered';

-- ---- Teachers ----
ALTER TABLE teachers
  ADD COLUMN state                VARCHAR(120) NULL AFTER city,
  ADD COLUMN boards               VARCHAR(255) NULL,   -- up to 3, comma-separated
  ADD COLUMN classes              VARCHAR(255) NULL,   -- up to 3, comma-separated
  ADD COLUMN experience           VARCHAR(60)  NULL,   -- dropdown value
  ADD COLUMN registration         ENUM('registered','unregistered') NOT NULL DEFAULT 'registered',
  ADD COLUMN note                 TEXT         NULL,
  ADD COLUMN previous_institution VARCHAR(255) NULL;   -- previous school / college
