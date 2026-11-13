const express = require('express');
const { z } = require('zod');
const { run, get, all } = require('../db');
const validate = require('../middleware/validate');
const idParam = require('../middleware/idParam');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
router.param('id', idParam);

const SELECT = `SELECT o.id, o.listing_id, l.title AS listing_title, l.seller_id, o.buyer_id,
  b.username AS buyer, o.amount_cents, o.message, o.status, o.created_at
  FROM offers o JOIN listings l ON l.id = o.listing_id JOIN users b ON b.id = o.buyer_id`;

const createSchema = z.strictObject({
  amount_cents: z.number().int().positive().max(100_000_000),
  message: z.string().trim().max(500).optional(),
});
const statusSchema = z.strictObject({ status: z.enum(['accepted', 'rejected']) });

// Offers are private: non-participants get 404, so they cannot even learn that an id exists.
const loadOffer = async (req, res, next) => {
  const offer = await get(`${SELECT} WHERE o.id = ?`, [req.params.id]);
  const u = req.user;
  if (!offer || !(u.role === 'admin' || u.id === offer.buyer_id || u.id === offer.seller_id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  req.offer = offer;
  next();
};

router.post('/listings/:id/offers', requireLogin, validate(createSchema), async (req, res) => {
  const listing = await get('SELECT id, seller_id, status FROM listings WHERE id = ?', [req.params.id]);
  if (!listing) return res.status(404).json({ error: 'Not found' });
  if (listing.seller_id === req.user.id) return res.status(403).json({ error: 'You cannot make an offer on your own listing' });
  if (listing.status !== 'active') return res.status(409).json({ error: 'Listing is no longer available' });
  const { amount_cents, message } = req.body;
  const { lastID } = await run(
    'INSERT INTO offers (listing_id, buyer_id, amount_cents, message) VALUES (?, ?, ?, ?)',
    [listing.id, req.user.id, amount_cents, message ?? null]);
  res.status(201).json(await get(`${SELECT} WHERE o.id = ?`, [lastID]));
});

// Offers I made or received; admins see all.
router.get('/offers', requireLogin, async (req, res) => {
  const rows = req.user.role === 'admin'
    ? await all(`${SELECT} ORDER BY o.id DESC`)
    : await all(`${SELECT} WHERE o.buyer_id = ? OR l.seller_id = ? ORDER BY o.id DESC`, [req.user.id, req.user.id]);
  res.json(rows);
});

router.get('/offers/:id', requireLogin, loadOffer, (req, res) => res.json(req.offer));

router.patch('/offers/:id', requireLogin, loadOffer, validate(statusSchema), async (req, res) => {
  const { offer, user } = req;
  if (user.id !== offer.seller_id && user.role !== 'admin') return res.status(403).json({ error: 'Only the seller can answer an offer' });
  if (offer.status !== 'pending') return res.status(409).json({ error: 'Offer already answered' });
  const { status } = req.body;
  if (status === 'accepted') {
    // Atomic claim: only one offer can mark the listing sold.
    const claim = await run("UPDATE listings SET status = 'sold' WHERE id = ? AND status = 'active'", [offer.listing_id]);
    if (!claim.changes) return res.status(409).json({ error: 'Listing is no longer available' });
  }
  await run('UPDATE offers SET status = ? WHERE id = ?', [status, offer.id]);
  res.json(await get(`${SELECT} WHERE o.id = ?`, [offer.id]));
});

router.delete('/offers/:id', requireLogin, loadOffer, async (req, res) => {
  const { offer, user } = req;
  if (user.id !== offer.buyer_id && user.role !== 'admin') return res.status(403).json({ error: 'Only the buyer can withdraw an offer' });
  await run('DELETE FROM offers WHERE id = ?', [offer.id]);
  res.status(204).end();
});

module.exports = router;
