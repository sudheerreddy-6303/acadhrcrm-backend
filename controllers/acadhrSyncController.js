// Fetch tutors from the AcadHr platform database that lives on the SAME MySQL
// server as the CRM (schemas `acadhr` and `acadhr_crm` side by side). Because
// it's one server, we reuse the CRM's own connection pool and simply read from
// the other schema with `sourceDb`.`tutors`. Read-only against AcadHr.
//
// The frontend takes the normalized rows returned here and runs them through
// the CRM's existing /leads/import (type=tutors) flow, so imported tutors show
// up in the Tutors list as UNREGISTERED (the registration place) — reusing the
// proven dedup + directory-insert logic. Admin-only (enforced in the route).
//
//   GET  /api/acadhr-sync/status          -> is the acadhr.tutors table reachable
//   GET  /api/acadhr-sync/tutors/preview  -> a few normalized sample rows
//   POST /api/acadhr-sync/tutors/fetch    -> all normalized tutor rows

const crmDb = require('../config/db');
const { getAcadhrPool, isExternalConfigured } = require('../config/acadhrDb');

// Which schema on this server holds the AcadHr data (same-server mode).
const SOURCE_DB = process.env.ACADHR_SOURCE_DB || 'acadhr';
const SOURCE_TABLE = 'tutors';
const MAX_ROWS = 5000;

// Choose where to read AcadHr data from:
//  - If ACADHR_DB_* env vars are set, connect to that EXTERNAL AcadHr server.
//  - Otherwise, use the CRM's own connection and read the `acadhr` schema
//    on the same server.
// Either way, queries qualify the table as `<schema>`.`<table>`.
function source() {
  if (isExternalConfigured()) {
    return { conn: getAcadhrPool(), schema: process.env.ACADHR_DB_NAME || 'acadhr', external: true };
  }
  return { conn: crmDb, schema: SOURCE_DB, external: false };
}


// Map whatever columns AcadHr uses onto the canonical keys the CRM import knows.
// Matching is on lowercased, alphanumeric-only column names.
const FIELD_ALIASES = {
  name: ['name', 'fullname', 'full_name', 'tutorname', 'tutor_name', 'firstname', 'personname'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact', 'contactnumber', 'whatsapp', 'primaryphone', 'phone1'],
  email: ['email', 'emailid', 'emailaddress', 'mail', 'mailid', 'gmail'],
  city: ['city', 'town', 'cityname'],
  state: ['state', 'region', 'statename'],
  subjects: ['subjects', 'subject', 'subjectexpertise', 'expertise', 'skills', 'specialization', 'specialisation', 'tutorcourses'],
  boards: ['boards', 'board', 'boardname'],
  classes: ['classes', 'class', 'classestaught', 'grades', 'grade', 'standard', 'classrange'],
  qualification: ['qualification', 'qualifications', 'education', 'degree'],
  experience: ['experience', 'exp', 'yearsexperience', 'experienceyears', 'totalexperience'],
  timing: ['timing', 'availability', 'availabletime', 'availabletiming', 'slots', 'timeslots'],
};

const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

function normalizeRow(row) {
  const m = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (Buffer.isBuffer(v)) continue; // skip blobs (photos etc.)
    m[normKey(k)] = v;
  }
  const pick = (aliases) => {
    for (const a of aliases) {
      if (m[a] != null && String(m[a]).trim() !== '') return String(m[a]).trim();
    }
    return '';
  };
  const out = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const val = pick(aliases);
    if (val) out[field] = val;
  }
  if (!out.name) {
    const composed = `${m.firstname || ''} ${m.lastname || ''}`.trim();
    if (composed) out.name = composed;
  }
  return out;
}

// Confirm the source schema + tutors table actually exist.
async function tutorsTableExists() {
  const { conn, schema } = source();
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables
       WHERE table_schema = ? AND table_name = ?`,
    [schema, SOURCE_TABLE]
  );
  return Number(rows[0].n) > 0;
}

async function tableExists(table) {
  const { conn, schema } = source();
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables
       WHERE table_schema = ? AND table_name = ?`,
    [schema, table]
  );
  return Number(rows[0].n) > 0;
}

// Actual column names of a table in the source schema.
async function columnsOf(table) {
  const { conn, schema } = source();
  const [rows] = await conn.query(
    `SELECT column_name AS c FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?`,
    [schema, table]
  );
  return rows.map((r) => r.c || r.column_name || r.COLUMN_NAME).filter(Boolean);
}

// Pick the real column whose normalized name matches one of the candidates.
function pickColumn(cols, candidates) {
  const map = {};
  for (const c of cols) map[normKey(c)] = c;
  for (const cand of candidates) if (map[cand]) return map[cand];
  return null;
}

