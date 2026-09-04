-- ============================================================
-- Migration: add a country field to teachers / tutors / schools
--   Defaults every existing and new record to 'India'.
-- Run ONCE:
--   mysql -u root -p your_database < backend/migrations/009_add_country.sql
-- The server also self-heals these columns on boot, so on Railway you
-- don't strictly need to run this by hand. Ignore "Duplicate column".
-- ============================================================

ALTER TABLE teachers ADD COLUMN country VARCHAR(60) NOT NULL DEFAULT 'India';
ALTER TABLE tutors   ADD COLUMN country VARCHAR(60) NOT NULL DEFAULT 'India';
ALTER TABLE schools  ADD COLUMN country VARCHAR(60) NOT NULL DEFAULT 'India';
