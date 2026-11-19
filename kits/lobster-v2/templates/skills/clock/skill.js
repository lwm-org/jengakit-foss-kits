/**
 * clock skill — a minimal EXAMPLE skill: one read-only tool that returns the
 * current date/time. The smallest possible template for authoring your own skill
 * (see SKILLS.md). Read-only tools run under every autonomy level.
 */
'use strict';

// Pure formatter (testable): ISO now, optionally for a given IANA timezone.
function _now(date, tz) {
  const d = date || new Date();
  if (tz) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, dateStyle: 'medium', timeStyle: 'long' }).format(d); }
    catch (e) { return d.toISOString() + ' (unknown tz "' + tz + '")'; }
  }
  return d.toISOString();
}

const tool = {
  name: 'clock',
  description: 'Get the current date and time. Args: {"tz":"optional IANA timezone e.g. America/New_York"}.',
  run: async (args) => _now(new Date(), args && (args.tz || args.timezone)),
};

module.exports = { name: 'clock', tools: [tool], _now };
