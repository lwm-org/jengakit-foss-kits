# kits/

Source-of-truth for the public marketplace. Each `<name>/` subdirectory is a
vetted, contract-compliant kit available to every jengaKIT user — FOSS
self-hosters and free-tier cloud users alike.

All kits ship at schema **v4** ([Three Families, Two Platforms](../docs/04-developer-guide/architecture/three-families.md)).
The pre-v4 `app-type-definition.json` format is no longer supported by the
runtime; older kits must be migrated via `scripts/migrate-kit-to-v4.py` (see
[Migration from v3](../docs/04-developer-guide/building-kits/migration-from-v3.md)).

## Layout per family

Every kit's required artifact is `kit-type-definition.json`. Family-specific
extras vary:

```
kits/
├── bundled.txt                 # which kits get baked into the image
├── README.md                   # this file
│
├── <codegen-kit>/              # Family A (~80% — LLM generates app body)
│   ├── kit-type-definition.json
│   ├── prompts/
│   │   ├── plan-rules.txt
│   │   ├── codegen-rules.txt
│   │   └── infra-rules.txt
│   └── templates/              # degraded-mode floor (must build standalone)
│       ├── Dockerfile
│       └── ...
│
├── <importer-kit>/             # Family B (~5% — pulls pre-built image)
│   ├── kit-type-definition.json
│   └── registry-spec.yaml      # declarative registry contract
│
└── <stamped-kit>/              # Family C (~15% — full app + substitutions)
    ├── kit-type-definition.json
    ├── persona-spec.yaml       # placeholder substitutions (may be empty)
    └── templates/              # the complete app
        ├── Dockerfile
        └── ...
```

For per-family detail, see the building-kits guides:

- [Codegen kits](../docs/04-developer-guide/building-kits/codegen-kits.md)
- [Importer kits](../docs/04-developer-guide/building-kits/importer-kits.md)
- [Stamped kits](../docs/04-developer-guide/building-kits/stamped-kits.md)

## Adding a kit

A kit lands here only after passing schema validation:

1. Author the kit in its source environment (cloud or community), or scaffold
   one via the dashboard's **Settings → Kit Studio**.
2. Verify it deploys cleanly: install in a running FOSS instance and try a
   `sample_prompt`.
3. Open a PR. CI runs `scripts/validate-kits.py` (schema check across every
   kit) and the full unit + integration test suite.
4. On merge, CI publishes a release `<name>-v<version>.tar.gz` and republishes
   `index.json` to the rolling `registry-latest` release. Users see the kit in
   **Marketplace → Browse** within a minute.

## Bundling

`bundled.txt` lists kits to bake into the image at build time. Currently
empty: the launch kit set installs from the public marketplace on first run
rather than shipping in the image. Add a kit here only when it's part of the
"every install needs this kit available offline" core set.

## Schema reference

- [Kit Type Definition v4](../docs/05-reference/schema/kit-type-definition-v4.md)
- [Registry Spec v1](../docs/05-reference/schema/registry-spec.md) (importer kits)
- [Persona Spec v1](../docs/05-reference/schema/persona-spec.md) (stamped kits)
