const db = require('../config/db');

// GET /api/tutors?status=&search=
// Read-only for everyone in the CRM (admins and telecallers both view).
exports.list = async (req, res) => {
  try {
    const { status, search, subject, registration, state, city } = req.query;
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
    if (subject) {
      // exact whole-item match within the comma-separated subjects list
      where.push("FIND_IN_SET(?, REPLACE(subjects, ', ', ',')) > 0");
      params.push(subject);
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
    return res.json({ tutors: rows });
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
