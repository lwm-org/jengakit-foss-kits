"""Single source of truth for supported kit `schema_version` values.

Every acceptance/rejection gate in the pipeline, the validators, and the
loaders route through this module rather than hard-coding a version
literal. That keeps the "which schema versions do we accept?" question in
exactly one place.

- ``SUPPORTED_SCHEMA_VERSIONS`` — the versions accepted anywhere in the
  tree. ``"4"`` is accepted during the deprecation window (existing kits
  on disk are still v4); ``"5"`` is the current schema (a superset of v4).
- ``LATEST_SCHEMA_VERSION`` — what NEW kit writers emit. Authoring paths
  (Kit Studio, the authoring agent, ``new-board.py``, the designer) stamp
  this into every freshly-created kit definition.

Use :func:`is_supported_schema` at every gate; it accepts either a parsed
kit-definition dict or a bare version string.
"""

from __future__ import annotations

from typing import Union

SUPPORTED_SCHEMA_VERSIONS: tuple[str, ...] = ("4", "5")
LATEST_SCHEMA_VERSION: str = "5"


def is_supported_schema(defn_or_version: Union[dict, str, None]) -> bool:
    """Return True if the given kit definition (or version string) is supported.

    Accepts either a parsed kit-type-definition dict (reads its
    ``schema_version`` field) or a bare version string.
    """
    v = defn_or_version.get("schema_version") if isinstance(defn_or_version, dict) else defn_or_version
    return v in SUPPORTED_SCHEMA_VERSIONS
