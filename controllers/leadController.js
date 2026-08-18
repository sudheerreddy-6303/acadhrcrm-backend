const db = require('../config/db');

const isAdmin = (req) => req.user.role === 'admin';

// GET /api/leads?status=&search=
// Admins see all leads; telecallers see only leads assigned to them.
exports.list = async (req, res) => {
  try {
    const { status, search, subject } = req.query;
    const where = [];
    const params = [];

    if (!isAdmin(req)) {
      where.push('l.assigned_to = ?');
      params.push(req.user.id);
    }
    if (status) {
      where.push('l.status = ?');
      params.push(status);
    }
    if (subject) {
      // exact whole-item match within the comma-separated requirement list
      // (leads store their subject/course/designation in `requirement`)
      where.push("FIND_IN_SET(?, REPLACE(l.requirement, ', ', ',')) > 0");
      params.push(subject);
    }
    if (search) {
      where.push('(l.name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await db.query(
      `SELECT l.*, u.name AS assigned_name
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_to
         ${clause}
         ORDER BY l.updated_at DESC
         LIMIT 500`,
      params
    );
    return res.json({ leads: rows });
  } catch (err) {
    console.error('[leads.list]', err);
    return res.status(500).json({ message: 'Could not load leads' });
  }
};

// GET /api/leads/:id  (with activity trail)
exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT l.*, u.name AS assigned_name
         FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
         WHERE l.id = ? LIMIT 1`,
      [req.params.id]
    );
    const lead = rows[0];
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    // Telecallers can only open leads assigned to them.
    if (!isAdmin(req) && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ message: 'This lead is not assigned to you' });
    }

    const [activities] = await db.query(
      `SELECT a.*, u.name AS user_name
         FROM lead_activities a LEFT JOIN users u ON u.id = a.user_id
         WHERE a.lead_id = ? ORDER BY a.created_at DESC`,
      [req.params.id]
    );
    return res.json({ lead, activities });
  } catch (err) {
    console.error('[leads.getOne]', err);
    return res.status(500).json({ message: 'Could not load lead' });
  }
};

// POST /api/leads
exports.create = async (req, res) => {
  try {
    const { name, phone, email, city, source, requirement, status, notes, assigned_to, registration } = req.body || {};
    if (!name || !phone) {
      return res.status(400).json({ message: 'Name and phone are required' });
    }
    // A telecaller creating a lead auto-assigns it to themselves.
    const assignee = isAdmin(req) ? (assigned_to || null) : req.user.id;
    const reg = registration === 'registered' ? 'registered' : 'unregistered';

    let result;
    try {
      [result] = await db.query(
        `INSERT INTO leads (name, phone, email, city, source, requirement, status, registration, notes, assigned_to, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, phone, email || null, city || null, source || null, requirement || null,
         status || 'new', reg, notes || null, assignee, req.user.id]
      );
    } catch (colErr) {
      // registration column not present yet (migration 004 not run) — insert without it.
      [result] = await db.query(
        `INSERT INTO leads (name, phone, email, city, source, requirement, status, notes, assigned_to, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, phone, email || null, city || null, source || null, requirement || null,
         status || 'new', notes || null, assignee, req.user.id]
      );
    }
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('[leads.create]', err);
    return res.status(500).json({ message: 'Could not create lead' });
  }
};

// PUT /api/leads/:id
exports.update = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT assigned_to FROM leads WHERE id = ? LIMIT 1', [req.params.id]);
    const lead = rows[0];
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (!isAdmin(req) && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ message: 'This lead is not assigned to you' });
    }

    const { name, phone, email, city, source, requirement, status, notes, registration } = req.body || {};
    // Reassignment is admin-only, so telecallers can't change assigned_to here.
    const assigned_to = isAdmin(req) && 'assigned_to' in req.body ? req.body.assigned_to : lead.assigned_to;
    const reg = registration === 'registered' ? 'registered' : 'unregistered';

    try {
      await db.query(
        `UPDATE leads SET name=?, phone=?, email=?, city=?, source=?, requirement=?, status=?, registration=?, notes=?, assigned_to=?
           WHERE id=?`,
        [name, phone, email || null, city || null, source || null, requirement || null,
         status || 'new', reg, notes || null, assigned_to, req.params.id]
      );
    } catch (colErr) {
      // registration column not present yet (migration 004 not run) — save the rest.
      await db.query(
        `UPDATE leads SET name=?, phone=?, email=?, city=?, source=?, requirement=?, status=?, notes=?, assigned_to=?
           WHERE id=?`,
        [name, phone, email || null, city || null, source || null, requirement || null,
         status || 'new', notes || null, assigned_to, req.params.id]
      );
    }
    return res.json({ message: 'Lead updated' });
  } catch (err) {
    console.error('[leads.update]', err);
    return res.status(500).json({ message: 'Could not update lead' });
  }
};

// PATCH /api/leads/:id/assign  { assigned_to }   (admin only — enforced in route)
exports.assign = async (req, res) => {
  try {
    const { assigned_to } = req.body || {};
    await db.query('UPDATE leads SET assigned_to = ? WHERE id = ?', [assigned_to || null, req.params.id]);
    return res.json({ message: 'Lead reassigned' });
  } catch (err) {
    console.error('[leads.assign]', err);
    return res.status(500).json({ message: 'Could not reassign lead' });
  }
};

// POST /api/leads/:id/activities  { activity_type, notes, follow_up_date }
exports.addActivity = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT assigned_to FROM leads WHERE id = ? LIMIT 1', [req.params.id]);
    const lead = rows[0];
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (!isAdmin(req) && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ message: 'This lead is not assigned to you' });
    }

    const { activity_type, notes, follow_up_date } = req.body || {};
    await db.query(
      `INSERT INTO lead_activities (lead_id, user_id, activity_type, notes, follow_up_date)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, req.user.id, activity_type || 'note', notes || null, follow_up_date || null]
    );
    return res.status(201).json({ message: 'Activity logged' });
  } catch (err) {
    console.error('[leads.addActivity]', err);
    return res.status(500).json({ message: 'Could not log activity' });
  }
};

