const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ---- CORS: allow the configured frontend origin(s) ----
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());
app.use(cors({ origin: origins, credentials: true }));

app.use(express.json());

// ---- Health check ----
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- Routes ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/tutors', require('./routes/tutors'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/schools', require('./routes/schools'));
app.use('/api/users', require('./routes/users'));
app.use('/api/dashboard', require('./routes/dashboard'));

// ---- 404 + error fallbacks ----
app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ message: 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
