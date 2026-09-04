-- ============================================================
-- Migration: add a follow-ups store to teachers / tutors / schools
-- Run ONCE against your CRM database:
--   mysql -u root -p your_database < backend/migrations/005_add_follow_ups.sql
--
-- ADD COLUMN only — nothing is dropped or changed.
-- follow_ups holds a JSON string: an array of up to 3 entries, each
--   { "date": "YYYY-MM-DD", "remarks": "...", "status": "hot|cold|dead" }
-- Ignore a "Duplicate column" error if you re-run it.
--
-- NOTE: the server also self-heals this column on boot, so on hosts
-- like Railway you don't strictly need to run this by hand.
-- ============================================================

ALTER TABLE teachers ADD COLUMN follow_ups TEXT NULL;
ALTER TABLE tutors   ADD COLUMN follow_ups TEXT NULL;
ALTER TABLE schools  ADD COLUMN follow_ups TEXT NULL;
