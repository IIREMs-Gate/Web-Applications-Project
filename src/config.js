const path = require('path');
require('dotenv').config({ quiet: true });

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32 || secret.startsWith('change-me')) {
  throw new Error('Set SESSION_SECRET (32+ random chars) in .env, see .env.example');
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  sessionSecret: secret,
  dbPath: process.env.DB_PATH || 'marketplace.db',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  production: process.env.NODE_ENV === 'production',
};
