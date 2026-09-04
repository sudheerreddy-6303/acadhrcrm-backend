-- ============================================================
-- Migration: add a subscription plan to schools
--   basic | most_popular | enterprise  (empty = none chosen)
-- Run ONCE:
--   mysql -u root -p your_database < backend/migrations/006_add_school_plan.sql
-- The server also self-heals this column on boot, so on Railway you
-- don't strictly need to run this by hand. Ignore "Duplicate column".
-- ============================================================

ALTER TABLE schools ADD COLUMN plan VARCHAR(20) NULL;
