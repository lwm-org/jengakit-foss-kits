# jengakit-foss-kits

The kits for the jengaKIT engine ([lwm-org/jengakit](https://github.com/lwm-org/jengakit)),
released on their own cadence. Each kit is published as a GitHub release
`<kit>-v<version>` with one asset, `<kit>.tar.gz`, and listed in `index.json` on
the rolling `registry-latest` release. The engine's marketplace reads that index.

## Public registry

This repo is public. Reading the registry and installing kits needs no token:
the index and every bundle are plain downloads from GitHub releases. The
license is to be announced.

## Contributing

Fork the repo, branch, change a kit (bump its `version`), and open a pull
request to `dev`. `validate.yml` runs on the pull request and needs no secrets.
Releases happen on `main` through a `dev` to `main` pull request. The engine
lives in [lwm-org/jengakit](https://github.com/lwm-org/jengakit).

## Layout

```
kits/<name>/      61 kits (seeded from lwm-org/jengakit main at 246ee71, fresh history)
schema/           kit, registry-spec, persona-spec and board descriptor JSON schemas
boards/           board descriptors that embedded kits target
tools/            kit_bundler.py, schema_versions.py, board_registry.py
scripts/          validate-kits.py, publish-kits.py, refresh-registry-index.py
tests/            the kits' node suites and checks of the tools
SCHEMA_SOURCE     the engine commit the schema, boards and tools were copied from
```

`schema/`, `boards/`, `tools/kit_bundler.py` and `tools/schema_versions.py` are
copies of the engine's files. The engine is their source of record: change them
there first, then here, and update `SCHEMA_SOURCE`.

## Flow

1. **Change a kit** on a branch, bump its `version`, and open a pull request to
   `dev`. `validate.yml` checks every kit against the schemas and boards, packs
   every bundle, builds the index, and runs the node suites the kits carry.
2. **Release** by opening a pull request from `dev` to `main`. Both branches are
   protected; nobody pushes to them directly.
3. **Publish** happens on `main`: `publish.yml` creates a release for every kit
   whose `<kit>-v<version>` has none yet (and republishes a release whose files
   changed without a version bump), then rebuilds `index.json` on
   `registry-latest`. It runs on the repo's own `GITHUB_TOKEN`.

## The index

`index.json` keeps the keys the engine index always had and adds two:

- `kit_min_jengakit_version`: the lowest engine release (the lwm-org/jengakit
  version line) the kit works on, copied from its definition
  when declared. An engine older than that should refuse the install.
- `bundle_download_url`: the asset's `browser_download_url`, served off the
  GitHub API rate limit.

`bundle_url` is the `browser_download_url`, a direct download link that needs
no token. `BUNDLE_URL_MODE=download|auto|api` overrides it (`api` gives the API
asset URL, `auto` picks it only while the repo is private).

## Local checks

```
pip install jsonschema pyyaml requests
python scripts/validate-kits.py                       # all kits, or pass kits/<name>
python scripts/publish-kits.py --dry-run              # pack every kit, no network
python scripts/refresh-registry-index.py --dry-run    # print the index, no network
python -m unittest discover -s tests -t .             # node suites (needs node) and tool checks
```
