/**
 * skills.js — the skill loader (nanoclaw's "every customization is a skill",
 * ported to a single-container kit). Scans a directory of self-contained skills
 * and returns the tools + channels they register — WITHOUT editing core.
 *
 * A skill is a folder `skills/<name>/skill.js` exporting:
 *   {
 *     name: 'my-skill',
 *     tools?:   [ { name, description, sideEffecting?, run(args)->string } ],
 *     channel?: { register(app, deps) },  // a messaging channel (webhook + send)
 *     setup?:   (app, deps) => void       // a boot hook (routes, timers, e.g. the
 *                                         // scheduler) that is NOT a channel
 *   }
 * deps = { runTurn(text)->{text}, ... }. Drop a folder in, restart — the agent
 * gains the tools, channels wire up, and setup hooks run. This is the same
 * contract a nanoclaw/openclaw SKILL.md installs.
 */
'use strict';
const fs = require('fs');
const path = require('path');

function loadSkills(dir) {
  const tools = [];
  const channels = [];
  const setups = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return { tools, channels, setups }; }
  for (const name of names.sort()) {
    const entry = path.join(dir, name, 'skill.js');
    if (!fs.existsSync(entry)) continue;
    try {
      const skill = require(entry);
      (skill.tools || []).forEach((t) => tools.push(t));
      if (skill.channel && typeof skill.channel.register === 'function') channels.push({ name: skill.name || name, register: skill.channel.register });
      if (typeof skill.setup === 'function') setups.push({ name: skill.name || name, setup: skill.setup });
      console.log('[skills] loaded ' + (skill.name || name) + (skill.tools ? ' (+' + skill.tools.length + ' tools)' : '') + (skill.channel ? ' (+channel)' : '') + (skill.setup ? ' (+setup)' : ''));
    } catch (e) {
      console.warn('[skills] failed to load ' + name + ': ' + e.message);
    }
  }
  return { tools, channels, setups };
}

module.exports = { loadSkills };
