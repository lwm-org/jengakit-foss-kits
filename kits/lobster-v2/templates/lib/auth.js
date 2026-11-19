/**
 * auth.js — multi-user auth for lobster-v2. PBKDF2 password hashing, opaque
 * session tokens, cookie parsing, and a first-boot admin bootstrap. Users persist
 * in jengakit_db; session tokens live in-process (re-login after a restart).
 * Zero infra code — persistence is the SDK's concern.
 */
'use strict';

const crypto = require('crypto');

const ITER = 120000, KEYLEN = 32, DIGEST = 'sha256';

// Hash a password with a per-user random salt. Returns hex {salt, hash}.
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.pbkdf2Sync(String(password), s, ITER, KEYLEN, DIGEST).toString('hex');
  return { salt: s, hash: h };
}

// Constant-time verify.
function verifyPassword(password, salt, hash) {
  try {
    const h = crypto.pbkdf2Sync(String(password), salt, ITER, KEYLEN, DIGEST);
    const want = Buffer.from(hash, 'hex');
    return h.length === want.length && crypto.timingSafeEqual(h, want);
  } catch (e) { return false; }
}

function newToken() { return crypto.randomBytes(32).toString('hex'); }

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Persist the users table + ensure an admin exists. If no admin is present, one
// is created from LOBSTER_ADMIN_USER/LOBSTER_ADMIN_PASSWORD (a random password is
// generated + returned once when none is supplied, so it can be logged). Idempotent.
async function ensureSchema(db) {
  await db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, role TEXT DEFAULT 'user', created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
}

async function bootstrapAdmin(db, env = process.env) {
  const user = env.LOBSTER_ADMIN_USER || 'admin';
  const existing = await db.query('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
  if (existing.length) return { created: false, username: user };
  let password = env.LOBSTER_ADMIN_PASSWORD || '';
  let generated = false;
  if (!password) { password = crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12); generated = true; }
  const { salt, hash } = hashPassword(password);
  await db.run('INSERT INTO users (username, salt, hash, role) VALUES (?, ?, ?, ?)', [user, salt, hash, 'admin']);
  return { created: true, username: user, password: generated ? password : undefined, generated };
}

async function createUser(db, username, password, role) {
  const u = String(username || '').trim();
  if (!u) throw new Error('username required');
  if (String(password || '').length < 6) throw new Error('password must be at least 6 characters');
  const { salt, hash } = hashPassword(password);
  await db.run('INSERT INTO users (username, salt, hash, role) VALUES (?, ?, ?, ?)', [u, salt, hash, role === 'admin' ? 'admin' : 'user']);
  return { username: u, role: role === 'admin' ? 'admin' : 'user' };
}

async function authenticate(db, username, password) {
  const rows = await db.query('SELECT username, salt, hash, role FROM users WHERE username = ? LIMIT 1', [String(username || '')]);
  const u = rows[0];
  if (!u || !verifyPassword(password, u.salt, u.hash)) return null;
  return { username: u.username, role: u.role };
}

module.exports = { hashPassword, verifyPassword, newToken, parseCookies, ensureSchema, bootstrapAdmin, createUser, authenticate };
