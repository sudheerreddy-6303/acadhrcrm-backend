-- ============================================================
-- Migration: add a subscription plan to tutors
--   inaugural | pro   (empty = none chosen)
-- Run ONCE:
--   mysql -u root -p your_database < backend/migrations/007_add_tutor_plan.sql
-- The server also self-heals this column on boot, so on Railway you
-- don't strictly need to run this by hand. Ignore "Duplicate column".
-- ============================================================

ALTER TABLE tutors ADD COLUMN plan VARCHAR(20) NULL;
