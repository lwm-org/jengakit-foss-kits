/**
 * http-tool skill — gives the agent an outbound HTTP tool so it can fetch web
 * pages / call APIs from inside its sandbox. Self-contained, no core edits.
 *
 * Side-effecting (it reaches the network), so it is autonomy-gated: blocked when
 * the kit runs in readonly mode. Responses are truncated to keep the agent's
 * context bounded.
 */
'use strict';

const MAX_BODY = 4000;

// Build the {url, options} for a fetch from tool args (pure — testable without
// touching the network). Supports method, headers, and a JSON or raw body.
function _buildRequest(args = {}) {
  const url = String(args.url || args.u || args._raw || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('a valid http(s) url is required');
  const method = String(args.method || (args.body || args.json ? 'POST' : 'GET')).toUpperCase();
  const headers = Object.assign({}, args.headers || {});
  const options = { method, headers };
  if (args.json != null) { headers['Content-Type'] = headers['Content-Type'] || 'application/json'; options.body = typeof args.json === 'string' ? args.json : JSON.stringify(args.json); }
  else if (args.body != null) { options.body = String(args.body); }
  return { url, options };
}

const tool = {
  name: 'http',
  description: 'Make an HTTP request to fetch a web page or call an API. Args: {"url":"https://...","method":"GET|POST","headers":{},"json":{...} or "body":"..."}. Returns status + truncated response body.',
  sideEffecting: true,
  run: async (args) => {
    let req;
    try { req = _buildRequest(args); } catch (e) { return 'error: ' + e.message; }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(req.url, Object.assign({ signal: ctrl.signal }, req.options));
      clearTimeout(timer);
      const text = (await r.text()).slice(0, MAX_BODY);
      return 'HTTP ' + r.status + ' ' + (r.headers.get('content-type') || '') + '\n' + text;
    } catch (e) { return 'request failed: ' + e.message; }
  },
};

module.exports = { name: 'http-tool', tools: [tool], _buildRequest };
