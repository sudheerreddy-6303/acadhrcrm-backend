const db = require('../config/db');

// GET /api/teachers?status=&search=
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
      `SELECT * FROM teachers ${clause} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    return res.json({ teachers: rows });
  } catch (err) {
    console.error('[teachers.list]', err);
    return res.status(500).json({ message: 'Could not load teachers' });
  }
};

// POST /api/teachers  — create a teacher from the Add form
exports.create = async (req, res) => {
  try {
    const {
      name, phone, email, city, state,
      subjects, boards, classes, experience, registration,
      note, previous_institution,
    } = req.body || {};

    if (!name || !phone || !city || !state || !previous_institution) {
      return res.status(400).json({
        message: 'Name, phone, city, state and previous school/college are required',
      });
    }

    const join = (v) => (Array.isArray(v) ? v.join(', ') : (v || null));

    const [result] = await db.query(
      `INSERT INTO teachers
         (name, phone, email, city, state, subjects, boards, classes,
          experience, registration, note, previous_institution, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        name, phone, email || null, city, state,
        join(subjects), join(boards), join(classes),
        experience || null,
        registration === 'unregistered' ? 'unregistered' : 'registered',
        note || null, previous_institution,
      ]
    );
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('[teachers.create]', err);
    return res.status(500).json({ message: 'Could not add teacher' });
  }
};

// PATCH /api/teachers/:id/registration  { registration }
exports.setRegistration = async (req, res) => {
  try {
    const { registration } = req.body || {};
    if (!['registered', 'unregistered'].includes(registration)) {
      return res.status(400).json({ message: 'Invalid registration value' });
    }
    const [result] = await db.query(
      'UPDATE teachers SET registration = ? WHERE id = ?', [registration, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Teacher not found' });
    return res.json({ registration });
  } catch (err) {
    console.error('[teachers.setRegistration]', err);
    return res.status(500).json({ message: 'Could not update registration' });
  }
};
