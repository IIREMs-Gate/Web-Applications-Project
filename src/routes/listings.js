const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { run, get, all } = require('../db');
const validate = require('../middleware/validate');
const idParam = require('../middleware/idParam');
const { requireLogin, canModify } = require('../middleware/auth');
const uploads = require('../uploads');

const router = express.Router();
router.param('id', idParam);

const SELECT = `SELECT l.id, l.seller_id, u.username AS seller, l.title, l.description,
  l.price_cents, l.status, l.photo, l.created_at
  FROM listings l JOIN users u ON u.id = l.seller_id`;

const listingFields = {
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(1).max(2000),
  price_cents: z.number().int().positive().max(100_000_000),
};
const createSchema = z.strictObject(listingFields);
const updateSchema = z.strictObject({ ...listingFields, status: z.enum(['active', 'sold']).optional() });

const searchSchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(['active', 'sold']).default('active'),
  max_price: z.coerce.number().int().positive().optional(),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

// Runs before multer so a non-owner's upload bytes are never read.
const loadOwnedListing = async (req, res, next) => {
  const listing = await get('SELECT * FROM listings WHERE id = ?', [req.params.id]);
  if (!listing) return res.status(404).json({ error: 'Not found' });
  if (!canModify(req.user, listing.seller_id)) return res.status(403).json({ error: 'Forbidden' });
  req.listing = listing;
  next();
};

router.get('/', async (req, res) => {
  const { q, status, max_price } = searchSchema.parse(req.query);
  const where = ['l.status = ?'];
  const params = [status];
  if (q) {
    // Escape LIKE wildcards so "%" or "_" in the search box match literally.
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push("(l.title LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }
  if (max_price) {
    where.push('l.price_cents <= ?');
    params.push(max_price);
  }
  res.json(await all(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC, l.id DESC LIMIT 100`, params));
});

router.get('/:id', async (req, res) => {
  const listing = await get(`${SELECT} WHERE l.id = ?`, [req.params.id]);
  listing ? res.json(listing) : res.status(404).json({ error: 'Not found' });
});

router.post('/', requireLogin, validate(createSchema), async (req, res) => {
  const { title, description, price_cents } = req.body;
  const { lastID } = await run(
    'INSERT INTO listings (seller_id, title, description, price_cents) VALUES (?, ?, ?, ?)',
    [req.user.id, title, description, price_cents]);
  res.status(201).json(await get(`${SELECT} WHERE l.id = ?`, [lastID]));
});

router.put('/:id', requireLogin, loadOwnedListing, validate(updateSchema), async (req, res) => {
  const { title, description, price_cents, status } = req.body;
  await run('UPDATE listings SET title = ?, description = ?, price_cents = ?, status = ? WHERE id = ?',
    [title, description, price_cents, status ?? req.listing.status, req.listing.id]);
  res.json(await get(`${SELECT} WHERE l.id = ?`, [req.listing.id]));
});

router.delete('/:id', requireLogin, loadOwnedListing, async (req, res) => {
  await run('DELETE FROM listings WHERE id = ?', [req.listing.id]);
  await uploads.remove(req.listing.photo);
  res.status(204).end();
});

router.post('/:id/photo', requireLogin, loadOwnedListing, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: photo)' });
  const photo = await uploads.save(req.file.buffer);
  if (!photo) return res.status(415).json({ error: 'Only JPEG, PNG or WebP images are allowed' });
  await run('UPDATE listings SET photo = ? WHERE id = ?', [photo, req.listing.id]);
  await uploads.remove(req.listing.photo);
  res.json({ photo });
});

module.exports = router;
