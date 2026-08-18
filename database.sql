-- ============================================================
-- AcadHr CRM — COMPLETE MySQL schema (all queries, final columns)
-- Fresh install:
--   mysql -u root -p your_database < database.sql
--
-- This is the schema + both migrations already merged. Use this ONE
-- file for a new database. If your tables already exist from the earlier
-- version, run the ALTER statements at the bottom instead (Option B).
-- ============================================================

-- ------------------------------------------------------------
-- CRM users (admins + telecallers who log in)
-- Skipped automatically if you already have this table with your accounts.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(160)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('admin','telecaller') NOT NULL DEFAULT 'telecaller',
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Leads
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(160)  NOT NULL,
  phone        VARCHAR(20)   NOT NULL,
  email        VARCHAR(160)  NULL,
  city         VARCHAR(120)  NULL,
  source       VARCHAR(80)   NULL,
  requirement  VARCHAR(255)  NULL,
  status       ENUM('new','contacted','follow_up','converted','lost') NOT NULL DEFAULT 'new',
  registration ENUM('registered','unregistered') NOT NULL DEFAULT 'unregistered',  -- added leads are unregistered
  notes        TEXT          NULL,
  assigned_to  INT           NULL,
  created_by   INT           NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_leads_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_creator  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_leads_status     (status),
  INDEX idx_leads_assigned   (assigned_to),
  INDEX idx_leads_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Lead activities (calls / notes / follow-ups)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_activities (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  lead_id        INT           NOT NULL,
  user_id        INT           NULL,
  activity_type  ENUM('call','note','status_change','follow_up') NOT NULL DEFAULT 'note',
  notes          TEXT          NULL,
  follow_up_date DATETIME      NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_act_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_act_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_act_lead     (lead_id),
  INDEX idx_act_followup (follow_up_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Tutors (includes Add-form fields)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tutors (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(160)  NOT NULL,
  phone         VARCHAR(20)   NULL,
  email         VARCHAR(160)  NULL,            -- gmail id
  subjects      VARCHAR(255)  NULL,            -- up to 3, comma-separated
  qualification VARCHAR(255)  NULL,
  city          VARCHAR(120)  NULL,
  state         VARCHAR(120)  NULL,
  boards        VARCHAR(255)  NULL,            -- up to 3, comma-separated
  classes       VARCHAR(255)  NULL,            -- up to 3, comma-separated
  timing        VARCHAR(255)  NULL,            -- multiple, comma-separated
  registration  ENUM('registered','unregistered') NOT NULL DEFAULT 'registered',
  status        ENUM('active','pending','inactive') NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tutors_status (status),
  INDEX idx_tutors_city   (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Teachers (includes Add-form fields)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teachers (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(160)  NOT NULL,
  phone                VARCHAR(20)   NULL,
  email                VARCHAR(160)  NULL,     -- gmail id
  subjects             VARCHAR(255)  NULL,     -- up to 3, comma-separated
  qualification        VARCHAR(255)  NULL,
  city                 VARCHAR(120)  NULL,
  state                VARCHAR(120)  NULL,
  boards               VARCHAR(255)  NULL,     -- up to 3, comma-separated
  classes              VARCHAR(255)  NULL,     -- up to 3, comma-separated
  experience           VARCHAR(60)   NULL,     -- dropdown value
  registration         ENUM('registered','unregistered') NOT NULL DEFAULT 'registered',
  note                 TEXT          NULL,
  previous_institution VARCHAR(255)  NULL,     -- previous school / college
  status               ENUM('active','pending','inactive') NOT NULL DEFAULT 'pending',
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_teachers_status (status),
  INDEX idx_teachers_city   (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Schools (includes Add-form fields)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schools (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(200)  NOT NULL,
  location       VARCHAR(255)  NULL,
  contact_person VARCHAR(160)  NULL,
  phone          VARCHAR(20)   NULL,
  email          VARCHAR(160)  NULL,           -- contact mail id
  designation    VARCHAR(160)  NULL,
  school_email   VARCHAR(160)  NULL,           -- school mail id
  school_number  VARCHAR(60)   NULL,           -- scl number
  contact_person2 VARCHAR(160) NULL,           -- optional 2nd contact
  phone2         VARCHAR(60)   NULL,
  email2         VARCHAR(160)  NULL,
  designation2   VARCHAR(160)  NULL,
  city           VARCHAR(120)  NULL,
  state          VARCHAR(120)  NULL,
  board          VARCHAR(80)   NULL,
  registration   ENUM('registered','unregistered') NOT NULL DEFAULT 'registered',
  note           TEXT          NULL,
  status         ENUM('active','pending','inactive') NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_schools_status (status),
  INDEX idx_schools_city   (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- Option B — tables ALREADY exist from the earlier version?
-- Do NOT run the CREATE statements above (they'd be skipped anyway).
-- Instead run only these ALTERs to add the newer columns.
-- Ignore "Duplicate column" errors if a column already exists.
-- ============================================================
--
-- ALTER TABLE tutors
--   ADD COLUMN state        VARCHAR(120) NULL AFTER city,
--   ADD COLUMN boards       VARCHAR(255) NULL,
--   ADD COLUMN classes      VARCHAR(255) NULL,
--   ADD COLUMN timing       VARCHAR(255) NULL,
--   ADD COLUMN registration ENUM('registered','unregistered') NOT NULL DEFAULT 'registered';
--
-- ALTER TABLE teachers
--   ADD COLUMN state                VARCHAR(120) NULL AFTER city,
--   ADD COLUMN boards               VARCHAR(255) NULL,
--   ADD COLUMN classes              VARCHAR(255) NULL,
--   ADD COLUMN experience           VARCHAR(60)  NULL,
--   ADD COLUMN registration         ENUM('registered','unregistered') NOT NULL DEFAULT 'registered',
--   ADD COLUMN note                 TEXT         NULL,
--   ADD COLUMN previous_institution VARCHAR(255) NULL;
--
-- ALTER TABLE schools
--   ADD COLUMN location      VARCHAR(255) NULL AFTER name,
--   ADD COLUMN state         VARCHAR(120) NULL AFTER city,
--   ADD COLUMN designation   VARCHAR(160) NULL,
--   ADD COLUMN school_email  VARCHAR(160) NULL,
--   ADD COLUMN school_number VARCHAR(60)  NULL,
--   ADD COLUMN registration  ENUM('registered','unregistered') NOT NULL DEFAULT 'registered',
--   ADD COLUMN note          TEXT         NULL;
