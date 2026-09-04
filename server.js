const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ---- CORS: allow the configured frontend origin(s) ----
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());
app.use(cors({ origin: origins, credentials: true }));

app.use(express.json());

// ---- Health check ----
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- Routes ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/tutors', require('./routes/tutors'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/schools', require('./routes/schools'));
app.use('/api/users', require('./routes/users'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/acadhr-sync', require('./routes/acadhrSync'));

// ---- 404 + error fallbacks ----
app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ message: 'Server error' });
});

const PORT = process.env.PORT || 5000;

// Self-heal: make sure EVERY column the import + controllers rely on exists on
// the record tables. This mirrors migrations 001-012 so the app works even on a
// database where those migration files were never run (or where the tables were
// created by an older schema.sql). Idempotent — a duplicate-column error just
// means it's already there.
//
// Why this matters: the Excel import writes teacher/tutor/school rows into these
// directory tables. If a single column is missing, the whole INSERT fails, the
// import silently lands rows in `leads` only, the directory pages stay empty, and
// there is then nothing to assign to a telecaller. Keeping this list complete is
// what makes "import -> assign -> telecaller sees it" work end to end.
async function ensureColumns() {
  const db = require('./config/db');

  // table -> { column: "SQL type/definition" }. Order within a table is applied
  // as listed; missing columns are added, existing ones are left untouched.
  const REG = "ENUM('registered','unregistered') NOT NULL DEFAULT 'registered'";
  const schema = {
    tutors: {
      qualification: 'VARCHAR(255) NULL',
      state: 'VARCHAR(120) NULL',
      boards: 'VARCHAR(255) NULL',
      classes: 'VARCHAR(255) NULL',
      timing: 'VARCHAR(255) NULL',
      registration: REG,
      follow_ups: 'TEXT NULL',
      job_follow_up: 'TEXT NULL',
      plan: 'VARCHAR(20) NULL',
      country: "VARCHAR(60) NOT NULL DEFAULT 'India'",
      imported: 'TINYINT NOT NULL DEFAULT 0',
      assigned_to: 'INT NULL',
    },
    teachers: {
      qualification: 'VARCHAR(255) NULL',
      state: 'VARCHAR(120) NULL',
      boards: 'VARCHAR(255) NULL',
      classes: 'VARCHAR(255) NULL',
      experience: 'VARCHAR(60) NULL',
      previous_institution: 'VARCHAR(255) NULL',
      note: 'TEXT NULL',
      registration: REG,
      follow_ups: 'TEXT NULL',
      job_follow_up: 'TEXT NULL',
      plan: 'VARCHAR(20) NULL',
      country: "VARCHAR(60) NOT NULL DEFAULT 'India'",
      imported: 'TINYINT NOT NULL DEFAULT 0',
      assigned_to: 'INT NULL',
    },
    schools: {
      location: 'VARCHAR(255) NULL',
      state: 'VARCHAR(120) NULL',
      designation: 'VARCHAR(160) NULL',
      school_email: 'VARCHAR(160) NULL',
      school_number: 'VARCHAR(60) NULL',
      contact_person2: 'VARCHAR(160) NULL',
      phone2: 'VARCHAR(60) NULL',
      email2: 'VARCHAR(160) NULL',
      designation2: 'VARCHAR(160) NULL',
      note: 'TEXT NULL',
      registration: REG,
      follow_ups: 'TEXT NULL',
      job_follow_up: 'TEXT NULL',
      plan: 'VARCHAR(20) NULL',
      country: "VARCHAR(60) NOT NULL DEFAULT 'India'",
      imported: 'TINYINT NOT NULL DEFAULT 0',
      assigned_to: 'INT NULL',
    },
    // Leads carry their own assignment; guard the columns assignment/import touch
    // in case the leads table predates them.
    leads: {
      registration: "ENUM('registered','unregistered') NOT NULL DEFAULT 'unregistered'",
      assigned_to: 'INT NULL',
    },
  };

  let added = 0;
  for (const [table, cols] of Object.entries(schema)) {
    for (const [col, def] of Object.entries(cols)) {
      try {
        await db.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        console.log(`[db] added ${table}.${col}`);
        added += 1;
      } catch (err) {
        if (err && err.code === 'ER_DUP_FIELDNAME') continue; // already present — fine
        // ER_NO_SUCH_TABLE etc. — log but keep going so one bad table doesn't stop the rest.
        console.warn(`[db] could not ensure ${table}.${col}:`, err.message);
      }
    }
  }
  console.log(`[db] column self-heal complete (${added} column(s) added).`);

  // Verify the columns the import + assignment depend on, and shout loudly if any
  // are still missing so the cause is visible in the logs instead of a silent skip.
  const required = {
    tutors: ['state', 'boards', 'classes', 'timing', 'registration', 'imported', 'assigned_to'],
    teachers: ['state', 'boards', 'classes', 'experience', 'previous_institution', 'note', 'registration', 'imported', 'assigned_to'],
    schools: ['location', 'state', 'designation', 'school_email', 'school_number', 'registration', 'imported', 'assigned_to'],
    leads: ['assigned_to'],
  };
  for (const [table, cols] of Object.entries(required)) {
    for (const col of cols) {
      try {
        const [r] = await db.query(
          `SELECT COUNT(*) AS n FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
          [table, col]
        );
        if (!r[0] || !r[0].n) {
          console.error(`[db] MISSING column ${table}.${col} — import/assignment will not work for ${table}.`);
        }
      } catch (err) {
        console.warn(`[db] column check failed for ${table}.${col}:`, err.message);
      }
    }
  }
}
// Ensure DB columns exist, then start the server (so early requests don't hit
// a table that's missing a column mid-migration).
ensureColumns()
  .catch((err) => console.warn('[db] column self-heal error:', err.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
  });
