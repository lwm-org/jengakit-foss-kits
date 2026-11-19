/**
 * notes skill — a read tool over the assistant's long-term memory. The built-in
 * `remember` tool writes facts to the `memory` table; this lets the agent look
 * them back up (search or list) as an explicit tool, read-only. Persistence is
 * the jengakit_db SDK's concern — this skill ships zero infra code.
 */
'use strict';

const db = require('../../lib/jengakit_db');

// Build the SQL + params for a notes lookup (pure/testable). Optional {query}
// filters by key/value substring; otherwise returns the most recent notes.
function _buildQuery(args = {}) {
  const q = String(args.query || args.q || '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(args.limit, 10) || 20));
  if (q) return { sql: 'SELECT k, v FROM memory WHERE k LIKE ? OR v LIKE ? ORDER BY id DESC LIMIT ' + limit, params: ['%' + q + '%', '%' + q + '%'] };
  return { sql: 'SELECT k, v FROM memory ORDER BY id DESC LIMIT ' + limit, params: [] };
}

const tool = {
  name: 'notes',
  description: 'Look up facts you saved earlier with remember. Args: {"query":"optional search text","limit":20}. Returns matching saved notes.',
  run: async (args) => {
    const { sql, params } = _buildQuery(args || {});
    try {
      const rows = await db.query(sql, params);
      if (!rows.length) return '(no saved notes' + (args && args.query ? ' matching "' + args.query + '"' : '') + ')';
      return rows.map((r) => '- ' + r.k + ': ' + r.v).join('\n');
    } catch (e) { return 'notes lookup failed: ' + e.message; }
  },
};

module.exports = { name: 'notes', tools: [tool], _buildQuery };
