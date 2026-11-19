# Authoring lobster-v2 skills

Every customization in lobster-v2 is a **skill** — a self-contained folder that
adds tools, a messaging channel, or a boot hook **without editing any core file**.
Drop the folder in, restart, and the assistant gains the capability. This is the
same idea as a nanoclaw/openclaw `SKILL.md`, expressed as a small JS module.

## The contract

Create `skills/<name>/skill.js` exporting any of:

```js
module.exports = {
  name: 'my-skill',

  // 0+ tools the agent can call. Read-only tools run under every autonomy
  // level; side-effecting tools are blocked in "readonly" and audited on run.
  tools: [
    {
      name: 'my_tool',
      description: 'What it does + its args, e.g. Args: {"x":"..."}.',
      sideEffecting: false,           // set true for anything that writes/acts
      run: async (args) => 'a string result',
    },
  ],

  // A messaging channel: register your own webhook + send. deps.runTurn(text)
  // funnels an inbound message through the SAME agent and returns { text }.
  channel: { register(app, deps) { /* app.post('/webhook/my', ...) */ } },

  // A boot hook for anything that isn't a channel (routes, timers). Runs once
  // at startup with the shared app + deps ({ runTurn, db }).
  setup(app, deps) { /* app.get('/api/mine', ...) */ },
};
```

The loader (`lib/skills.js`) scans `skills/*/skill.js` and wires everything up.
Nothing else needs to change.

## Smallest example

`skills/clock/skill.js` is a one-tool skill; `skills/calc/skill.js` shows input
validation. Copy either as a starting point.

## Config

Read configuration from `process.env` (never hardcode secrets); prefix keys with
`LOBSTER_` by convention. Configuration is **runtime** — set from the admin
**Settings → Configure** panel, persisted in the app DB, and seeded into
`process.env` at boot — so a skill just reads `process.env.LOBSTER_MY_KEY` lazily
(a function, not a module constant) and a saved change applies on the next message.
To surface a new setting in that panel, add a row to `FIELDS` in `lib/config.js`
(with `secret:true` for tokens). Do NOT add deploy-form `user_inputs` — nothing is
configured at deploy time.

## Porting a nanoclaw / openclaw `SKILL.md`

A nanoclaw skill is a `SKILL.md` with YAML frontmatter (`name`, `description`,
`allowed-tools`) plus a markdown body describing a CLI. The mapping to a
lobster-v2 skill is direct:

| `SKILL.md` frontmatter / body | lobster-v2 `skill.js`                          |
|-------------------------------|------------------------------------------------|
| `name`                        | `module.exports.name`                          |
| `description`                 | the tool's `description` (what + when to use)  |
| `allowed-tools: Bash(x:*)`    | a `tool` whose `run` shells out (side-effecting)|
| the CLI the body documents    | the `run(args)` implementation                 |

So a `SKILL.md` that documents a `foo` CLI becomes a `skills/foo/skill.js` with a
`foo` tool whose `run` invokes it. Keep the description action-oriented ("use
when…") exactly like the `SKILL.md` — that text is what the planner reads.

## Consuming an OpenClaw app — the `open-design` skill

`skills/open-design/skill.js` is the reference example of wiring lobster-v2 to
another **OpenClaw-ecosystem** app rather than a `SKILL.md`. It gives the agent
tools to drive a running [open-design](https://github.com/clawnify/open-design)
editor (Canva-style graphic design) over its HTTP API:

| Tool | Side-effecting | Maps to |
|------|----------------|---------|
| `design_list` / `design_get` / `design_templates` | no | `GET /api/designs`, `/api/designs/:id`, `/api/templates` |
| `design_create` | yes | `POST /api/designs` |
| `design_update` | yes | `PUT /api/designs/:id` |

Point it at your instance with `LOBSTER_OPENDESIGN_URL` (surfaced as a deploy-form
field). The skill is inert until that is set — the tools return a clear "not
configured" message — so it is safe to ship unconfigured. Copy it as the template
for integrating any other HTTP-addressable OpenClaw app.

## Doctrine

Skills are kit code and MUST stay infra-free: talk to the model via
`lib/jengakit_llm`, to storage via `lib/jengakit_db`, and reuse the agent loop via
`lib/jengakit_agent`. No cloud, orchestration, or infra plumbing — the platform
already gives the kit its own isolated container.
