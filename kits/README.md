# kits/

One directory per kit. Each holds a `kit-type-definition.json` (kit schema 7)
and the files its family needs:

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

## Size and description

Every codegen, importer and stamped kit declares `resources`, the size steps
the engine turns into its limits: `cpu` and `memory` each one of `xs`, `s`,
`m`, `l`, `xl`, `xxl`, and `storage` one of `none`, `s`, `m`, `l`, `xl`
(`none` when the app keeps no data). Embedded kits run on a board and declare
none. Set the steps from measurement on the Docker engine:

1. Start the engine with `JENGAKIT_DEPLOY_MEMORY=off` and
   `JENGAKIT_DEPLOY_CPUS=off`, so no limit hides real use.
2. Deploy the kit and use its main pages, or run its own node suite against
   it, for about five minutes.
3. Sample `docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' <container>`
   every 10 seconds for a minute while exercising it; keep the peaks.
4. Memory: the smallest step whose limit is at least twice the peak. CPU: the
   smallest step whose share covers the peak. Put the figures in the pull
   request.

`description` and `ui.description` say what the app does for its users, with
a first sentence of at most 160 characters. They never say how it is built or
run: `scripts/validate-kits.py` refuses words such as server, database,
container, image, Docker or nginx there.

## Changing a kit

1. Edit the kit and bump `version` in its `kit-type-definition.json`.
2. Set `kit_min_jengakit_version` when the kit needs a newer engine than the
   one it declared before (a new board, a new schema field).
3. Run `python scripts/validate-kits.py kits/<name>` and, when the kit has
   tests, `python -m unittest discover -s tests -t .`.
4. Open a pull request to `dev`.

The kit is released as `<name>-v<version>` when `dev` is merged to `main`.
