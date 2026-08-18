const bcrypt = require('bcryptjs');
const db = require('../config/db');

// GET /api/users  — admin only (enforced in route)
exports.list = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    return res.json({ users: rows });
  } catch (err) {
    console.error('[users.list]', err);
    return res.status(500).json({ message: 'Could not load users' });
  }
};

// GET /api/users/telecallers  — active telecallers only (for assigning leads)
exports.telecallers = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name FROM users WHERE is_active = 1 AND role = 'telecaller' ORDER BY name"
    );
    return res.json({ users: rows });
  } catch (err) {
    console.error('[users.telecallers]', err);
    return res.status(500).json({ message: 'Could not load users' });
  }
};

// POST /api/users  { name, email, password, role }  — admin only
exports.create = async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (role && !['admin', 'telecaller'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role || 'telecaller']
    );
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('[users.create]', err);
    return res.status(500).json({ message: 'Could not create user' });
  }
};

// PATCH /api/users/:id  { name, role, is_active, password? }  — admin only
exports.update = async (req, res) => {
  try {
    const { name, role, is_active, password } = req.body || {};
    const fields = [];
    const params = [];

    if (name !== undefined)      { fields.push('name = ?');       params.push(name); }
    if (role !== undefined)      { fields.push('role = ?');       params.push(role); }
    if (is_active !== undefined) { fields.push('is_active = ?');  params.push(is_active ? 1 : 0); }
    if (password) {
      fields.push('password_hash = ?');
      params.push(await bcrypt.hash(password, 10));
    }
    if (!fields.length) return res.status(400).json({ message: 'Nothing to update' });

    params.push(req.params.id);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    return res.json({ message: 'User updated' });
  } catch (err) {
    console.error('[users.update]', err);
    return res.status(500).json({ message: 'Could not update user' });
  }
};

// GET /api/users/:id/stats  — performance stats for one telecaller (admin only)
exports.telecallerStats = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const [urows] = await db.query('SELECT id, name, email, role, is_active FROM users WHERE id = ? LIMIT 1', [id]);
    const user = urows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Leads assigned to this person + breakdown by status
    const [statusRows] = await db.query('SELECT status, COUNT(*) AS c FROM leads WHERE assigned_to = ? GROUP BY status', [id]);
    const byStatus = { new: 0, contacted: 0, follow_up: 0, converted: 0, lost: 0 };
    let assigned = 0;
    for (const r of statusRows) { byStatus[r.status] = r.c; assigned += r.c; }

    // Activity stats (resilient if lead_activities is missing)
    let calls = 0, notes = 0, followUps = 0, totalActivities = 0, followUpsDue = 0;
    try {
      const [actRows] = await db.query('SELECT activity_type, COUNT(*) AS c FROM lead_activities WHERE user_id = ? GROUP BY activity_type', [id]);
      for (const r of actRows) {
        totalActivities += r.c;
        if (r.activity_type === 'call') calls = r.c;
        else if (r.activity_type === 'note') notes = r.c;
        else if (r.activity_type === 'follow_up') followUps = r.c;
      }
      const [dueRows] = await db.query(
        'SELECT COUNT(*) AS due FROM lead_activities WHERE user_id = ? AND follow_up_date IS NOT NULL AND follow_up_date <= NOW()', [id]
      );
      followUpsDue = dueRows[0].due;
    } catch (e) {
      console.warn('[users.telecallerStats] activities skipped:', e.message);
    }

    return res.json({ user, assigned, byStatus, calls, notes, followUps, totalActivities, followUpsDue });
  } catch (err) {
    console.error('[users.telecallerStats]', err);
    return res.status(500).json({ message: 'Could not load telecaller stats' });
  }
};

// GET /api/users/:id/leads?status=  — leads assigned to a telecaller (admin only)
exports.telecallerLeads = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const { status } = req.query;
    const where = ['assigned_to = ?'];
    const params = [id];
    if (status) { where.push('status = ?'); params.push(status); }
    const [rows] = await db.query(
      `SELECT id, name, phone, email, city, requirement, status, source, updated_at
         FROM leads WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT 500`,
      params
    );
    return res.json({ leads: rows });
  } catch (err) {
    console.error('[users.telecallerLeads]', err);
    return res.status(500).json({ message: 'Could not load leads' });
  }
};

// GET /api/users/:id/activities?type=call|note|follow_up|due|all  (admin only)
exports.telecallerActivities = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const type = req.query.type || 'all';
    let clause = 'a.user_id = ?';
    const params = [id];
    if (['call', 'note', 'follow_up'].includes(type)) { clause += ' AND a.activity_type = ?'; params.push(type); }
    else if (type === 'due') { clause += ' AND a.follow_up_date IS NOT NULL AND a.follow_up_date <= NOW()'; }

    const [rows] = await db.query(
      `SELECT a.id, a.activity_type, a.notes, a.follow_up_date, a.created_at, l.name AS lead_name
         FROM lead_activities a LEFT JOIN leads l ON l.id = a.lead_id
         WHERE ${clause} ORDER BY a.created_at DESC LIMIT 500`,
      params
    );
    return res.json({ activities: rows });
  } catch (err) {
    console.warn('[users.telecallerActivities] skipped:', err.message);
    return res.json({ activities: [] }); // resilient if lead_activities is missing
  }
};