// DELETE /api/leads/:id  (admin only — enforced in route)
exports.remove = async (req, res) => {
  try {
    await db.query('DELETE FROM leads WHERE id = ?', [req.params.id]);
    return res.json({ message: 'Lead deleted' });
  } catch (err) {
    console.error('[leads.remove]', err);
    return res.status(500).json({ message: 'Could not delete lead' });
  }
};

// POST /api/leads/import   { type, rows: [ {..excel row..}, ... ] }
// Bulk-imports rows (parsed from an Excel/CSV on the client) into leads.
// `type` (teachers | tutors | schools) is stored as the lead source.
exports.importLeads = async (req, res) => {
  try {
    const { type, rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'No rows found in the file' });
    }
    const source = ['teachers', 'tutors', 'schools'].includes(type) ? type : (type || 'import');

    // normalize a row's headers -> lowercase alphanumeric keys
    const norm = (row) => {
      const m = {};
      for (const k of Object.keys(row)) {
        m[String(k).toLowerCase().replace(/[^a-z0-9]/g, '')] = row[k];
      }
      return m;
    };
    const pick = (m, keys) => {
      for (const k of keys) {
        if (m[k] != null && String(m[k]).trim() !== '') return String(m[k]).trim();
      }
      return null;
    };

    const values = [];
    const dirValues = []; // rows for the matching directory table (teachers/tutors/schools)
    const isDir = ['teachers', 'tutors', 'schools'].includes(type);

    for (const raw of rows) {
      const m = norm(raw);
      const name = pick(m, ['name', 'fullname', 'schoolname', 'teachername', 'tutorname', 'contactpersonname', 'contactperson']);
      const phone = pick(m, ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact', 'contactnumber']);
      if (!name && !phone) continue; // skip empty rows

      const email = pick(m, ['email', 'gmail', 'gmailid', 'mailid', 'emailid']);
      const city = pick(m, ['city']);
      const state = pick(m, ['state']);
      const subjects = pick(m, ['subjects', 'subject']);
      const boards = pick(m, ['boards', 'board']);
      const classes = pick(m, ['classes', 'class']);
      const requirement = pick(m, ['subjects', 'subject', 'requirement', 'designation']);

      const extras = [];
      const add = (label, keys) => { const v = pick(m, keys); if (v) extras.push(`${label}: ${v}`); };
      add('State', ['state']);
      add('Boards', ['boards', 'board']);
      add('Classes', ['classes', 'class']);
      add('Timing', ['timing']);
      add('Experience', ['experience']);
      add('Previous', ['previousschoolcollege', 'previousinstitution', 'previous']);
      add('Location', ['location']);
      add('Designation', ['designation']);
      add('School mail', ['schoolmailid', 'schoolemail']);
      add('School number', ['schoolnumber', 'sclnumber']);
      add('Note', ['note', 'notes']);
      const notes = extras.length ? extras.join(' | ') : null;

      values.push([name || 'Unknown', phone || '', email, city, source, requirement, 'new', notes, req.user.id]);

      // Build the directory-table row (imported records are 'unregistered').
      if (isDir) {
        const nm = name || 'Unknown';
        const note = pick(m, ['note', 'notes']);
        if (type === 'teachers') {
          dirValues.push([nm, phone, email, subjects, city, state, boards, classes,
            pick(m, ['experience']), pick(m, ['previousschoolcollege', 'previousinstitution', 'previous']),
            note, 'unregistered', 'pending']);
        } else if (type === 'tutors') {
          dirValues.push([nm, phone, email, subjects, city, state, boards, classes,
            pick(m, ['timing']), 'unregistered', 'pending']);
        } else if (type === 'schools') {
          dirValues.push([nm, pick(m, ['location']), pick(m, ['contactpersonname', 'contactperson']),
            phone, email, pick(m, ['designation']), pick(m, ['schoolmailid', 'schoolemail']),
            pick(m, ['schoolnumber', 'sclnumber']), city, state, note, 'unregistered', 'pending']);
        }
      }
    }

    if (!values.length) {
      return res.status(400).json({ message: 'No valid rows (each row needs at least a name or phone)' });
    }

    await db.query(
      `INSERT INTO leads (name, phone, email, city, source, requirement, status, notes, created_by)
       VALUES ?`,
      [values]
    );

    // Also populate the matching directory table so imported records show up
    // on the Teachers/Tutors/Schools pages as unregistered.
    if (isDir && dirValues.length) {
      try {
        if (type === 'teachers') {
          await db.query(
            `INSERT INTO teachers (name, phone, email, subjects, city, state, boards, classes, experience, previous_institution, note, registration, status)
             VALUES ?`, [dirValues]
          );
        } else if (type === 'tutors') {
          await db.query(
            `INSERT INTO tutors (name, phone, email, subjects, city, state, boards, classes, timing, registration, status)
             VALUES ?`, [dirValues]
          );
        } else if (type === 'schools') {
          await db.query(
            `INSERT INTO schools (name, location, contact_person, phone, email, designation, school_email, school_number, city, state, note, registration, status)
             VALUES ?`, [dirValues]
          );
        }
      } catch (e) {
        console.warn('[leads.import] directory insert skipped:', e.message);
      }
    }

    return res.json({ imported: values.length, directory: isDir ? dirValues.length : 0 });
  } catch (err) {
    console.error('[leads.import]', err);
    return res.status(500).json({ message: 'Could not import the file' });
  }
};

