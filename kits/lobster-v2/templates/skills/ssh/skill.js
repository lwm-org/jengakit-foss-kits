/**
 * ssh skill — run a command on a remote host over SSH. lobster v1's standout
 * capability, ported as a proper autonomy-gated, allowlist-guarded, audited tool.
 *
 * SAFETY: the tool is OFF unless LOBSTER_SSH_HOSTS is set, and it will only touch
 * a host on that allowlist. It is side-effecting, so read-only autonomy blocks it,
 * and (like every side-effecting tool) each run is written to the audit trail.
 *
 * Config (operator env):
 *   LOBSTER_SSH_HOSTS     — comma-separated allowlist. Each entry is "host",
 *                           "user@host", or "label=user@host" (a friendly alias).
 *   LOBSTER_SSH_KEY       — private key (PEM) for auth (preferred), OR
 *   LOBSTER_SSH_PASSWORD  — password for auth
 *   LOBSTER_SSH_USER      — default user when an entry omits one (default: root)
 *   LOBSTER_SSH_PORT      — default port (default: 22)
 *
 * Runs in-process inside this sandboxed container — no shell wrapper, no infra.
 */
'use strict';

// Parse the allowlist env into { label -> {user, host} } plus a set of allowed
// user@host strings. Pure/testable.
function _parseAllowlist(raw, defUser) {
  const map = {};
  String(raw || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((entry) => {
    let label = null, target = entry;
    const eq = entry.indexOf('=');
    if (eq > 0) { label = entry.slice(0, eq).trim(); target = entry.slice(eq + 1).trim(); }
    const at = target.indexOf('@');
    const user = at > 0 ? target.slice(0, at) : (defUser || 'root');
    const host = at > 0 ? target.slice(at + 1) : target;
    const rec = { user, host };
    map[host] = rec;
    if (label) map[label] = rec;
    map[user + '@' + host] = rec;
  });
  return map;
}

// Resolve a requested host/label against the allowlist. Returns {user, host} or
// null if not allowed. Pure/testable.
function _resolve(requested, allowlist) {
  const r = String(requested || '').trim();
  if (!r) return null;
  if (allowlist[r]) return allowlist[r];
  // allow "user@host" where host is allowed and user matches
  const at = r.indexOf('@');
  if (at > 0) { const host = r.slice(at + 1); if (allowlist[host] && allowlist[host].user === r.slice(0, at)) return allowlist[host]; }
  return null;
}

function _allowlist() { return _parseAllowlist(process.env.LOBSTER_SSH_HOSTS, process.env.LOBSTER_SSH_USER); }

async function _exec(target, command) {
  let Client;
  try { Client = require('ssh2').Client; } catch (e) { return 'error: ssh2 module not available (' + e.message + ')'; }
  return new Promise((resolve) => {
    const conn = new Client();
    const auth = { host: target.host, port: parseInt(process.env.LOBSTER_SSH_PORT || '22', 10), username: target.user, readyTimeout: 12000 };
    if (process.env.LOBSTER_SSH_KEY) auth.privateKey = process.env.LOBSTER_SSH_KEY;
    else if (process.env.LOBSTER_SSH_PASSWORD) auth.password = process.env.LOBSTER_SSH_PASSWORD;
    let out = '', done = false;
    const finish = (s) => { if (!done) { done = true; try { conn.end(); } catch (e) {} resolve(s); } };
    const guard = setTimeout(() => finish((out || '') + '\n(timed out)'), 20000);
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { clearTimeout(guard); return finish('exec error: ' + err.message); }
        stream.on('close', () => { clearTimeout(guard); finish(out.slice(0, 3000) || '(no output)'); })
          .on('data', (d) => { out += d.toString(); })
          .stderr.on('data', (d) => { out += d.toString(); });
      });
    }).on('error', (e) => { clearTimeout(guard); finish('connection error: ' + e.message); })
      .connect(auth);
  });
}

const tool = {
  name: 'ssh',
  description: 'Run a command on an allowlisted remote host over SSH. Args: {"host":"label-or-host","command":"the command"}. Only hosts on the operator allowlist are reachable.',
  sideEffecting: true,
  run: async (args = {}) => {
    const allow = _allowlist();
    if (!Object.keys(allow).length) return 'ssh is not configured (set LOBSTER_SSH_HOSTS to an allowlist to enable it)';
    const target = _resolve(args.host || args.h, allow);
    if (!target) return 'host not allowed. Allowed: ' + Object.keys(allow).filter((k) => k.indexOf('@') < 0).join(', ');
    const command = String(args.command || args.cmd || args._raw || '').trim();
    if (!command) return 'a command is required';
    return _exec(target, command);
  },
};

module.exports = { name: 'ssh', tools: [tool], _parseAllowlist, _resolve };
