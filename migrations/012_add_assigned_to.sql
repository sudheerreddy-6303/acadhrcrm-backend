-- ============================================================
-- Migration: allow admins to assign teacher/tutor/school records to a
-- telecaller. A telecaller then sees records assigned to them (in addition
-- to normal non-imported records).
-- Run ONCE:
--   mysql -u root -p your_database < backend/migrations/012_add_assigned_to.sql
-- The server also self-heals this column on boot. Ignore "Duplicate column".
-- ============================================================

ALTER TABLE teachers ADD COLUMN assigned_to INT NULL;
ALTER TABLE tutors   ADD COLUMN assigned_to INT NULL;
ALTER TABLE schools  ADD COLUMN assigned_to INT NULL;
