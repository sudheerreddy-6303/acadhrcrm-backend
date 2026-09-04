const db = require('../config/db');

const isAdmin = (req) => req.user.role === 'admin';

// GET /api/dashboard/stats
// Admin sees org-wide numbers; telecaller sees only their own leads.
exports.stats = async (req, res) => {
  try {
    const scope = isAdmin(req) ? '' : 'WHERE assigned_to = ?';
    const scopeParams = isAdmin(req) ? [] : [req.user.id];

    const [statusRows] = await db.query(
      `SELECT status, COUNT(*) AS count FROM leads ${scope} GROUP BY status`,
      scopeParams
    );

    const byStatus = { new: 0, contacted: 0, follow_up: 0, converted: 0, lost: 0 };
    let total = 0;
    for (const row of statusRows) {
      byStatus[row.status] = row.count;
      total += row.count;
    }

    // Leads split by registration (added leads are 'unregistered').
    // Wrapped so a pre-migration DB (no registration column) can't break the
    // whole stats response — all leads then fall back to 'unregistered'.
    let byRegistration = { registered: 0, unregistered: 0 };
    try {
      const [regRows] = await db.query(
        `SELECT registration, COUNT(*) AS count FROM leads ${scope} GROUP BY registration`,
        scopeParams
      );
      for (const row of regRows) {
        if (row.registration in byRegistration) byRegistration[row.registration] = row.count;
      }
    } catch (e) {
      byRegistration = { registered: 0, unregistered: total };
      console.warn('[dashboard.stats] registration split skipped:', e.message);
    }

    // Follow-ups due today or overdue, scoped to the user unless admin.
    // Wrapped so a missing/empty lead_activities table can't break the whole
    // stats response — the lead counts above must always come through.
    let followUpsDue = 0;
    try {
      const followScope = isAdmin(req)
        ? 'WHERE a.follow_up_date IS NOT NULL AND a.follow_up_date <= NOW()'
        : 'JOIN leads l ON l.id = a.lead_id WHERE a.follow_up_date IS NOT NULL AND a.follow_up_date <= NOW() AND l.assigned_to = ?';
      const [followRows] = await db.query(
        `SELECT COUNT(*) AS due FROM lead_activities a ${followScope}`,
        isAdmin(req) ? [] : [req.user.id]
      );
      followUpsDue = followRows[0].due;
    } catch (e) {
      console.warn('[dashboard.stats] follow-ups query skipped:', e.message);
    }

    return res.json({
      total,
      byStatus,
      byRegistration,
      followUpsDue,
      scope: isAdmin(req) ? 'all' : 'mine',
    });
  } catch (err) {
    console.error('[dashboard.stats]', err);
    return res.status(500).json({ message: 'Could not load dashboard' });
  }
};

