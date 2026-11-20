"""Single source of truth for supported kit `schema_version` values.

Every acceptance/rejection gate in the pipeline, the validators, and the
loaders route through this module rather than hard-coding a version
literal. That keeps the "which schema versions do we accept?" question in
exactly one place.

- ``SUPPORTED_SCHEMA_VERSIONS``: the versions accepted anywhere in the tree.
  There is one: a kit on an older schema is refused, never converted or read
  a second way.
- ``LATEST_SCHEMA_VERSION``: what NEW kit writers emit. Authoring paths
  (Kit Studio, the authoring agent, ``new-board.py``, the designer) stamp
  this into every freshly-created kit definition.
- ``RETIRED_KEYS``: top-level keys an older schema had and this one removed.

Use :func:`is_supported_schema` at every gate; it accepts either a parsed
kit-definition dict or a bare version string. Use :func:`old_schema_reason`
to word the refusal of a definition that fails that gate.
"""

from __future__ import annotations

from typing import Optional, Union

SUPPORTED_SCHEMA_VERSIONS: tuple[str, ...] = ("7",)
LATEST_SCHEMA_VERSION: str = "7"

RETIRED_KEYS: tuple[str, ...] = ("estimate", "targets")

FIX_INSTALLED = "reinstall the kit from the registry"
FIX_DRAFT = "re-save the draft in Kit Studio"


def supported_versions_text() -> str:
    """The supported versions as prose, e.g. ``7`` or ``7 or 8``."""
    return " or ".join(SUPPORTED_SCHEMA_VERSIONS)


def is_supported_schema(defn_or_version: Union[dict, str, None]) -> bool:
    """Return True if the given kit definition (or version string) is supported.

    Accepts either a parsed kit-type-definition dict (reads its
    ``schema_version`` field) or a bare version string.
    """
    v = defn_or_version.get("schema_version") if isinstance(defn_or_version, dict) else defn_or_version
    return v in SUPPORTED_SCHEMA_VERSIONS


def old_schema_reason(defn: dict, path: str, *, draft: bool = False) -> Optional[str]:
    """One sentence refusing a definition on an old schema, or None if it is current.

    ``path`` names the definition file; ``draft`` picks the fix (re-save a
    Kit Studio draft, or reinstall an installed kit from the registry).
    """
    fix = FIX_DRAFT if draft else FIX_INSTALLED
    version = defn.get("schema_version") if isinstance(defn, dict) else None
    if not is_supported_schema(version):
        if version in (None, ""):
            return f"{path} names no kit schema version, and this engine runs only schema {supported_versions_text()}: {fix}."
        return f"{path} uses kit schema {version}, and this engine runs only schema {supported_versions_text()}: {fix}."
    for key in RETIRED_KEYS:
        if key in defn:
            return f"{path} uses `{key}`, which kit schema {LATEST_SCHEMA_VERSION} removed: {fix}."
    return None
