# lobster-v2

A browser-based **agentic assistant** kit: a login-gated, multi-user, responsive
streaming chat that reasons with tools, remembers per user, reaches you across
messaging channels, and is extended entirely through **skills**. The whole app is
fixed, tested code behind the platform SDKs — only the assistant's persona is
generated per deploy, so every deploy just works.

**Doctrine:** everything runs in the browser + this one container (which the
platform already isolates — no docker-in-docker). All infrastructure is behind
vendored SDKs (`lib/jengakit_llm`, `lib/jengakit_db`, `lib/jengakit_agent`). The
kit ships **zero cloud/infra code**.

## What it does

- **Agentic chat** — a bounded ReAct loop (`jengakit_agent`) with a tool registry
  and an autonomy gate (`readonly` / `supervised` / `auto`). Streams tool calls +
  the answer over SSE; safe markdown rendering in the UI.
- **Multi-user** — every deploy requires login (PBKDF2). Per-user memory, saved
  chat sessions, and an audit trail of every side-effecting tool run.
- **Tools** — shell (sandboxed), web `http` fetch, `remind` (a real persisted
  scheduler), `notes`, `ssh` (allowlisted remote exec), `remember`, `clock`,
  `calc`, plus `channels` / `provider` status tools.
- **Channels** — WhatsApp, Telegram, Discord (Ed25519), Slack (HMAC), and a
  generic inbound webhook, each a self-contained skill funneling through one agent.
- **Providers** — the platform model by default, or a local Ollama / any
  OpenAI-compatible endpoint, selected purely by env.

## Configure

**Everything is configured at runtime, inside the running instance.** Sign in as
the admin and open **Settings → Configure**: tool autonomy, the model provider
(platform / Ollama / OpenAI-compatible), every messaging channel (WhatsApp,
Telegram, Discord, Slack, generic webhook), the SSH allowlist, and the Open-Design
integration are all set there. A saved change applies to your next message — no
redeploy, no restart.

There is **nothing to set at `docker compose up`, build, or deploy time, and no
`.env` or environment variables a user has to know about.** The container needs
only the Docker engine to boot. Settings persist in the app's own database
(`jengakit_db`). The first-boot admin password is generated and printed once to
the container logs if you don't set one in the UI.

(`LOBSTER_*` env vars, if present at first boot, only *seed* an initial value for
backward compatibility with older deploys; the in-app configuration is the source
of truth thereafter.)

## Extend it

Add a folder under `skills/` — see [SKILLS.md](./SKILLS.md) for the full contract
and how to port a nanoclaw/openclaw `SKILL.md`.

## Dual-language SDK

`lib/jengakit_agent` ships in both JS (`.js`, used by this kit) and Python
(`.py`, for Python kits). `tests/test_lobster_agent_parity.py` pins that the two
behave identically.

## Test

```sh
for t in test/*.test.js; do node "$t"; done   # node logic suites
node test/parity_harness.js tool_then_answer  # a parity scenario
```