// Load tutors, and — because the tutor's name/phone/email live in `users` —
// enrich each tutor row with its matching user row (joined on the tutor's
// user-id column). Auto-detects the link column and the users id column so it
// works whatever they're named. Falls back to tutors-only if there's no users
// table. Returns an array of { tutor, user } pairs.
async function loadTutorRows(limit) {
  const { conn, schema } = source();
  const [tutorRows] = await conn.query(
    `SELECT * FROM \`${schema}\`.\`${SOURCE_TABLE}\` LIMIT ${Number(limit) || MAX_ROWS}`
  );

  const tutorCols = await columnsOf(SOURCE_TABLE);
  const linkCol = pickColumn(tutorCols, ['userid', 'user', 'tutoruserid', 'uid', 'usersid']);

  // No link column or no users table -> return tutors as-is.
  if (!linkCol || !(await tableExists('users'))) {
    return tutorRows.map((t) => ({ tutor: t, user: null }));
  }

  const userCols = await columnsOf('users');
  const idCol = pickColumn(userCols, ['id', 'userid', 'uid']) || 'id';

  const ids = [...new Set(tutorRows.map((t) => t[linkCol]).filter((v) => v != null))];
  const usersById = {};
  if (ids.length) {
    const [urows] = await conn.query(
      `SELECT * FROM \`${schema}\`.\`users\` WHERE \`${idCol}\` IN (?)`,
      [ids]
    );
    for (const u of urows) usersById[u[idCol]] = u;
  }
  return tutorRows.map((t) => ({ tutor: t, user: usersById[t[linkCol]] || null }));
}

// Merge a tutor+user pair into one canonical CRM row: contact fields
// (name/phone/email/city/state) come from `users`; professional fields
// (subjects/qualification/experience/boards/classes) from `tutors`.
function combineRow({ tutor, user }) {
  const tNorm = normalizeRow(tutor);
  const uNorm = user ? normalizeRow(user) : {};
  return { ...tNorm, ...uNorm }; // user contact overrides where both have a value
}

// GET /api/acadhr-sync/status
exports.status = async (req, res) => {
  try {
    const exists = await tutorsTableExists();
    if (!exists) {
      return res.json({
        reachable: false,
        sourceDb: source().schema,
        external: source().external,
        message: `Table \`${source().schema}\`.\`${SOURCE_TABLE}\` was not found. ${source().external ? 'Check the ACADHR_DB_* connection settings.' : 'The AcadHr data may be on a different server — set ACADHR_DB_HOST/PORT/USER/PASSWORD/NAME in the backend environment to point at it. Or set ACADHR_SOURCE_DB if the schema name differs.'}`,
      });
    }
    const { conn, schema, external } = source();
    const [c] = await conn.query(`SELECT COUNT(*) AS n FROM \`${schema}\`.\`${SOURCE_TABLE}\``);
    return res.json({ reachable: true, sourceDb: schema, external, table: SOURCE_TABLE, tutorCount: Number(c[0].n) || 0 });
  } catch (err) {
    console.error('[acadhrSync.status]', err);
    return res.status(502).json({ reachable: false, sourceDb: source().schema, message: `Could not read AcadHr tutors: ${err.message}` });
  }
};

// GET /api/acadhr-sync/tutors/preview?limit=5
exports.previewTutors = async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 25);
  try {
    if (!(await tutorsTableExists())) return res.status(400).json({ message: `Table \`${source().schema}\`.\`${SOURCE_TABLE}\` not found.` });
    const pairs = await loadTutorRows(limit);
    const tutorColumns = pairs.length ? Object.keys(pairs[0].tutor) : [];
    const userColumns = pairs.find((p) => p.user) ? Object.keys(pairs.find((p) => p.user).user) : [];
    const sample = pairs.map(combineRow);
    const detected = {};
    for (const nr of sample) for (const k of Object.keys(nr)) detected[k] = true;
    return res.json({
      sourceDb: source().schema,
      columns: tutorColumns,
      userColumns,
      joinedWithUsers: userColumns.length > 0,
      detectedFields: Object.keys(detected),
      sample,
    });
  } catch (err) {
    console.error('[acadhrSync.previewTutors]', err);
    return res.status(502).json({ message: `Could not preview tutors: ${err.message}` });
  }
};

// POST /api/acadhr-sync/tutors/fetch  -> normalized rows for the import flow
exports.fetchTutors = async (req, res) => {
  try {
    if (!(await tutorsTableExists())) return res.status(400).json({ message: `Table \`${source().schema}\`.\`${SOURCE_TABLE}\` not found.` });
    const pairs = await loadTutorRows(MAX_ROWS);
    const normalized = pairs
      .map(combineRow)
      .filter((r) => r.name || r.phone || r.email);
    return res.json({
      sourceDb: source().schema,
      total: pairs.length,
      usable: normalized.length,
      capped: pairs.length >= MAX_ROWS,
      rows: normalized,
    });
  } catch (err) {
    console.error('[acadhrSync.fetchTutors]', err);
    return res.status(502).json({ message: `Could not fetch tutors: ${err.message}` });
  }
};
