const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.SESSION_SECRET = 'x'.repeat(40);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-uploads-'));

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../src/db');
const app = require('../src/app');

const PASSWORD = 'Password123!';
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32)]);
const users = {};

async function makeUser(username, role = 'user') {
  await request(app).post('/api/auth/register').send({ username, email: `${username}@example.com`, password: PASSWORD });
  if (role === 'admin') await db.run("UPDATE users SET role = 'admin' WHERE username = ?", [username]);
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password: PASSWORD });
  users[username] = { agent, id: res.body.id };
}

const newListing = async (owner, title = 'Test bike') =>
  (await users[owner].agent.post('/api/listings').send({ title, description: 'Good condition', price_cents: 5000 })).body;

before(async () => {
  await db.init();
  await makeUser('seller');
  await makeUser('buyer');
  await makeUser('other');
  await makeUser('boss', 'admin');
});
after(async () => {
  await db.close();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

test('search: matches title, is case-insensitive, and is not injectable', async () => {
  await newListing('seller', 'Red Bicycle');
  const hit = await request(app).get('/api/listings?q=bicycle');
  assert.ok(hit.body.some((l) => l.title === 'Red Bicycle'));
  const sqli = await request(app).get('/api/listings').query({ q: "' OR 1=1 --" });
  assert.equal(sqli.status, 200);
  assert.equal(sqli.body.length, 0);
  const wildcard = await request(app).get('/api/listings').query({ q: '%' });
  assert.equal(wildcard.body.length, 0);
});

test('search: max_price filters, and a non-numeric price is rejected', async () => {
  await users.seller.agent.post('/api/listings').send({ title: 'Cheap lamp', description: 'ok', price_cents: 500 });
  await users.seller.agent.post('/api/listings').send({ title: 'Costly lamp', description: 'ok', price_cents: 90000 });
  const res = await request(app).get('/api/listings').query({ q: 'lamp', max_price: 1000 });
  assert.deepEqual(res.body.map((l) => l.title), ['Cheap lamp']);
  assert.equal((await request(app).get('/api/listings').query({ max_price: 'abc' })).status, 400);
});

test('listing creation requires login and valid input', async () => {
  assert.equal((await request(app).post('/api/listings').send({})).status, 401);
  const bad = await users.seller.agent.post('/api/listings').send({ title: 'x', description: '', price_cents: -5 });
  assert.equal(bad.status, 400);
  const extra = await users.seller.agent.post('/api/listings')
    .send({ title: 'Valid title', description: 'ok', price_cents: 100, seller_id: users.buyer.id });
  assert.equal(extra.status, 400);
});

test('access control: only the owner or an admin can edit or delete a listing (IDOR)', async () => {
  const listing = await newListing('seller');
  const body = { title: 'Hijacked!', description: 'x', price_cents: 1 };
  assert.equal((await users.other.agent.put(`/api/listings/${listing.id}`).send(body)).status, 403);
  assert.equal((await users.other.agent.delete(`/api/listings/${listing.id}`)).status, 403);
  assert.equal((await request(app).delete(`/api/listings/${listing.id}`)).status, 401);
  assert.equal((await request(app).get(`/api/listings/${listing.id}`)).body.title, 'Test bike');
  assert.equal((await users.seller.agent.put(`/api/listings/${listing.id}`).send({ ...body, title: 'Updated' })).status, 200);
  assert.equal((await users.boss.agent.delete(`/api/listings/${listing.id}`)).status, 204);
});

test('invalid ids are rejected', async () => {
  assert.equal((await request(app).get('/api/listings/abc')).status, 400);
  assert.equal((await request(app).get('/api/listings/99999')).status, 404);
});

test('access control: offers are private to buyer, seller and admin', async () => {
  const listing = await newListing('seller');
  const offer = (await users.buyer.agent.post(`/api/listings/${listing.id}/offers`).send({ amount_cents: 4000 })).body;
  assert.equal((await users.other.agent.get(`/api/offers/${offer.id}`)).status, 404);
  assert.equal((await users.other.agent.patch(`/api/offers/${offer.id}`).send({ status: 'accepted' })).status, 404);
  assert.equal((await users.other.agent.delete(`/api/offers/${offer.id}`)).status, 404);
  assert.equal((await request(app).get(`/api/offers/${offer.id}`)).status, 401);
  const others = await users.other.agent.get('/api/offers');
  assert.ok(!others.body.some((o) => o.id === offer.id));
  for (const who of ['buyer', 'seller', 'boss']) {
    assert.equal((await users[who].agent.get(`/api/offers/${offer.id}`)).status, 200);
  }
});

test('access control: only the seller can answer an offer, and accepting sells the listing', async () => {
  const listing = await newListing('seller');
  const offer = (await users.buyer.agent.post(`/api/listings/${listing.id}/offers`).send({ amount_cents: 4000 })).body;
  assert.equal((await users.buyer.agent.patch(`/api/offers/${offer.id}`).send({ status: 'accepted' })).status, 403);
  assert.equal((await users.seller.agent.patch(`/api/offers/${offer.id}`).send({ status: 'accepted' })).status, 200);
  assert.equal((await request(app).get(`/api/listings/${listing.id}`)).body.status, 'sold');
  assert.equal((await users.seller.agent.patch(`/api/offers/${offer.id}`).send({ status: 'rejected' })).status, 409);
  assert.equal((await users.other.agent.post(`/api/listings/${listing.id}/offers`).send({ amount_cents: 1 })).status, 409);
});

test('offers: cannot bid on your own listing or send a negative amount', async () => {
  const listing = await newListing('seller');
  assert.equal((await users.seller.agent.post(`/api/listings/${listing.id}/offers`).send({ amount_cents: 100 })).status, 403);
  assert.equal((await users.buyer.agent.post(`/api/listings/${listing.id}/offers`).send({ amount_cents: -1 })).status, 400);
});

test('reviews: no self-review, no duplicates, only the author or an admin can delete', async () => {
  const body = { rating: 5, body: '<script>alert(1)</script>' };
  assert.equal((await users.seller.agent.post(`/api/users/${users.seller.id}/reviews`).send(body)).status, 403);
  const created = await users.buyer.agent.post(`/api/users/${users.seller.id}/reviews`).send(body);
  assert.equal(created.status, 201);
  assert.equal((await users.buyer.agent.post(`/api/users/${users.seller.id}/reviews`).send(body)).status, 409);
  assert.equal((await users.buyer.agent.post(`/api/users/${users.seller.id}/reviews`).send({ ...body, rating: 9 })).status, 400);
  const list = await request(app).get(`/api/users/${users.seller.id}/reviews`);
  assert.equal(list.body[0].body, body.body);
  assert.equal((await users.other.agent.delete(`/api/reviews/${created.body.id}`)).status, 403);
  assert.equal((await users.buyer.agent.delete(`/api/reviews/${created.body.id}`)).status, 204);
});

test('upload: only the owner can upload, and only real images are stored', async () => {
  const listing = await newListing('seller');
  const url = `/api/listings/${listing.id}/photo`;
  const send = (agent, buf, name = 'pic.png') => agent.post(url).attach('photo', buf, { filename: name, contentType: 'image/png' });

  assert.equal((await send(users.other.agent, PNG)).status, 403);
  const fake = await send(users.seller.agent, Buffer.from('<script>alert(1)</script>'), 'evil.png');
  assert.equal(fake.status, 415);
  const big = await send(users.seller.agent, Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]));
  assert.equal(big.status, 413);

  const ok = await send(users.seller.agent, PNG, '../../etc/passwd.png');
  assert.equal(ok.status, 200);
  assert.match(ok.body.photo, /^[0-9a-f-]{36}\.png$/);
  const served = await request(app).get(`/uploads/${ok.body.photo}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers['x-content-type-options'], 'nosniff');
});

test('access control: only admins can delete users, and not themselves', async () => {
  await makeUser('victim');
  assert.equal((await users.other.agent.delete(`/api/admin/users/${users.victim.id}`)).status, 403);
  assert.equal((await users.boss.agent.delete(`/api/admin/users/${users.boss.id}`)).status, 400);
  assert.equal((await users.boss.agent.delete(`/api/admin/users/${users.victim.id}`)).status, 204);
  assert.equal((await users.boss.agent.delete(`/api/admin/users/${users.victim.id}`)).status, 404);
});

test('malformed JSON returns 400, not 500', async () => {
  const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
  assert.equal(res.status, 400);
});
