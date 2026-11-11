process.env.SESSION_SECRET = 'x'.repeat(40);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../src/db');
const app = require('../src/app');

const alice = { username: 'alice', email: 'alice@example.com', password: 'Password123!' };
const login = (agent, u = alice) => agent.post('/api/auth/login').send({ username: u.username, password: u.password });

before(async () => {
  await db.init();
  await db.run("INSERT INTO users (username, email, password_hash, role) VALUES ('root', 'root@example.com', ?, 'admin')",
    [await bcrypt.hash('AdminPass123!', 4)]);
});
after(() => db.close());

test('register stores a bcrypt hash and never returns it', async () => {
  const res = await request(app).post('/api/auth/register').send(alice);
  assert.equal(res.status, 201);
  assert.equal(res.body.password_hash, undefined);
  const row = await db.get('SELECT password_hash, role FROM users WHERE username = ?', ['alice']);
  assert.match(row.password_hash, /^\$2[aby]\$/);
  assert.equal(row.role, 'user');
});

test('register rejects a client-supplied role', async () => {
  const res = await request(app).post('/api/auth/register')
    .send({ username: 'mallory', email: 'm@example.com', password: 'Password123!', role: 'admin' });
  assert.equal(res.status, 400);
});

test('register rejects weak input and duplicates', async () => {
  const weak = await request(app).post('/api/auth/register').send({ ...alice, username: 'bob', password: 'short' });
  assert.equal(weak.status, 400);
  const dup = await request(app).post('/api/auth/register').send(alice);
  assert.equal(dup.status, 409);
});

test('login fails with the same message for wrong password and unknown user', async () => {
  const agent = request.agent(app);
  const wrong = await login(agent, { ...alice, password: 'nope-nope-nope' });
  const unknown = await login(agent, { username: 'ghost', password: 'Password123!' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
});

test('login sets an httpOnly cookie and /me returns the user', async () => {
  const agent = request.agent(app);
  const res = await login(agent);
  assert.equal(res.status, 200);
  assert.match(res.headers['set-cookie'][0], /HttpOnly/i);
  const me = await agent.get('/api/auth/me');
  assert.equal(me.body.username, 'alice');
  assert.equal(me.body.password_hash, undefined);
});

test('logout ends the session', async () => {
  const agent = request.agent(app);
  await login(agent);
  assert.equal((await agent.post('/api/auth/logout')).status, 204);
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('access control: admin route rejects anonymous (401) and normal users (403)', async () => {
  assert.equal((await request(app).get('/api/admin/users')).status, 401);
  const agent = request.agent(app);
  await login(agent);
  assert.equal((await agent.get('/api/admin/users')).status, 403);
});

test('access control: admin can list users, without password hashes', async () => {
  const agent = request.agent(app);
  await login(agent, { username: 'root', password: 'AdminPass123!' });
  const res = await agent.get('/api/admin/users');
  assert.equal(res.status, 200);
  assert.ok(res.body.length >= 2);
  assert.ok(res.body.every((u) => u.password_hash === undefined));
});
