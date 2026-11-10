const { get } = require('../db');

const loadUser = async (req, res, next) => {
  if (req.session.userId) {
    req.user = await get('SELECT id, username, email, phone, role FROM users WHERE id = ?', [req.session.userId]);
  }
  next();
};

const requireLogin = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Login required' });

const requireRole = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
  next();
};

const canModify = (user, ownerId) => user.role === 'admin' || user.id === ownerId;

module.exports = { loadUser, requireLogin, requireRole, canModify };
