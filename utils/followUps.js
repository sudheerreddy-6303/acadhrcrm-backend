// Shared helpers for record follow-ups (teachers / tutors / schools).
// A record can hold up to 3 follow-ups. Each follow-up is:
//   { date: 'YYYY-MM-DD', remarks: string, status: 'hot'|'cold'|'dead'|'' }
// Stored in a single TEXT column as a JSON string.

const STATUSES = ['hot', 'cold', 'dead'];
const MAX_FOLLOW_UPS = 3;

// Clean up whatever the client sent into a safe, capped array.
function sanitize(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_FOLLOW_UPS).map((f) => ({
    date: f && typeof f.date === 'string' ? f.date.slice(0, 10) : '',
    remarks: f && typeof f.remarks === 'string' ? f.remarks.slice(0, 500) : '',
    status: f && STATUSES.includes(f.status) ? f.status : '',
  }));
}

// Turn a stored value (TEXT/JSON string, or already-parsed array) into an array.
function parse(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return sanitize(raw);
  try {
    return sanitize(JSON.parse(raw));
  } catch (_) {
    return [];
  }
}

// ---- Job follow-up (registered records): demo / interview / hired + notes ----
// Stored as a single JSON object in the job_follow_up TEXT column:
//   { demo:'yes'|'no'|'', interview:'yes'|'no'|'', hired:'yes'|'no'|'', description:'' }
const YES_NO = ['yes', 'no'];

function sanitizeJob(j) {
  const o = j || {};
  const yn = (v) => (YES_NO.includes(v) ? v : '');
  return {
    demo: yn(o.demo),
    interview: yn(o.interview),
    hired: yn(o.hired),
    description: typeof o.description === 'string' ? o.description.slice(0, 1000) : '',
  };
}

function parseJob(raw) {
  if (!raw) return sanitizeJob({});
  if (typeof raw === 'object') return sanitizeJob(raw);
  try {
    return sanitizeJob(JSON.parse(raw));
  } catch (_) {
    return sanitizeJob({});
  }
}

module.exports = { STATUSES, MAX_FOLLOW_UPS, sanitize, parse, sanitizeJob, parseJob };
