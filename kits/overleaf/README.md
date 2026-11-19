# Overleaf (Community Edition) kit

Deploys the full Overleaf CE stack — web + a single-member MongoDB replica set
+ Redis — as one app behind one URL. The stack is batteries-included: the
replica set self-initializes and the invite-token secret is minted per
deployment, so `Deploy Overleaf` just works and the app comes up serving.

## First login (one manual step)

Overleaf CE ships with **no default account** and **open registration disabled**,
so after the deploy is green you create the first admin yourself. On the host
running the deployment:

```bash
# find the Overleaf web container (its name contains "-sharelatex-1")
docker ps --format '{{.Names}}' | grep sharelatex

# create the first admin
docker exec <that-container> \
  node modules/server-ce-scripts/scripts/create-user.mjs --admin --email=you@example.com
```

The command prints a one-time **activation URL** (used to set the password).
SMTP is not configured, so nothing is emailed — copy the URL from the command
output. The URL is printed with a `localhost` host; **replace `localhost` with
the app's real URL** (the deployment's `Open` URL) before visiting it, e.g.:

```
http://localhost/user/activate?token=…   →   http://<your-app-url>/user/activate?token=…
```

Open the rewritten URL, set a password, and you're in as admin. Create further
users the same way (drop `--admin` for non-admins).

## Notes

- **First boot takes a few minutes** (Mongo replica-set init + the web monolith
  starting). The deploy waits for it before reporting healthy.
- **Footprint:** ~4 GB RAM / ~2 vCPU for the web service; size the host
  accordingly.
- **LaTeX compiles run in-container** (`SANDBOXED_COMPILES=false`) — Community
  Edition can't do sandboxed compiles without the docker socket.
- For a real deployment, review the environment in `templates/docker-compose.yml`
  (SMTP, site name, etc.).
