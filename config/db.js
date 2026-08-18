// MySQL connection pool.
// Uses a pool (not a single connection) plus keep-alive so idle connections
// don't get silently dropped by the DB/host — the failure mode that caused
// the nightly outages on the main platform.

const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'acadhr_crm',

  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,        // close truly idle sockets after 60s
  queueLimit: 0,

  enableKeepAlive: true,     // send TCP keep-alive probes...
  keepAliveInitialDelay: 10000, // ...starting 10s after a socket goes idle
});

// Promise-based interface so controllers can `await pool.query(...)`.
const db = pool.promise();

// Fail fast at boot if the DB is unreachable, but keep the pool self-healing after.
db.query('SELECT 1')
  .then(() => console.log('[db] connected'))
  .catch((err) => console.error('[db] initial connection failed:', err.message));

module.exports = db;
