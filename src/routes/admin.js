const express = require('express');
const { run, all } = require('../db');
const idParam = require('../middleware/idParam');
const { requireRole } = require('../middleware/auth');
const uploads = require('../uploads');

const router = express.Router();
router.param('id', idParam);

router.use(requireRole('admin'));

router.get('/users', async (req, res) => {
  res.json(await all('SELECT id, username, email, phone, role, created_at FROM users ORDER BY id'));
});

router.delete('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  const photos = await all('SELECT photo FROM listings WHERE seller_id = ? AND photo IS NOT NULL', [id]);
  const { changes } = await run('DELETE FROM users WHERE id = ?', [id]);
  if (!changes) return res.status(404).json({ error: 'Not found' });
  await Promise.all(photos.map((p) => uploads.remove(p.photo)));
  res.status(204).end();
});

module.exports = router;
