const bcrypt = require('bcrypt');
const { run, init, close } = require('./db');

// Demo passwords
const PASSWORDS = { admin: 'AdminPass123!', user: 'UserPass123!' };

const USERS = [
  ['alice', 'alice@example.com', '+44 7700 900001', 'admin'],
  ['bob', 'bob@example.com', '+44 7700 900002', 'admin'],
  ['carol', 'carol@example.com', '+44 7700 900003', 'user'],
  ['dave', 'dave@example.com', '+44 7700 900004', 'user'],
  ['erin', 'erin@example.com', '+44 7700 900005', 'user'],
  ['frank', 'frank@example.com', '+44 7700 900006', 'user'],
];

// [seller, title, description, price in cents, status]
const LISTINGS = [
  ['carol', 'Vintage film camera', 'Pentax K1000, works perfectly, includes 50mm lens.', 18000, 'active'],
  ['carol', 'Mountain bike', '2019 hardtail, 27.5in wheels, recently serviced.', 32000, 'active'],
  ['dave', 'Gaming laptop', '16GB RAM, RTX 3060, small scratch on the lid.', 65000, 'active'],
  ['dave', 'Standing desk', 'Electric height adjustable, 140x70cm, oak top.', 22000, 'sold'],
  ['erin', 'Acoustic guitar', 'Yamaha F310 with gig bag and spare strings.', 9500, 'active'],
  ['erin', 'Board game bundle', 'Catan, Ticket to Ride and Carcassonne, all complete.', 6000, 'active'],
  ['frank', 'Textbook set', 'Year 3 Computer Science textbooks, lightly highlighted.', 4500, 'active'],
  ['frank', 'Office chair', 'Ergonomic mesh chair, lumbar support, 2 years old.', 7500, 'active'],
];

// [listing index, buyer, amount in cents, message, status]
const OFFERS = [
  [0, 'dave', 15000, 'Would you take 150?', 'pending'],
  [0, 'erin', 16500, 'Can collect this weekend.', 'pending'],
  [1, 'frank', 28000, 'Is the frame size medium?', 'rejected'],
  [2, 'carol', 60000, 'Cash on collection?', 'pending'],
  [3, 'erin', 21000, 'Deal, I will pick it up today.', 'accepted'],
  [4, 'frank', 8000, 'Does it come with a capo?', 'pending'],
  [6, 'carol', 4000, 'Offering 40 for the set.', 'pending'],
  [7, 'dave', 7000, 'Still available?', 'pending'],
];

// [seller, author, rating, body]
const REVIEWS = [
  ['carol', 'dave', 5, 'Great seller, item exactly as described.'],
  ['carol', 'erin', 4, 'Quick replies, slightly late to the meetup.'],
  ['dave', 'frank', 5, 'Smooth deal, would buy again.'],
  ['erin', 'carol', 3, 'Item was fine but packaging was poor.'],
  ['frank', 'erin', 5, 'Friendly and honest about the condition.'],
  ['frank', 'dave', 4, 'Good value, fast handover.'],
];

(async () => {
  await init();
  for (const table of ['reviews', 'offers', 'listings', 'users']) await run(`DELETE FROM ${table}`);

  const id = {};
  for (const [username, email, phone, role] of USERS) {
    const hash = await bcrypt.hash(PASSWORDS[role], 12);
    id[username] = (await run(
      'INSERT INTO users (username, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [username, email, phone, hash, role])).lastID;
  }

  const listingIds = [];
  for (const [seller, title, description, price, status] of LISTINGS) {
    listingIds.push((await run(
      'INSERT INTO listings (seller_id, title, description, price_cents, status) VALUES (?, ?, ?, ?, ?)',
      [id[seller], title, description, price, status])).lastID);
  }

  for (const [i, buyer, amount, message, status] of OFFERS) {
    await run(
      'INSERT INTO offers (listing_id, buyer_id, amount_cents, message, status) VALUES (?, ?, ?, ?, ?)',
      [listingIds[i], id[buyer], amount, message, status]);
  }

  for (const [seller, author, rating, body] of REVIEWS) {
    await run('INSERT INTO reviews (seller_id, author_id, rating, body) VALUES (?, ?, ?, ?)',
      [id[seller], id[author], rating, body]);
  }

  const total = USERS.length + LISTINGS.length + OFFERS.length + REVIEWS.length;
  console.log(`Seeded ${total} records (${USERS.length} users).`);
  await close();
})().catch((err) => { console.error(err); process.exit(1); });
