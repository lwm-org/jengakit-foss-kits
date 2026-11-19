# Contributing

- Open pull requests against `dev`, never `main`.
- Releases land through a pull request from `dev` to `main`.
- Nobody commits directly to `main`; the rule applies to admins too.
- Titles follow `type(scope): Description`, where type is one of feat, fix, refactor, chore, docs, test, merge and the description starts with a capital letter.
- Bump a kit's `version` in `kit-type-definition.json` with every change to its files.
- A kit that needs a newer engine sets `kit_min_jengakit_version` to that engine release.
- A kit for a new board lands after the engine release that ships the board's descriptor: the descriptor goes into the engine's `lib/boards/` first, then into `boards/` here with `SCHEMA_SOURCE` updated.
- Schema changes follow the same order: engine first, then `schema/` and `SCHEMA_SOURCE` here.
