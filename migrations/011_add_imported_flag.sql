-- ============================================================
-- Migration: mark records imported by a telecaller so they show
-- to admins only (0 = normal/visible to all, 1 = telecaller-import,
-- hidden from telecaller views).
-- Run ONCE:
--   mysql -u root -p your_database < backend/migrations/011_add_imported_flag.sql
-- The server also self-heals this column on boot. Ignore "Duplicate column".
-- ============================================================

ALTER TABLE teachers ADD COLUMN imported TINYINT NOT NULL DEFAULT 0;
ALTER TABLE tutors   ADD COLUMN imported TINYINT NOT NULL DEFAULT 0;
ALTER TABLE schools  ADD COLUMN imported TINYINT NOT NULL DEFAULT 0;
