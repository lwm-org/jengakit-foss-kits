"""Shared node discovery for the kit test suites.

Locally a missing node skips the suites. CI sets KITS_REQUIRE_NODE=1 so a
runner without node fails instead of passing on a skip.
"""

from __future__ import annotations

import os
import shutil
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KITS_DIR = os.path.join(REPO_ROOT, "kits")
HAS_NODE = shutil.which("node") is not None
REQUIRE_NODE = os.environ.get("KITS_REQUIRE_NODE") == "1"


def require_node(cls):
    if HAS_NODE or REQUIRE_NODE:
        return cls
    return unittest.skip("node not on PATH")(cls)