// POST /api/leads/check-duplicates  { phones: [...] }
// Returns which of the given phones already exist in leads (matched on last 10 digits).
exports.checkDuplicates = async (req, res) => {
  try {
    const { phones } = req.body || {};
    if (!Array.isArray(phones)) return res.status(400).json({ message: 'phones must be an array' });

    const norm = (p) => {
      const d = String(p == null ? '' : p).replace(/\D/g, '');
      return d.length > 10 ? d.slice(-10) : d;
    };
    const wanted = new Set(phones.map(norm).filter(Boolean));
    if (!wanted.size) return res.json({ existing: [] });

    const [rows] = await db.query('SELECT phone FROM leads');
    const have = new Set(rows.map((r) => norm(r.phone)).filter(Boolean));
    const existing = [...wanted].filter((p) => have.has(p));
    return res.json({ existing });
  } catch (err) {
    console.error('[leads.checkDuplicates]', err);
    return res.status(500).json({ message: 'Could not check duplicates' });
  }
};

// PATCH /api/leads/bulk-assign  { ids: [...], assigned_to }   (admin only)
exports.bulkAssign = async (req, res) => {
  try {
    const { ids, assigned_to } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No leads selected' });
    }
    const cleanIds = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!cleanIds.length) return res.status(400).json({ message: 'Invalid lead ids' });

    const [result] = await db.query(
      'UPDATE leads SET assigned_to = ? WHERE id IN (?)',
      [assigned_to || null, cleanIds]
    );
    return res.json({ updated: result.affectedRows, assigned_to: assigned_to || null });
  } catch (err) {
    console.error('[leads.bulkAssign]', err);
    return res.status(500).json({ message: 'Could not assign the selected leads' });
  }
};
