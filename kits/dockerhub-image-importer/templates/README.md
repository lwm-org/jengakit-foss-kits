# Docker Hub Imported Application

This application was automatically imported from Docker Hub by jengakit.

## Source

See `provenance.json` in this directory for full metadata: image,
tag, source URL, exposed ports, selected port, and any extra
docker-run flags injected.

## Accepted prompt forms

The kit recognises any of these — type them in the dashboard chat,
or pass via the API:

- Hub URLs (Browse / Tags / Layers tabs all work):
  - `https://hub.docker.com/r/<owner>/<repo>`
  - `https://hub.docker.com/r/<owner>/<repo>/tags/<tag>`
  - `https://hub.docker.com/_/<official-image>`
  - `https://hub.docker.com/layers/<owner>/<repo>/<tag>`
  - `https://hub.docker.com/layers/library/<image>/<tag>`
- Plain image refs:
  - `<image>` (e.g. `nginx`)
  - `<image>:<tag>` (e.g. `alpine:3.22.4`)
  - `<owner>/<repo>` (e.g. `pengbai/docker-supermario`)
  - `<owner>/<repo>:<tag>` (e.g. `linuxserver/webtop:fedora-kde-49e9fc00-ls269`)
- With an optional keyword: `docker <ref>`, `deploy <ref>`, `pull <ref>`, `run <ref>`

## Out of scope

The importer assumes the image runs a single long-lived HTTP service
that binds an `EXPOSE`d port. It will refuse to deploy:

- **Base-OS images** (`alpine`, `ubuntu`, `debian`, `busybox`,
  `rockylinux/rockylinux`) — no daemon, container exits immediately.
- **Other registries** (`gcr.io/...`, `quay.io/...`, `ghcr.io/...`,
  `*.ecr.*`, `*.azurecr.io`) — use the registry-specific kit if one
  exists.

## Multi-port + run-flag handling

- Multiple exposed ports → 80 / 8080 / 3000 / 8000 / 5000 / 4000 are
  preferred, in that order; otherwise the lowest port wins.
- `linuxserver/*` and `kasmweb/*` images (Kasm-based desktop
  containers) automatically get `--shm-size=1gb` and
  `--security-opt seccomp=unconfined` added to `docker run`.

## Lifecycle

Use the jengakit dashboard's workspace pane to inspect, restart, stop,
or delete this app. Or via the API:

```bash
curl -s http://localhost:8080/api/v1/deployments/<id>/stop -X POST
curl -s http://localhost:8080/api/v1/deployments/<id>/start -X POST
curl -s http://localhost:8080/api/v1/deployments/<id> -X DELETE
```
