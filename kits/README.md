# kits/

One directory per kit. Each holds a `kit-type-definition.json` (schema v4 or
v5) and the files its family needs:

```
kits/
├── <codegen-kit>/              # the model writes the app body
│   ├── kit-type-definition.json
│   ├── prompts/
│   └── templates/              # must build on its own
├── <importer-kit>/             # pulls a published image
│   ├── kit-type-definition.json
│   └── registry-spec.yaml
├── <stamped-kit>/              # a complete app with substitutions
│   ├── kit-type-definition.json
│   ├── persona-spec.yaml
│   └── templates/
└── <embedded-kit>/             # firmware for a board in boards/
    ├── kit-type-definition.json
    ├── prompts/
    └── templates/
```

A kit may carry `test/*.test.js` node suites; CI runs them from the kit's own
directory.

## Changing a kit

1. Edit the kit and bump `version` in its `kit-type-definition.json`.
2. Set `kit_min_jengakit_version` when the kit needs a newer engine than the
   one it declared before (a new board, a new schema field).
3. Run `python scripts/validate-kits.py kits/<name>` and, when the kit has
   tests, `python -m unittest discover -s tests -t .`.
4. Open a pull request to `dev`.

The kit is released as `<name>-v<version>` when `dev` is merged to `main`.
