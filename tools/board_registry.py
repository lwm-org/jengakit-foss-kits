"""Board descriptor registry, vendored from the jengaKIT engine.

Copy of ``lib/services/devices/board_registry.py`` from lwm-org/jengakit at the
commit named in ``SCHEMA_SOURCE``, with two changes for this repo:

- descriptors load from ``boards/`` and the schema from
  ``schema/board-descriptor.v1.json`` at the repo root;
- a missing ``boards/`` folder or schema raises instead of yielding an empty
  registry, so the validator can never pass an embedded kit unchecked.

The engine stays the source of record for board descriptors. A new board ships
in an engine release before a kit that targets it is published here.
"""

from __future__ import annotations

import glob
import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BOARDS_DIR = os.path.join(_REPO_ROOT, "boards")
_SCHEMA_PATH = os.path.join(_REPO_ROOT, "schema", "board-descriptor.v1.json")


class BoardDescriptor:
    """Thin typed view over one descriptor dict.

    Attribute access falls through to the raw dict so unknown/extra fields
    stay reachable, while the common fields get sensible defaults.
    """

    def __init__(self, raw: Dict[str, Any]):
        self.raw = raw

    # ── identity ────────────────────────────────────────────────────────
    @property
    def board_id(self) -> str:
        return self.raw["board_id"]

    @property
    def display_name(self) -> str:
        return self.raw.get("display_name", self.board_id)

    @property
    def kind(self) -> str:
        return self.raw.get("kind", "")

    @property
    def connection_kind(self) -> str:
        return self.raw.get("connection_kind", "")

    # ── provider grouping ──────────────────────────────────────────────
    @property
    def provider_id(self) -> str:
        # A descriptor may declare which provider it belongs to; default to
        # its own board_id (a one-board provider).
        return self.raw.get("provider_id") or self.board_id

    @property
    def provider_primary(self) -> bool:
        return bool(self.raw.get("provider_primary", False))

    @property
    def provider_display_name(self) -> str:
        return self.raw.get("provider_display_name") or self.display_name

    # ── hardware + toolchain ───────────────────────────────────────────
    @property
    def manufacturer(self) -> str:
        return self.raw.get("manufacturer", "")

    @property
    def chip(self) -> str:
        return self.raw.get("chip", "")

    @property
    def variants(self) -> List[str]:
        return list(self.raw.get("variants", []))

    @property
    def toolchain(self) -> str:
        return self.raw.get("toolchain", "")

    @property
    def flash(self) -> Dict[str, Any]:
        return dict(self.raw.get("flash", {}))

    @property
    def capabilities(self) -> Dict[str, Any]:
        return dict(self.raw.get("capabilities", {}))

    # ── config / resolver metadata ─────────────────────────────────────
    @property
    def config_schema(self) -> List[Dict[str, Any]]:
        return list(self.raw.get("config_schema", []))

    @property
    def kit_platform_ids(self) -> List[str]:
        # Default: the board serves the kit-target platform of its own id.
        return list(self.raw.get("kit_platform_ids") or [self.board_id])

    @property
    def resolver_keywords(self) -> List[str]:
        return list(self.raw.get("resolver_keywords", []))

    @property
    def default_peripherals(self) -> List[Any]:
        return list(self.raw.get("default_peripherals", []))

    def variant_field(self) -> Tuple[Optional[str], Optional[str]]:
        """Return ``(config_key, default)`` for the variant field, if any.

        The variant field is the ``config_schema`` entry with
        ``kind == "variant"``. Strategies use it to resolve the compile
        target variant (e.g. ``config["variant"]`` for the Uno,
        ``config["board_variant"]`` for the ESP32).
        """
        for f in self.config_schema:
            if f.get("kind") == "variant":
                return f.get("name"), f.get("default")
        return None, None

    def as_dict(self) -> Dict[str, Any]:
        """Return the raw descriptor dict (for the catalog endpoint)."""
        return dict(self.raw)


_DESCRIPTORS: Dict[str, BoardDescriptor] = {}


def _load_schema_validator():
    from jsonschema import Draft7Validator

    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        return Draft7Validator(json.load(f))


def _load_all() -> Dict[str, BoardDescriptor]:
    """Scan + validate every descriptor file. Raises on a malformed board or a missing folder."""
    out: Dict[str, BoardDescriptor] = {}
    if not os.path.isdir(_BOARDS_DIR):
        raise FileNotFoundError(f"board descriptor folder not found: {_BOARDS_DIR}")
    if not os.path.isfile(_SCHEMA_PATH):
        raise FileNotFoundError(f"board descriptor schema not found: {_SCHEMA_PATH}")

    validator = _load_schema_validator()
    for path in sorted(glob.glob(os.path.join(_BOARDS_DIR, "*.json"))):
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        errors = sorted(validator.iter_errors(raw), key=lambda e: list(e.absolute_path))
        if errors:
            joined = "; ".join(f"{'.'.join(str(p) for p in e.absolute_path) or '<root>'}: {e.message}" for e in errors)
            raise ValueError(f"board descriptor {os.path.basename(path)} is invalid: {joined}")
        board_id = raw["board_id"]
        if board_id in out:
            raise ValueError(f"duplicate board_id {board_id!r} (second file: {os.path.basename(path)})")
        out[board_id] = BoardDescriptor(raw)
    if not out:
        raise ValueError(f"no board descriptors found in {_BOARDS_DIR}")
    return out


# Load + validate at import. A malformed descriptor fails loudly here so the
# problem surfaces at startup, not at first device registration.
_DESCRIPTORS = _load_all()


def all_descriptors() -> List[BoardDescriptor]:
    """Every loaded descriptor, sorted by board_id for determinism."""
    return [_DESCRIPTORS[k] for k in sorted(_DESCRIPTORS)]


def get_descriptor(board_id: str) -> Optional[BoardDescriptor]:
    """Return the descriptor for a board_id, or ``None`` if unknown."""
    return _DESCRIPTORS.get(board_id)


def known_platform_ids() -> set:
    """Union of every descriptor's kit_platform_ids (+ its board_id).

    This is what a kit's ``kit_target.platform`` is validated against at
    load time: an open, registry-backed set instead of a static enum.
    """
    ids: set = set()
    for d in all_descriptors():
        ids.add(d.board_id)
        ids.update(d.kit_platform_ids)
    return ids


def reload() -> None:
    """Re-scan the boards directory (test hook)."""
    global _DESCRIPTORS
    _DESCRIPTORS = _load_all()


__all__ = [
    "BoardDescriptor",
    "all_descriptors",
    "get_descriptor",
    "known_platform_ids",
    "reload",
]
