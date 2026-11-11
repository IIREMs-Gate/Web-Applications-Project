const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { run, get } = require('../db');
const validate = require('../middleware/validate');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

const COST = 12;

const dummyHash = bcrypt.hashSync('not-a-real-password', COST);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many attempts, try again later' },
});

const password = z.string().min(8).refine((p) => Buffer.byteLength(p) <= 72, 'Must be at most 72 bytes');

const registerSchema = z.strictObject({
  username: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_]+$/, 'Letters, numbers and _ only'),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  phone: z.string().trim().regex(/^\+?[0-9 ]{7,20}$/, 'Invalid phone number').optional(),
  password,
});

const loginSchema = z.strictObject({
  username: z.string().max(30),
  password: z.string().max(72),
});

router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const { username, email, phone, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, COST);
    const { lastID } = await run(
      "INSERT INTO users (username, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'user')",
      [username, email, phone ?? null, hash]);
    res.status(201).json({ id: lastID, username });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Username or email already taken' });
    throw err;
  }
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  const user = await get('SELECT id, password_hash FROM users WHERE username = ?', [username]);
  const ok = await bcrypt.compare(password, user ? user.password_hash : dummyHash);
  if (!user || !ok) return res.status(401).json({ error: 'Invalid username or password' });

  await new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  req.session.userId = user.id;
  res.json(await get('SELECT id, username, email, phone, role FROM users WHERE id = ?', [user.id]));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.status(204).end();
  });
});

router.get('/me', requireLogin, (req, res) => res.json(req.user));

module.exports = router;
