const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { dbPath } = require('./config');

const db = new sqlite3.Database(dbPath);

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes });
    }));

const get = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

const all = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

const init = () =>
  new Promise((resolve, reject) =>
    db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'), (err) =>
      err ? reject(err) : resolve()));

const close = () => new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));

module.exports = { run, get, all, init, close };
