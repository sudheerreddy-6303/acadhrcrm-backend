// Creates (or resets the password of) the first admin using values from .env.
// Run with: npm run seed
const bcrypt = require('bcryptjs');
const db = require('./config/db');
require('dotenv').config();

(async () => {
  try {
    const name = process.env.SEED_ADMIN_NAME || 'Admin';
    const email = process.env.SEED_ADMIN_EMAIL || 'admin@acadhr.com';
    const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(password, 10);

    await db.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES (?, ?, ?, 'admin')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name), role = 'admin'`,
      [name, email, hash]
    );

    console.log(`[seed] admin ready -> ${email} / ${password}`);
    process.exit(0);
  } catch (err) {
    console.error('[seed] failed:', err.message);
    process.exit(1);
  }
})();
