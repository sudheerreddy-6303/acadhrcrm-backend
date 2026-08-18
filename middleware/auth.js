const jwt = require('jsonwebtoken');

// Verifies the JWT and attaches { id, role, name, email } to req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }
}

// Restricts a route to one or more roles, e.g. requireRole('admin').
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have access to this' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
