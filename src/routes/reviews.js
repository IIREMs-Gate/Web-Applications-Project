const express = require('express');
const { z } = require('zod');
const { run, get, all } = require('../db');
const validate = require('../middleware/validate');
const idParam = require('../middleware/idParam');
const { requireLogin, canModify } = require('../middleware/auth');

const router = express.Router();
router.param('id', idParam);

const createSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(1).max(1000),
});

// Review text is user-generated: it is returned as plain JSON and the frontend must render it with textContent.
router.get('/users/:id/reviews', async (req, res) => {
  if (!await get('SELECT 1 FROM users WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Not found' });
  res.json(await all(
    `SELECT r.id, r.seller_id, r.author_id, a.username AS author, r.rating, r.body, r.created_at
     FROM reviews r JOIN users a ON a.id = r.author_id WHERE r.seller_id = ? ORDER BY r.id DESC`,
    [req.params.id]));
});

router.post('/users/:id/reviews', requireLogin, validate(createSchema), async (req, res) => {
  const sellerId = Number(req.params.id);
  if (!await get('SELECT 1 FROM users WHERE id = ?', [sellerId])) return res.status(404).json({ error: 'Not found' });
  if (sellerId === req.user.id) return res.status(403).json({ error: 'You cannot review yourself' });
  if (await get('SELECT 1 FROM reviews WHERE seller_id = ? AND author_id = ?', [sellerId, req.user.id])) {
    return res.status(409).json({ error: 'You already reviewed this seller' });
  }
  const { rating, body } = req.body;
  const { lastID } = await run('INSERT INTO reviews (seller_id, author_id, rating, body) VALUES (?, ?, ?, ?)',
    [sellerId, req.user.id, rating, body]);
  res.status(201).json({ id: lastID });
});

router.delete('/reviews/:id', requireLogin, async (req, res) => {
  const review = await get('SELECT id, author_id FROM reviews WHERE id = ?', [req.params.id]);
  if (!review) return res.status(404).json({ error: 'Not found' });
  if (!canModify(req.user, review.author_id)) return res.status(403).json({ error: 'Forbidden' });
  await run('DELETE FROM reviews WHERE id = ?', [review.id]);
  res.status(204).end();
});

module.exports = router;
