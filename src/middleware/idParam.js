module.exports = (req, res, next, value) =>
  /^[1-9]\d{0,8}$/.test(value) ? next() : res.status(400).json({ error: 'Invalid id' });
