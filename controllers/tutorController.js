const db = require('../config/db');
const { sanitize, parse, sanitizeJob, parseJob } = require('../utils/followUps');

// Subscription tiers a tutor can be placed on (acadhr.com — For Tutors).
const PLANS = ['inaugural', 'pro'];

// GET /api/tutors?status=&search=
// Read-only for everyone in the CRM (admins and telecallers both view).
exports.list = async (req, res) => {
  try {
    const { status, search, subject, class: klass, registration, state, city, country } = req.query;
    const where = [];
    const params = [];

    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (registration) {
      where.push('registration = ?');
      params.push(registration);
    }
    if (state) {
      where.push('state = ?');
      params.push(state);
    }
    if (city) {
      where.push('city = ?');
      params.push(city);
    }
    if (country) {
      where.push('country = ?');
      params.push(country);
    }
    // Telecallers don't see records imported by a telecaller; admins see all.
    if (!req.user || req.user.role !== 'admin') {
      where.push('(imported = 0 OR assigned_to = ?)');
      params.push(req.user.id);
    }
    if (subject) {
      // exact whole-item match within the comma-separated subjects list
      where.push("FIND_IN_SET(?, REPLACE(subjects, ', ', ',')) > 0");
      params.push(subject);
    }
    if (klass) {
      // exact whole-item match within the comma-separated classes list
      where.push("FIND_IN_SET(?, REPLACE(classes, ', ', ',')) > 0");
      params.push(klass);
    }
    if (search) {
      where.push('(name LIKE ? OR phone LIKE ? OR subjects LIKE ? OR city LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await db.query(
      `SELECT * FROM tutors ${clause} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    const tutors = rows.map((r) => ({ ...r, follow_ups: parse(r.follow_ups) }));
    return res.json({ tutors });
  } catch (err) {
    console.error('[tutors.list]', err);
    return res.status(500).json({ message: 'Could not load tutors' });
  }
};

// POST /api/tutors  — create a tutor from the Add form
exports.create = async (req, res) => {
  try {
    const {
      name, phone, email, city, state,
      subjects, boards, classes, timing, registration,
    } = req.body || {};

    if (!name || !phone || !city || !state) {
      return res.status(400).json({ message: 'Name, phone, city and state are required' });
    }

    // Multi-selects arrive as arrays; store as comma-separated strings.
    const join = (v) => (Array.isArray(v) ? v.join(', ') : (v || null));

    const [result] = await db.query(
      `INSERT INTO tutors
         (name, phone, email, city, state, subjects, boards, classes, timing, registration, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        name, phone, email || null, city, state,
        join(subjects), join(boards), join(classes), join(timing),
        registration === 'unregistered' ? 'unregistered' : 'registered',
      ]
    );
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('[tutors.create]', err);
    return res.status(500).json({ message: 'Could not add tutor' });
  }
};

// PATCH /api/tutors/:id/registration  { registration }
exports.setRegistration = async (req, res) => {
  try {
    const { registration } = req.body || {};
    if (!['registered', 'unregistered'].includes(registration)) {
      return res.status(400).json({ message: 'Invalid registration value' });
    }
    const [result] = await db.query(
      'UPDATE tutors SET registration = ? WHERE id = ?', [registration, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Tutor not found' });
    return res.json({ registration });
  } catch (err) {
    console.error('[tutors.setRegistration]', err);
    return res.status(500).json({ message: 'Could not update registration' });
  }
};

// PATCH /api/tutors/:id/followups  { followUps: [{date, remarks, status}] }
exports.setFollowUps = async (req, res) => {
  try {
    const list = sanitize(req.body && req.body.followUps);
    const [result] = await db.query(
      'UPDATE tutors SET follow_ups = ? WHERE id = ?',
      [JSON.stringify(list), req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Tutor not found' });
    return res.json({ follow_ups: list });
  } catch (err) {
    console.error('[tutors.setFollowUps]', err);
    return res.status(500).json({ message: 'Could not save follow-ups' });
  }
};

// GET /api/tutors/:id  — one record (used by the full-page follow-up view)
exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM tutors WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Tutor not found' });
    const record = { ...rows[0], follow_ups: parse(rows[0].follow_ups), job_follow_up: parseJob(rows[0].job_follow_up) };
    return res.json({ record });
  } catch (err) {
    console.error('[tutors.getOne]', err);
    return res.status(500).json({ message: 'Could not load tutor' });
  }
};

// PATCH /api/tutors/:id/plan  { plan: 'inaugural'|'pro' }
exports.setPlan = async (req, res) => {
  try {
    let plan = req.body && req.body.plan;
    if (!PLANS.includes(plan)) plan = '';
    const [result] = await db.query('UPDATE tutors SET plan = ? WHERE id = ?', [plan, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Tutor not found' });
    return res.json({ plan });
  } catch (err) {
    console.error('[tutors.setPlan]', err);
    return res.status(500).json({ message: 'Could not save plan' });
  }
};

// PATCH /api/tutors/:id/jobfollowup  { job: { demo, interview, hired, description } }
exports.setJobFollowUp = async (req, res) => {
  try {
    const job = sanitizeJob(req.body && req.body.job);
    const [result] = await db.query(
      'UPDATE tutors SET job_follow_up = ? WHERE id = ?',
      [JSON.stringify(job), req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Tutor not found' });
    return res.json({ job_follow_up: job });
  } catch (err) {
    console.error('[tutors.setJobFollowUp]', err);
    return res.status(500).json({ message: 'Could not save job follow-up' });
  }
};

// PATCH /api/tutors/:id/assign  { assigned_to }   (admin only — enforced in route)
exports.assign = async (req, res) => {
  try {
    const assignedTo = (req.body && req.body.assigned_to) || null;
    const [result] = await db.query('UPDATE tutors SET assigned_to = ? WHERE id = ?', [assignedTo, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Tutor not found' });
    return res.json({ assigned_to: assignedTo });
  } catch (err) {
    console.error('[tutors.assign]', err);
    return res.status(500).json({ message: 'Could not assign' });
  }
};
