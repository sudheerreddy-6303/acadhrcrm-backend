const db = require('../config/db');
const { sanitize, parse, sanitizeJob, parseJob } = require('../utils/followUps');

// Subscription tiers a registered school can be placed on (acadhr.com — For Schools).
const PLANS = ['basic', 'professional', 'enterprise'];

// GET /api/schools?status=&search=
// Read-only for everyone in the CRM (admins and telecallers both view).
exports.list = async (req, res) => {
  try {
    const { status, search, registration, state, city, country } = req.query;
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
    if (search) {
      where.push('(name LIKE ? OR contact_person LIKE ? OR phone LIKE ? OR city LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await db.query(
      `SELECT * FROM schools ${clause} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    const schools = rows.map((r) => ({ ...r, follow_ups: parse(r.follow_ups) }));
    return res.json({ schools });
  } catch (err) {
    console.error('[schools.list]', err);
    return res.status(500).json({ message: 'Could not load schools' });
  }
};

// POST /api/schools  — create a school from the Add form
exports.create = async (req, res) => {
  try {
    const {
      name, location, state, city,
      contact_person, phone, email, designation,
      school_email, school_number, registration, note,
      contact_person2, phone2, email2, designation2,
    } = req.body || {};

    if (!name || !location || !state || !city || !contact_person || !phone || !email || !designation) {
      return res.status(400).json({
        message: 'School name, location, state, city, contact person, phone, mail id and designation are required',
      });
    }

    const reg = registration === 'unregistered' ? 'unregistered' : 'registered';

    try {
      const [result] = await db.query(
        `INSERT INTO schools
           (name, location, state, city, contact_person, phone, email, designation,
            school_email, school_number, contact_person2, phone2, email2, designation2,
            registration, note, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          name, location, state, city, contact_person, phone, email, designation,
          school_email || null, school_number || null,
          contact_person2 || null, phone2 || null, email2 || null, designation2 || null,
          reg, note || null,
        ]
      );
      return res.status(201).json({ id: result.insertId });
    } catch (e) {
      // If the second-contact columns aren't added yet, save without them.
      if (e && e.code === 'ER_BAD_FIELD_ERROR') {
        const [result] = await db.query(
          `INSERT INTO schools
             (name, location, state, city, contact_person, phone, email, designation,
              school_email, school_number, registration, note, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [
            name, location, state, city, contact_person, phone, email, designation,
            school_email || null, school_number || null, reg, note || null,
          ]
        );
        return res.status(201).json({ id: result.insertId });
      }
      throw e;
    }
  } catch (err) {
    console.error('[schools.create]', err);
    return res.status(500).json({ message: 'Could not add school' });
  }
};

// PATCH /api/schools/:id/registration  { registration }
exports.setRegistration = async (req, res) => {
  try {
    const { registration } = req.body || {};
    if (!['registered', 'unregistered'].includes(registration)) {
      return res.status(400).json({ message: 'Invalid registration value' });
    }
    const [result] = await db.query(
      'UPDATE schools SET registration = ? WHERE id = ?', [registration, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'School not found' });
    return res.json({ registration });
  } catch (err) {
    console.error('[schools.setRegistration]', err);
    return res.status(500).json({ message: 'Could not update registration' });
  }
};

// PATCH /api/schools/:id/followups  { followUps: [{date, remarks, status}] }
exports.setFollowUps = async (req, res) => {
  try {
    const list = sanitize(req.body && req.body.followUps);
    const [result] = await db.query(
      'UPDATE schools SET follow_ups = ? WHERE id = ?',
      [JSON.stringify(list), req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'School not found' });
    return res.json({ follow_ups: list });
  } catch (err) {
    console.error('[schools.setFollowUps]', err);
    return res.status(500).json({ message: 'Could not save follow-ups' });
  }
};

// GET /api/schools/:id  — one record (used by the full-page follow-up view)
exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM schools WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'School not found' });
    const record = { ...rows[0], follow_ups: parse(rows[0].follow_ups), job_follow_up: parseJob(rows[0].job_follow_up) };
    return res.json({ record });
  } catch (err) {
    console.error('[schools.getOne]', err);
    return res.status(500).json({ message: 'Could not load school' });
  }
};

// PATCH /api/schools/:id/plan  { plan: 'basic'|'most_popular'|'enterprise' }
exports.setPlan = async (req, res) => {
  try {
    let plan = req.body && req.body.plan;
    if (!PLANS.includes(plan)) plan = '';
    const [result] = await db.query('UPDATE schools SET plan = ? WHERE id = ?', [plan, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'School not found' });
    return res.json({ plan });
  } catch (err) {
    console.error('[schools.setPlan]', err);
    return res.status(500).json({ message: 'Could not save plan' });
  }
};

// PATCH /api/schools/:id/jobfollowup  { job: { demo, interview, hired, description } }
exports.setJobFollowUp = async (req, res) => {
  try {
    const job = sanitizeJob(req.body && req.body.job);
    const [result] = await db.query(
      'UPDATE schools SET job_follow_up = ? WHERE id = ?',
      [JSON.stringify(job), req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'School not found' });
    return res.json({ job_follow_up: job });
  } catch (err) {
    console.error('[schools.setJobFollowUp]', err);
    return res.status(500).json({ message: 'Could not save job follow-up' });
  }
};

// PATCH /api/schools/:id/assign  { assigned_to }   (admin only — enforced in route)
exports.assign = async (req, res) => {
  try {
    const assignedTo = (req.body && req.body.assigned_to) || null;
    const [result] = await db.query('UPDATE schools SET assigned_to = ? WHERE id = ?', [assignedTo, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'School not found' });
    return res.json({ assigned_to: assignedTo });
  } catch (err) {
    console.error('[schools.assign]', err);
    return res.status(500).json({ message: 'Could not assign' });
  }
};
