#!/usr/bin/env python3
"""Validate jengaKIT kits against the vendored v4/v5 schemas.

Validates:
  - kit-type-definition.json against schema/kit-type-definition.v4.json or .v5.json
  - registry-spec.yaml (importer kits) against schema/registry-spec.v1.json
  - persona-spec.yaml (stamped kits) against schema/persona-spec.v1.json
  - an embedded kit's kit_target.platform against the board descriptors in boards/
  - kit_min_jengakit_version, when declared, is a dotted version (e.g. 0.7.0)
  - kit_required_files exist under kit_template_dir
  - Python source syntax + JSON well-formedness inside templates/

Usage:
  python scripts/validate-kits.py
  python scripts/validate-kits.py kits/streamlit
  python scripts/validate-kits.py kits/streamlit kits/lobster
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import List

from jsonschema import Draft7Validator

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import re  # noqa: E402

from tools.schema_versions import is_supported_schema  # noqa: E402

# The board registry is imported at module load on purpose: a missing or
# malformed boards/ folder stops the run here instead of letting embedded
# kits pass without a platform check.
from tools.board_registry import known_platform_ids  # noqa: E402

SCHEMA_DIR = os.path.join(REPO_ROOT, "schema")
V4_SCHEMA = os.path.join(SCHEMA_DIR, "kit-type-definition.v4.json")
V5_SCHEMA = os.path.join(SCHEMA_DIR, "kit-type-definition.v5.json")
REGISTRY_SCHEMA = os.path.join(SCHEMA_DIR, "registry-spec.v1.json")
PERSONA_SCHEMA = os.path.join(SCHEMA_DIR, "persona-spec.v1.json")

_VERSION_FLOOR_RE = re.compile(r"^\d+\.\d+\.\d+$")

# Map each supported schema_version to its JSON Schema file.
_SCHEMA_BY_VERSION = {"4": V4_SCHEMA, "5": V5_SCHEMA}


def _load_validator(path: str) -> Draft7Validator:
    with open(path) as f:
        return Draft7Validator(json.load(f))


def _format_errors(validator: Draft7Validator, defn: dict, prefix: str) -> List[str]:
    out = []
    for err in validator.iter_errors(defn):
        path = ".".join(str(p) for p in err.absolute_path) or "<root>"
        out.append(f"{prefix} ({path}): {err.message}")
    return out


def _embedded_platform_errors(defn: dict) -> List[str]:
    """Registry check for an embedded kit's kit_target.platform.

    The platform must be a board_id the vendored descriptor registry knows
    about. The registry import is fatal (see the module imports), so this
    check always runs.
    """
    if defn.get("kit_family") != "embedded":
        return []
    platform = (defn.get("kit_target") or {}).get("platform")
    if not platform:
        return []
    if platform not in known_platform_ids():
        return [
            f"kit_target.platform {platform!r} is not a known board "
            f"(the board descriptor must land in the engine's lib/boards/ first, "
            f"then in boards/ here, or fix the platform id)"
        ]
    return []


def _version_floor_errors(defn: dict) -> List[str]:
    """kit_min_jengakit_version is copied into index.json; keep it comparable."""
    floor = defn.get("kit_min_jengakit_version")
    if floor is None:
        return []
    if not isinstance(floor, str) or not _VERSION_FLOOR_RE.match(floor):
        return [f"kit_min_jengakit_version {floor!r} is not a MAJOR.MINOR.PATCH version"]
    return []


def _validate_metadata(kit_dir: str, defn: dict) -> List[str]:
    errors: List[str] = []
    version = defn.get("schema_version")
    schema_path = _SCHEMA_BY_VERSION[version]
    validator = _load_validator(schema_path)
    errors.extend(_format_errors(validator, defn, f"schema/v{version}"))
    errors.extend(_embedded_platform_errors(defn))
    errors.extend(_version_floor_errors(defn))

    fam = defn.get("kit_family")

    if fam == "importer":
        spec_path = os.path.join(kit_dir, "registry-spec.yaml")
        if not os.path.isfile(spec_path):
            errors.append("registry-spec.yaml missing (required for kit_family=importer)")
        else:
            try:
                import yaml

                with open(spec_path) as f:
                    spec = yaml.safe_load(f)
                v = _load_validator(REGISTRY_SCHEMA)
                errors.extend(_format_errors(v, spec, "registry-spec"))
            except ImportError:
                errors.append("registry-spec.yaml validation requires PyYAML (pip install pyyaml)")
            except Exception as e:
                errors.append(f"registry-spec.yaml: failed to parse: {e}")

    if fam == "stamped":
        spec_path = os.path.join(kit_dir, "persona-spec.yaml")
        if not os.path.isfile(spec_path):
            errors.append("persona-spec.yaml missing (required for kit_family=stamped)")
        else:
            try:
                import yaml

                with open(spec_path) as f:
                    spec = yaml.safe_load(f)
                v = _load_validator(PERSONA_SCHEMA)
                errors.extend(_format_errors(v, spec, "persona-spec"))
            except ImportError:
                errors.append("persona-spec.yaml validation requires PyYAML")
            except Exception as e:
                errors.append(f"persona-spec.yaml: failed to parse: {e}")

    return errors


def _file_existence_errors(kit_dir: str, defn: dict) -> List[str]:
    """File-existence + source-syntax checks (outside JSON schema's remit)."""
    errors: List[str] = []
    tmpl_path = defn.get("kit_template_dir", "templates")
    required_files = defn.get("kit_required_files", [])
    tmpl_dir = os.path.join(kit_dir, tmpl_path)

    if not os.path.isdir(tmpl_dir):
        if required_files:
            errors.append(f"template dir '{tmpl_path}' missing but required_files defined")
        return errors

    for fname in required_files:
        if not os.path.exists(os.path.join(tmpl_dir, fname)):
            errors.append(f"required template file missing: {tmpl_path}/{fname}")

    for root, dirs, files in os.walk(tmpl_dir):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for fname in files:
            fpath = os.path.join(root, fname)
            rel = os.path.relpath(fpath, tmpl_dir)
            if fname.endswith(".py"):
                try:
                    with open(fpath) as f:
                        compile(f.read(), fpath, "exec")
                except SyntaxError as e:
                    errors.append(f"Python syntax error in {rel}: {e}")
            if fname.endswith(".json"):
                try:
                    with open(fpath) as f:
                        json.load(f)
                except Exception as e:
                    errors.append(f"Invalid JSON in {rel}: {e}")

    return errors


def validate_kit(kit_dir: str) -> List[str]:
    """Validate a single kit directory. Returns list of error strings."""
    def_path = os.path.join(kit_dir, "kit-type-definition.json")
    if not os.path.exists(def_path):
        return ["kit-type-definition.json missing"]

    try:
        with open(def_path) as f:
            defn = json.load(f)
    except Exception as e:
        return [f"kit-type-definition.json: invalid JSON: {e}"]

    if not is_supported_schema(defn):
        return [f"unknown or unsupported schema_version {defn.get('schema_version')!r} (expected one of '4', '5')"]

    errors: List[str] = []
    errors.extend(_validate_metadata(kit_dir, defn))
    errors.extend(_file_existence_errors(kit_dir, defn))
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate jengaKIT kits (v4/v5)")
    parser.add_argument(
        "paths",
        nargs="*",
        default=[os.path.join(REPO_ROOT, "kits")],
        help="Kit directory(ies) or kits-dir. Default: kits/",
    )
    args = parser.parse_args()

    kit_dirs: List[str] = []
    for p in args.paths:
        if not os.path.isdir(p):
            print(f"FAIL  {p}: not a directory")
            return 1
        if os.path.exists(os.path.join(p, "kit-type-definition.json")):
            kit_dirs.append(p)
        else:
            for entry in sorted(os.listdir(p)):
                sub = os.path.join(p, entry)
                if not os.path.isdir(sub):
                    continue
                if entry.startswith(".") or entry == "__pycache__":
                    continue
                kit_dirs.append(sub)

    total_errors = 0
    for kit_dir in kit_dirs:
        kit_name = os.path.basename(kit_dir.rstrip("/"))
        errors = validate_kit(kit_dir)
        if errors:
            total_errors += len(errors)
            for err in errors:
                print(f"FAIL  {kit_name}: {err}")
        else:
            print(f"OK    {kit_name}")

    print(f"\n{len(kit_dirs)} kit(s) checked, {total_errors} error(s)")
    return 1 if total_errors else 0


if __name__ == "__main__":
    sys.exit(main())
