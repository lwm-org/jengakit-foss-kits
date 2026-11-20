# Contributing

- Open pull requests against `dev`, never `main`.
- Releases land through a pull request from `dev` to `main`.
- Nobody commits directly to `main`; the rule applies to admins too.
- Titles follow `type(scope): Description`, where type is one of feat, fix, refactor, chore, docs, test, merge and the description starts with a capital letter.
- Bump a kit's `version` in `kit-type-definition.json` with every change to its files.
- A kit that needs a newer engine sets `kit_min_jengakit_version` to that engine release.
- A kit for a new board lands after the engine release that ships the board's descriptor: the descriptor goes into the engine's `lib/boards/` first, then into `boards/` here with `SCHEMA_SOURCE` updated.
- A change to a copied file (`schema/`, `boards/`, `tools/kit_bundler.py`, `tools/schema_versions.py`) opens together with the engine pull request. This repo's pull request merges into `dev` first and is not released; the engine pull request merges next, then the engine release, then `dev` to `main` here the same day. `SCHEMA_SOURCE` records the engine commit and release.
- Every codegen, importer and stamped kit declares `resources` set from measurement; `kits/README.md` has the steps. A pull request still on an older kit schema is moved to schema 7 by hand: set `schema_version` to "7", replace `estimate` with `resources`, and drop `targets`.
