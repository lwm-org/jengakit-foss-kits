/**
 * open-design skill — integrate a connected Open-Design instance (the OpenClaw
 * graphic-design editor, github.com/clawnify/open-design) so the agent can
 * create, list, and inspect designs on the user's behalf.
 *
 * Talks to the instance's HTTP API (no auth): /api/designs, /api/templates —
 * exactly like the http-tool skill, self-contained, no core edits. Config:
 * LOBSTER_OPENDESIGN_URL = the base URL of a running open-design server. Tools
 * that create or change a design are side-effecting (blocked in readonly mode);
 * the list/get/templates tools are read-only.
 */
'use strict';

const MAX_BODY = 4000;

// Read + normalize the configured base URL (pure — testable). Trailing
// slashes are trimmed so `base + '/api/...'` never doubles up.
function _base(env) {
  return String((env || process.env).LOBSTER_OPENDESIGN_URL || '').trim().replace(/\/+$/, '');
}

// Build the {url, options} for one API call (pure — testable without the
// network). Throws a clear, actionable error when the instance isn't configured.
function _buildRequest(base, method, apiPath, body) {
  if (!base || !/^https?:\/\//i.test(base)) {
    throw new Error('open-design is not configured — set LOBSTER_OPENDESIGN_URL to your instance URL');
  }
  const options = { method: String(method).toUpperCase(), headers: {} };
  if (body != null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  return { url: base + apiPath, options };
}

async function _call(method, apiPath, body) {
  let req;
  try { req = _buildRequest(_base(), method, apiPath, body); } catch (e) { return 'error: ' + e.message; }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(req.url, Object.assign({ signal: ctrl.signal }, req.options));
    clearTimeout(timer);
    const text = (await r.text()).slice(0, MAX_BODY);
    return 'HTTP ' + r.status + '\n' + text;
  } catch (e) { return 'request failed: ' + e.message; }
}

const tools = [
  {
    name: 'design_list',
    description: 'List the graphic designs on the connected Open-Design instance, most recent first. Args: {}.',
    run: async () => _call('GET', '/api/designs'),
  },
  {
    name: 'design_get',
    description: 'Fetch one design and its pages by id. Args: {"id":"<design id>"}.',
    run: async (args) => {
      const id = String((args && (args.id || args._raw)) || '').trim();
      if (!id) return 'error: an id is required';
      return _call('GET', '/api/designs/' + encodeURIComponent(id));
    },
  },
  {
    name: 'design_templates',
    description: 'List the design templates available on the connected Open-Design instance. Args: {}.',
    run: async () => _call('GET', '/api/templates'),
  },
  {
    name: 'design_create',
    description: 'Create a new graphic design (e.g. a social post). Args: {"name":"...","width":1080,"height":1080}. Returns the created design; open the instance URL to edit it in the editor.',
    sideEffecting: true,
    run: async (args) => {
      const a = args || {};
      const body = {};
      if (a.name || a._raw) body.name = String(a.name || a._raw);
      if (a.width != null) body.width = Number(a.width);
      if (a.height != null) body.height = Number(a.height);
      return _call('POST', '/api/designs', body);
    },
  },
  {
    name: 'design_update',
    description: 'Rename or resize an existing design. Args: {"id":"<design id>","name":"...","width":1080,"height":1080}.',
    sideEffecting: true,
    run: async (args) => {
      const a = args || {};
      const id = String(a.id || '').trim();
      if (!id) return 'error: an id is required';
      const body = {};
      if (a.name != null) body.name = String(a.name);
      if (a.width != null) body.width = Number(a.width);
      if (a.height != null) body.height = Number(a.height);
      return _call('PUT', '/api/designs/' + encodeURIComponent(id), body);
    },
  },
];

module.exports = { name: 'open-design', tools, _base, _buildRequest };
