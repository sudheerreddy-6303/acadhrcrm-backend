-- ============================================================
-- AcadHr CRM — MySQL schema
-- Run once against a fresh database:
--   mysql -u root -p acadhr_crm < schema.sql
-- ============================================================

-- ------------------------------------------------------------
-- CRM users (the people who log in: admins and telecallers)
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
-- Leads (parents / schools looking for tutors, enquiries, etc.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(160)  NOT NULL,
  phone        VARCHAR(20)   NOT NULL,
  email        VARCHAR(160)  NULL,
  city         VARCHAR(120)  NULL,
  source       VARCHAR(80)   NULL,          -- website, referral, walk-in, ad, ...
  requirement  VARCHAR(255)  NULL,          -- what they need (subject/class)
  status       ENUM('new','contacted','follow_up','converted','lost')
                             NOT NULL DEFAULT 'new',
  registration ENUM('registered','unregistered')
                             NOT NULL DEFAULT 'unregistered',  -- added leads are unregistered
  notes        TEXT          NULL,
  assigned_to  INT           NULL,          -- FK -> users.id (telecaller/admin)
  created_by   INT           NULL,          -- FK -> users.id
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_leads_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_creator  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_leads_status      (status),
  INDEX idx_leads_assigned    (assigned_to),
  INDEX idx_leads_created_at  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Lead activities (call logs, notes, follow-ups)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_activities (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  lead_id        INT           NOT NULL,
  user_id        INT           NULL,        -- who logged it
  activity_type  ENUM('call','note','status_change','follow_up')
                               NOT NULL DEFAULT 'note',
  notes          TEXT          NULL,
  follow_up_date DATETIME      NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_act_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_act_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_act_lead (lead_id),
  INDEX idx_act_followup (follow_up_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Tutors (mirror of platform tutors — view-only inside the CRM)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tutors (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(160)  NOT NULL,
  phone         VARCHAR(20)   NULL,
  email         VARCHAR(160)  NULL,
  subjects      VARCHAR(255)  NULL,
  qualification VARCHAR(255)  NULL,
  city          VARCHAR(120)  NULL,
  status        ENUM('active','pending','inactive') NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tutors_status (status),
  INDEX idx_tutors_city   (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- NOTE: No admin is seeded here — you already have a populated `users`
-- table (admin@example.com, telecaller@example.com, etc.). The
-- CREATE TABLE IF NOT EXISTS above is skipped when the table exists,
-- so your rows are left untouched. Just log in with your credentials.
--
-- If you ever need a fresh admin on a new database, run:  npm run seed
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Teachers (mirror of platform teachers — view-only inside the CRM)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teachers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(160)  NOT NULL,
  phone         VARCHAR(20)   NULL,
  email         VARCHAR(160)  NULL,
  subjects      VARCHAR(255)  NULL,
  qualification VARCHAR(255)  NULL,
  city          VARCHAR(120)  NULL,
  status        ENUM('active','pending','inactive') NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_teachers_status (status),
  INDEX idx_teachers_city   (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Schools (mirror of platform schools — view-only inside the CRM)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schools (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(200)  NOT NULL,
  contact_person VARCHAR(160)  NULL,
  phone          VARCHAR(20)   NULL,
  email          VARCHAR(160)  NULL,
  city           VARCHAR(120)  NULL,
  board          VARCHAR(80)   NULL,          -- CBSE, ICSE, State, ...
  status         ENUM('active','pending','inactive') NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_schools_status (status),
  INDEX idx_schools_city   (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
