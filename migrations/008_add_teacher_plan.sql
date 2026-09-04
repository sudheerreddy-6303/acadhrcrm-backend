-- ============================================================
-- Migration: add a subscription plan to teachers
--   inaugural | starter | premium | prestige   (empty = none chosen)
-- Run ONCE:
--   mysql -u root -p your_database < backend/migrations/008_add_teacher_plan.sql
-- The server also self-heals this column on boot, so on Railway you
-- don't strictly need to run this by hand. Ignore "Duplicate column".
-- ============================================================

ALTER TABLE teachers ADD COLUMN plan VARCHAR(20) NULL;
