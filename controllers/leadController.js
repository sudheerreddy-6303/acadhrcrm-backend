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
      // Imported teacher/tutor/school data is worked in those sections, not Leads.
      where.push("(l.source IS NULL OR l.source NOT IN ('teachers', 'tutors', 'schools'))");
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
    const assignee = assigned_to || null;

    // Find the lead's identity so we can also assign its directory twin
    // (imported teacher/tutor/school rows created from the same import row).
    const [rows] = await db.query('SELECT source, name, phone FROM leads WHERE id = ? LIMIT 1', [req.params.id]);

    await db.query('UPDATE leads SET assigned_to = ? WHERE id = ?', [assignee, req.params.id]);

    const lead = rows[0];
    if (lead && ['teachers', 'tutors', 'schools'].includes(lead.source)) {
      try {
        // Match the directory record by name (+ phone when present).
        await db.query(
          `UPDATE ${lead.source} SET assigned_to = ? WHERE name = ? AND (? = '' OR phone = ?)`,
          [assignee, lead.name, lead.phone || '', lead.phone || '']
        );
      } catch (e) {
        console.warn('[leads.assign] directory propagation skipped:', e.message);
      }
    }

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
    // Optional: which registration state imported directory records get. Defaults
    // to 'unregistered' (the Excel Import behaviour). The AcadHr fetch passes
    // 'registered' so fetched tutors land under Registration Followup.
    const importReg = (req.body && req.body.registration) === 'registered' ? 'registered' : 'unregistered';
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
    // Imported records stay admin-only (shown in Leads for assignment) until an
    // admin assigns them to a telecaller. So every import is flagged imported = 1.
    const importedFlag = 1;

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

      // Build the directory-table row. Registration state comes from importReg
      // ('unregistered' by default; 'registered' when the AcadHr fetch asks).
      if (isDir) {
        const nm = name || 'Unknown';
        const note = pick(m, ['note', 'notes']);
        if (type === 'teachers') {
          dirValues.push([nm, phone, email, subjects, city, state, boards, classes,
            pick(m, ['experience']), pick(m, ['previousschoolcollege', 'previousinstitution', 'previous']),
            note, importReg, 'pending', importedFlag]);
        } else if (type === 'tutors') {
          dirValues.push([nm, phone, email, subjects, city, state, boards, classes,
            pick(m, ['timing']), importReg, 'pending', importedFlag]);
        } else if (type === 'schools') {
          dirValues.push([nm, pick(m, ['location']), pick(m, ['contactpersonname', 'contactperson']),
            phone, email, pick(m, ['designation']), pick(m, ['schoolmailid', 'schoolemail']),
            pick(m, ['schoolnumber', 'sclnumber']), city, state, note, importReg, 'pending', importedFlag]);
        }
      }
    }

    if (!values.length) {
      return res.status(400).json({ message: 'No valid rows (each row needs at least a name or phone)' });
    }

    const [leadInsert] = await db.query(
      `INSERT INTO leads (name, phone, email, city, source, requirement, status, notes, created_by)
       VALUES ?`,
      [values]
    );
    // IDs of the just-created leads. A single multi-row INSERT gets sequential
    // auto-increment IDs, so we can hand them back for an immediate assign step
    // (used by the Import & Assign page).
    const firstLeadId = leadInsert.insertId;
    const leadIds = firstLeadId
      ? Array.from({ length: leadInsert.affectedRows }, (_, i) => firstLeadId + i)
      : [];

    // Also populate the matching directory table so imported records show up
    // on the Teachers/Tutors/Schools pages as unregistered.
    let directoryInserted = 0;
    let directoryError = null;
    if (isDir && dirValues.length) {
      try {
        // De-duplicate the directory rows against what's already there (and within
        // this batch) by phone, falling back to name — so re-imports don't pile up.
        const phoneIdx = type === 'schools' ? 3 : 1;
        const keyOf = (nm, ph) => (ph && String(ph).trim()
          ? 'p:' + String(ph).trim()
          : 'n:' + String(nm || '').trim().toLowerCase());
        const [existingRows] = await db.query(`SELECT name, phone FROM ${type}`);
        const have = new Set(existingRows.map((r) => keyOf(r.name, r.phone)));
        const seenDir = new Set();
        const uniqueDir = dirValues.filter((row) => {
          const k = keyOf(row[0], row[phoneIdx]);
          if (have.has(k) || seenDir.has(k)) return false;
          seenDir.add(k);
          return true;
        });

        if (uniqueDir.length) {
          let result;
          if (type === 'teachers') {
            [result] = await db.query(
              `INSERT INTO teachers (name, phone, email, subjects, city, state, boards, classes, experience, previous_institution, note, registration, status, imported)
               VALUES ?`, [uniqueDir]
            );
          } else if (type === 'tutors') {
            [result] = await db.query(
              `INSERT INTO tutors (name, phone, email, subjects, city, state, boards, classes, timing, registration, status, imported)
               VALUES ?`, [uniqueDir]
            );
          } else if (type === 'schools') {
            [result] = await db.query(
              `INSERT INTO schools (name, location, contact_person, phone, email, designation, school_email, school_number, city, state, note, registration, status, imported)
               VALUES ?`, [uniqueDir]
            );
          }
          directoryInserted = (result && result.affectedRows) || 0;
        }
      } catch (e) {
        // Don't swallow this: a missing column here is exactly what makes imported
        // records never reach the directory (and so never become assignable).
        directoryError = e.message;
        console.error('[leads.import] DIRECTORY INSERT FAILED —', e.message,
          '— imported records will not appear on the', type, 'page until this is fixed.');
      }
    }

    // Report what actually happened so a silent directory failure is visible to the
    // admin instead of looking like a clean success.
    const resp = { imported: values.length, leadIds };
    if (isDir) {
      resp.directory = directoryInserted;
      if (directoryError) {
        resp.warning = `Rows were added to Leads, but could not be added to the ${type} page (${directoryError}). Restart the backend so it can add the missing column, then re-import.`;
      }
    }
    return res.json(resp);
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

    const assignee = assigned_to || null;
    const [result] = await db.query(
      'UPDATE leads SET assigned_to = ? WHERE id IN (?)',
      [assignee, cleanIds]
    );

    // Also assign the directory twins (imported teacher/tutor/school rows created
    // from the same import) so the telecaller actually sees them on those pages.
    // Mirrors the single-lead assign propagation. Best-effort — never fails the
    // request if a directory row can't be matched.
    try {
      const [twins] = await db.query(
        `SELECT source, name, phone FROM leads
           WHERE id IN (?) AND source IN ('teachers','tutors','schools')`,
        [cleanIds]
      );
      for (const lead of twins) {
        try {
          await db.query(
            `UPDATE ${lead.source} SET assigned_to = ? WHERE name = ? AND (? = '' OR phone = ?)`,
            [assignee, lead.name, lead.phone || '', lead.phone || '']
          );
        } catch (e) {
          console.warn('[leads.bulkAssign] directory propagation skipped:', e.message);
        }
      }
    } catch (e) {
      console.warn('[leads.bulkAssign] directory lookup skipped:', e.message);
    }

    return res.json({ updated: result.affectedRows, assigned_to: assignee });
  } catch (err) {
    console.error('[leads.bulkAssign]', err);
    return res.status(500).json({ message: 'Could not assign the selected leads' });
  }
};
