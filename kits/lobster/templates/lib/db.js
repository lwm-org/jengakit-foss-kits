const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || '/data/lobster.db';

// Ensure the directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('better-sqlite3 not available:', e.message);
  // Provide no-op fallbacks so the server still starts
  module.exports = {
    initDb: () => {},
    getOrCreateSession: (name) => name,
    addMessage: () => {},
    getMessages: () => [],
    addMemory: () => {},
    getMemory: () => [],
    getSessions: () => [],
    addLog: () => {},
    getLogs: () => [],
    getPodConfig: () => null,
    setPodConfig: () => {},
    getOrCreatePodKeypair: async () => ({ privateKey: '', publicKey: '' }),
    listSshHosts: () => [],
    addSshHost: () => ({ id: 0 }),
    deleteSshHost: () => {},
    createUser: () => ({}),
    listUsers: () => [],
    getUserByUsername: () => null,
    updateUserPassword: () => {},
    deleteUser: () => {},
    verifyUserPassword: () => false,
  };
  return;
}

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pod_config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ssh_hosts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      label      TEXT NOT NULL,
      hostname   TEXT NOT NULL,
      port       INTEGER NOT NULL DEFAULT 22,
      username   TEXT NOT NULL DEFAULT 'root',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt          TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);
}

function getOrCreateSession(name) {
  const d = getDb();
  let row = d.prepare('SELECT id FROM sessions WHERE name = ?').get(name);
  if (!row) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    d.prepare('INSERT INTO sessions (id, name) VALUES (?, ?)').run(id, name);
    return id;
  }
  return row.id;
}

function getSessions() {
  return getDb().prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
}

function addMessage(sessionId, role, content) {
  getDb().prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)').run(sessionId, role, content);
}

function getMessages(sessionId, limit = 10) {
  const rows = getDb().prepare(
    'SELECT role, content FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?'
  ).all(sessionId, limit);
  return rows.reverse();
}

function addMemory(key, value) {
  getDb().prepare(
    'INSERT INTO memory (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, created_at = datetime(\'now\')'
  ).run(key, value);
}

function getMemory() {
  return getDb().prepare('SELECT * FROM memory ORDER BY created_at DESC').all();
}

function addLog(level, message) {
  try {
    getDb().prepare('INSERT INTO logs (level, message) VALUES (?, ?)').run(level, message);
  } catch (e) {
    // Silently ignore log errors to not crash the server
  }
}

function getLogs(limit = 50) {
  return getDb().prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ?').all(limit).reverse();
}

// ── Pod config (keypair storage) ──────────────────────────────────────────────

function getPodConfig(key) {
  const row = getDb().prepare('SELECT value FROM pod_config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setPodConfig(key, value) {
  getDb().prepare(
    'INSERT INTO pod_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

function getOrCreatePodKeypair() {
  const existingPriv = getPodConfig('ssh_private_key');
  const existingPub  = getPodConfig('ssh_public_key');
  if (existingPriv && existingPub) {
    return Promise.resolve({ privateKey: existingPriv, publicKey: existingPub });
  }
  return new Promise((resolve, reject) => {
    const { utils } = require('ssh2');
    utils.generateKeyPair('ed25519', {}, (err, keys) => {
      if (err) return reject(err);
      setPodConfig('ssh_private_key', keys.private);
      setPodConfig('ssh_public_key',  keys.public);
      resolve({ privateKey: keys.private, publicKey: keys.public });
    });
  });
}

// ── SSH Hosts ─────────────────────────────────────────────────────────────────

function listSshHosts() {
  return getDb().prepare(
    'SELECT id, label, hostname, port, username, created_at FROM ssh_hosts ORDER BY id ASC'
  ).all();
}

function addSshHost(label, hostname, port, username) {
  const info = getDb().prepare(
    'INSERT INTO ssh_hosts (label, hostname, port, username) VALUES (?, ?, ?, ?)'
  ).run(label, hostname, port || 22, username || 'root');
  return { id: info.lastInsertRowid, label, hostname, port: port || 22, username: username || 'root' };
}

function deleteSshHost(id) {
  getDb().prepare('DELETE FROM ssh_hosts WHERE id = ?').run(id);
}

// ── Users ─────────────────────────────────────────────────────────────────────

function createUser(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  const info = getDb().prepare(
    'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)'
  ).run(username, hash, salt);
  const row = getDb().prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
  return { id: row.id, username: row.username, created_at: row.created_at };
}

function listUsers() {
  return getDb().prepare('SELECT id, username, created_at FROM users ORDER BY id ASC').all();
}

function getUserByUsername(username) {
  return getDb().prepare('SELECT id, username, password_hash, salt FROM users WHERE username = ?').get(username);
}

function updateUserPassword(id, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  getDb().prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, id);
}

function deleteUser(id) {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
}

function verifyUserPassword(username, password) {
  const row = getUserByUsername(username);
  if (!row) return false;
  const hash = crypto.pbkdf2Sync(password, row.salt, 100000, 64, 'sha512').toString('hex');
  return hash === row.password_hash;
}

module.exports = {
  initDb,
  getOrCreateSession,
  getSessions,
  addMessage,
  getMessages,
  addMemory,
  getMemory,
  addLog,
  getLogs,
  getPodConfig,
  setPodConfig,
  getOrCreatePodKeypair,
  listSshHosts,
  addSshHost,
  deleteSshHost,
  createUser,
  listUsers,
  getUserByUsername,
  updateUserPassword,
  deleteUser,
  verifyUserPassword,
};
