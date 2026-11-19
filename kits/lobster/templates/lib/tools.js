'use strict';
const axios = require('axios');

// ── ssh_exec ──────────────────────────────────────────────────────────────────
async function sshExec({ hostLabel, command, addLog }) {
  const db = require('./db');

  const hosts = db.listSshHosts();
  const host = hosts.find(h =>
    h.label.toLowerCase() === String(hostLabel).toLowerCase() ||
    h.hostname.toLowerCase() === String(hostLabel).toLowerCase()
  );
  if (!host) {
    return `Error: SSH host "${hostLabel}" not found in saved hosts list.`;
  }

  const keypair = await db.getOrCreatePodKeypair();
  if (!keypair.privateKey) {
    return `Error: Pod keypair not available. Restart the pod to generate a keypair.`;
  }

  if (addLog) addLog('info', `SSH [${host.label}] executing: ${command}`);

  return new Promise((resolve) => {
    let Client;
    try { Client = require('ssh2').Client; } catch (e) {
      return resolve(`Error: ssh2 module not available — ${e.message}`);
    }

    const conn = new Client();
    let stdout = '';
    let stderr = '';
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch (_) {}
      resolve(result);
    };

    const timer = setTimeout(() => done('Error: SSH command timed out after 15s'), 15000);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { clearTimeout(timer); return done(`Error: ${err.message}`); }
        stream.on('close', (code) => {
          clearTimeout(timer);
          const out = [
            `Exit: ${code}`,
            stdout ? `STDOUT:\n${stdout.trim()}` : null,
            stderr ? `STDERR:\n${stderr.trim()}` : null,
          ].filter(Boolean).join('\n');
          if (addLog) addLog('info', `SSH [${host.label}] exit ${code}: ${stdout.slice(0, 120)}`);
          done(out);
        });
        stream.on('data', d => { stdout += d; });
        stream.stderr.on('data', d => { stderr += d; });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      done(`Error: SSH connection failed — ${err.message}`);
    });

    conn.connect({
      host:         host.hostname,
      port:         host.port || 22,
      username:     host.username || 'root',
      privateKey:   keypair.privateKey,
      readyTimeout: 10000,
    });
  });
}

// ── Tool registry ─────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'web_fetch',
    description: 'Fetch content from a URL',
    async execute({ url }) {
      try {
        const res = await axios.get(url, { timeout: 5000 });
        return String(res.data).slice(0, 2000);
      } catch (e) {
        return 'Error: ' + e.message;
      }
    },
  },
  {
    name: 'ssh_exec',
    description: 'Execute a shell command on a saved SSH host',
    execute: sshExec,
  },
];

module.exports = { tools, sshExec };
