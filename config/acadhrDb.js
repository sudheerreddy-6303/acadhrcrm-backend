// Optional connection to an EXTERNAL AcadHr MySQL server (a different server
// than the CRM's own database). Use this when the AcadHr data does NOT live on
// the same server as the CRM.
//
// If these env vars are set, the fetch uses this connection; otherwise it falls
// back to the CRM's own connection and reads the `acadhr` schema on the same
// server.
//
//   ACADHR_DB_HOST=<the AcadHr server host, e.g. tramway.proxy.rlwy.net>
//   ACADHR_DB_PORT=<port, e.g. 53767>
//   ACADHR_DB_USER=root
//   ACADHR_DB_PASSWORD=********
//   ACADHR_DB_NAME=acadhr
//   ACADHR_DB_SSL=false

const mysql = require('mysql2');
require('dotenv').config();

let pool = null;

function isExternalConfigured() {
  return Boolean(
    process.env.ACADHR_DB_HOST &&
    process.env.ACADHR_DB_USER &&
    process.env.ACADHR_DB_NAME
  );
}

function getAcadhrPool() {
  if (!isExternalConfigured()) return null;
  if (pool) return pool;

  const useSsl = String(process.env.ACADHR_DB_SSL || '').toLowerCase() === 'true';
  const raw = mysql.createPool({
    host: process.env.ACADHR_DB_HOST,
    port: Number(process.env.ACADHR_DB_PORT) || 3306,
    user: process.env.ACADHR_DB_USER,
    password: process.env.ACADHR_DB_PASSWORD || '',
    database: process.env.ACADHR_DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 5,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  pool = raw.promise();
  return pool;
}

module.exports = { getAcadhrPool, isExternalConfigured };
