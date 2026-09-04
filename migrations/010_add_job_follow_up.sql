-- ============================================================
-- Migration: add a Job follow-up store to teachers / tutors / schools
--   Holds a JSON object: { demo, interview, hired, description }
--   (demo/interview/hired are 'yes' | 'no' | '')
-- Run ONCE:
--   mysql -u root -p your_database < backend/migrations/010_add_job_follow_up.sql
-- The server also self-heals this column on boot. Ignore "Duplicate column".
-- ============================================================

ALTER TABLE teachers ADD COLUMN job_follow_up TEXT NULL;
ALTER TABLE tutors   ADD COLUMN job_follow_up TEXT NULL;
ALTER TABLE schools  ADD COLUMN job_follow_up TEXT NULL;
