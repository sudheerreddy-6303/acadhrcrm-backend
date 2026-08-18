const db = require('../config/db');

// GET /api/schools?status=&search=
// Read-only for everyone in the CRM (admins and telecallers both view).
exports.list = async (req, res) => {
  try {
    const { status, search, registration, state, city } = req.query;
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
    if (search) {
      where.push('(name LIKE ? OR contact_person LIKE ? OR phone LIKE ? OR city LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await db.query(
      `SELECT * FROM schools ${clause} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    return res.json({ schools: rows });
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