// GET /api/dashboard/directory?type=&status=&city=&state=
// Counts of teachers / tutors / schools plus registered/unregistered split.
// Visible to all roles (these directories aren't role-scoped). All filters
// apply uniformly; `type` limits which directories feed the totals.
exports.directory = async (req, res) => {
  try {
    const { type = '', status = '', city = '', state = '', country = '', registration = '', search = '' } = req.query;

    const buildWhere = () => {
      const where = [];
      const params = [];
      if (status) { where.push('status = ?'); params.push(status); }
      if (city)   { where.push('city = ?');   params.push(city); }
      if (state)  { where.push('state = ?');  params.push(state); }
      if (country){ where.push('country = ?'); params.push(country); }
      if (!isAdmin(req)) { where.push('(imported = 0 OR assigned_to = ?)'); params.push(req.user.id); } // telecallers: non-imported or assigned
      if (registration) { where.push('registration = ?'); params.push(registration); }
      if (search) { where.push('(name LIKE ? OR city LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
      return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
    };

    // table name is hard-coded (never user input) — safe to interpolate.
    const countTable = async (table) => {
      const { clause, params } = buildWhere();
      const [rows] = await db.query(
        `SELECT COUNT(*) AS total,
                SUM(registration = 'registered')   AS reg,
                SUM(registration = 'unregistered') AS unreg
           FROM ${table} ${clause}`,
        params
      );
      const r = rows[0] || {};
      return {
        total: Number(r.total) || 0,
        reg: Number(r.reg) || 0,
        unreg: Number(r.unreg) || 0,
      };
    };

    const [t, tu, s] = await Promise.all([
      countTable('teachers'),
      countTable('tutors'),
      countTable('schools'),
    ]);

    const inc = (name) => !type || type === name;
    const teachers = inc('teachers') ? t.total : 0;
    const tutors   = inc('tutors')   ? tu.total : 0;
    const schools  = inc('schools')  ? s.total : 0;

    // Tuitions count — resilient: 0 if the tuitions table doesn't exist yet.
    let tuitionsTotal = 0;
    try {
      const [tt] = await db.query('SELECT COUNT(*) AS c FROM tuitions');
      tuitionsTotal = Number(tt[0].c) || 0;
    } catch (e) {
      tuitionsTotal = 0;
    }
    const tuitions = inc('tuitions') ? tuitionsTotal : 0;

    const registered =
      (inc('teachers') ? t.reg : 0) + (inc('tutors') ? tu.reg : 0) + (inc('schools') ? s.reg : 0);
    const unregistered =
      (inc('teachers') ? t.unreg : 0) + (inc('tutors') ? tu.unreg : 0) + (inc('schools') ? s.unreg : 0);

    return res.json({
      teachers, tutors, schools, tuitions,
      registered, unregistered,
      total: teachers + tutors + schools + tuitions,
    });
  } catch (err) {
    console.error('[dashboard.directory]', err);
    return res.status(500).json({ message: 'Could not load directory counts' });
  }
};

// GET /api/dashboard/subjects?type=&registration=&status=&city=&state=
// Tally of how many teachers + tutors teach each subject (schools have none).
// Subjects are stored comma-separated, so we split and count in JS.
exports.subjects = async (req, res) => {
  try {
    const { type = '', status = '', city = '', state = '', country = '', registration = '', search = '' } = req.query;

    const buildWhere = () => {
      const where = [];
      const params = [];
      if (status) { where.push('status = ?'); params.push(status); }
      if (city)   { where.push('city = ?');   params.push(city); }
      if (state)  { where.push('state = ?');  params.push(state); }
      if (country){ where.push('country = ?'); params.push(country); }
      if (!isAdmin(req)) { where.push('(imported = 0 OR assigned_to = ?)'); params.push(req.user.id); } // telecallers: non-imported or assigned
      if (registration) { where.push('registration = ?'); params.push(registration); }
      if (search) { where.push('(name LIKE ? OR subjects LIKE ? OR city LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
    };

    const gather = async (table) => {
      const { clause, params } = buildWhere();
      const [rows] = await db.query(`SELECT subjects FROM ${table} ${clause}`, params);
      return rows;
    };

    const teachersTally = {};
    const tutorsTally = {};
    const addRows = (rows, tally) => {
      for (const r of rows) {
        if (!r.subjects) continue;
        for (let s of String(r.subjects).split(',')) {
          s = s.trim();
          if (s) tally[s] = (tally[s] || 0) + 1;
        }
      }
    };

    const inc = (name) => !type || type === name;
    if (inc('teachers')) addRows(await gather('teachers'), teachersTally);
    if (inc('tutors'))   addRows(await gather('tutors'), tutorsTally);

    // Also fold in LEADS' subjects so tutor/teacher leads (e.g. the imported
    // unregistered records) show up on the Courses/Subjects cards. A lead keeps
    // its subject in the `requirement` column and its kind in `source`
    // ('tutors' | 'teachers' | ...). Anything that isn't a teacher-lead is
    // counted as a tutor. Wrapped so it can never break the directory tally.
    try {
      const lWhere = [];
      const lParams = [];
      if (status)       { lWhere.push('status = ?');       lParams.push(status); }
      if (city)         { lWhere.push('city = ?');         lParams.push(city); }
      if (search)       { lWhere.push('(name LIKE ? OR requirement LIKE ? OR city LIKE ?)'); lParams.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      // leads have no `state` column — skip leads only when a state filter is set.
      if (!state && !country) {
        const lClause = lWhere.length ? `WHERE ${lWhere.join(' AND ')}` : '';
        // Read each lead's registration so a lead a telecaller marks
        // 'registered' moves from the Unregistered into the Registered count.
        // Falls back to treating every lead as unregistered if the column
        // isn't there yet (migration 004 not run), so counts never break.
        let leadRows;
        try {
          [leadRows] = await db.query(`SELECT requirement, source, registration FROM leads ${lClause}`, lParams);
        } catch (colErr) {
          [leadRows] = await db.query(`SELECT requirement, source FROM leads ${lClause}`, lParams);
        }
        const addLead = (val, tally) => {
          if (!val) return;
          for (let s of String(val).split(',')) {
            s = s.trim();
            if (s) tally[s] = (tally[s] || 0) + 1;
          }
        };
        for (const r of leadRows) {
          // every lead is unregistered unless explicitly set to 'registered'
          const rowReg = r.registration === 'registered' ? 'registered' : 'unregistered';
          if (registration && rowReg !== registration) continue; // honor the registration filter
          const kind = String(r.source || '').toLowerCase();
          if (kind === 'teachers') { if (inc('teachers')) addLead(r.requirement, teachersTally); }
          else                     { if (inc('tutors'))   addLead(r.requirement, tutorsTally); }
        }
      }
    } catch (e) {
      console.warn('[dashboard.subjects] lead subjects skipped:', e.message);
    }

    return res.json({ teachers: teachersTally, tutors: tutorsTally });
  } catch (err) {
    console.error('[dashboard.subjects]', err);
    return res.status(500).json({ message: 'Could not load subject counts' });
  }
};

// GET /api/dashboard/classes?type=&registration=&status=&city=&state=
// Tally of how many teachers + tutors handle each class (from the classes field).
exports.classes = async (req, res) => {
  try {
    const { type = '', status = '', city = '', state = '', country = '', registration = '', search = '' } = req.query;

    const buildWhere = () => {
      const where = [];
      const params = [];
      if (status) { where.push('status = ?'); params.push(status); }
      if (city)   { where.push('city = ?');   params.push(city); }
      if (state)  { where.push('state = ?');  params.push(state); }
      if (country){ where.push('country = ?'); params.push(country); }
      if (!isAdmin(req)) { where.push('(imported = 0 OR assigned_to = ?)'); params.push(req.user.id); } // telecallers: non-imported or assigned
      if (registration) { where.push('registration = ?'); params.push(registration); }
      if (search) { where.push('(name LIKE ? OR subjects LIKE ? OR city LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
    };

    const gather = async (table) => {
      const { clause, params } = buildWhere();
      const [rows] = await db.query(`SELECT classes FROM ${table} ${clause}`, params);
      return rows;
    };

    const tally = {};
    const addRows = (rows) => {
      for (const r of rows) {
        if (!r.classes) continue;
        for (let c of String(r.classes).split(',')) {
          c = c.trim();
          if (c) tally[c] = (tally[c] || 0) + 1;
        }
      }
    };

    const inc = (name) => !type || type === name;
    if (inc('teachers')) addRows(await gather('teachers'));
    if (inc('tutors'))   addRows(await gather('tutors'));

    return res.json({ counts: tally });
  } catch (err) {
    console.warn('[dashboard.classes] skipped:', err.message);
    return res.json({ counts: {} }); // resilient if the classes column is missing
  }
};

// GET /api/dashboard/lead-subjects — tally of leads by course/subject (their requirement).
// Role-scoped: admin = all leads, telecaller = only their assigned leads.
exports.leadSubjects = async (req, res) => {
  try {
    const scope = isAdmin(req) ? '' : 'WHERE assigned_to = ?';
    const params = isAdmin(req) ? [] : [req.user.id];
    const [rows] = await db.query(`SELECT requirement FROM leads ${scope}`, params);
    const tally = {};
    for (const r of rows) {
      if (!r.requirement) continue;
      for (let s of String(r.requirement).split(',')) {
        s = s.trim();
        if (s) tally[s] = (tally[s] || 0) + 1;
      }
    }
    return res.json({ counts: tally });
  } catch (err) {
    console.warn('[dashboard.leadSubjects] skipped:', err.message);
    return res.json({ counts: {} });
  }
};
