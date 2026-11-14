const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const multer = require('multer');
const { ZodError } = require('zod');
const config = require('./config');
const { loadUser } = require('./middleware/auth');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '10kb' }));

app.use(session({
  name: 'sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.production, maxAge: 2 * 60 * 60 * 1000 },
}));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(config.uploadDir, { index: false }));
app.use(loadUser);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api', require('./routes/offers'));
app.use('/api', require('./routes/reviews'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return res.status(400).json({ error: 'Invalid input', details });
  }
  if (err instanceof multer.MulterError) {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'Upload rejected' });
  }

  if (err.expose && err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
