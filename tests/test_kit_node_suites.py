"""Node suites that ship inside the kits.

The game and agent logic of these kits lives in their JS (the pipeline never
regenerates it), so it is tested with node: every template JS file must parse
(`node --check`) and every `test/*.test.js` must pass. Each suite runs from its
own kit directory, the way a kit author runs it.

`kits/itchy/templates/tests/` is a jest suite for the generated app and is not
run here; it needs the app's own dependencies.
"""

from __future__ import annotations

import glob
import os
import subprocess
import unittest

from tests._node import KITS_DIR, require_node

# Kits known to ship node suites. Discovery below finds every kit with a
# test/*.test.js; this list makes a suite that disappears a failure, not a skip.
EXPECTED_KITS = {"block-drop", "block-drop-v2", "crossword", "crossword-v2", "lobster-v2"}


def kits_with_suites():
    found = {}
    for path in sorted(glob.glob(os.path.join(KITS_DIR, "*", "test", "*.test.js"))):
        kit_dir = os.path.dirname(os.path.dirname(path))
        found.setdefault(os.path.basename(kit_dir), []).append(path)
    return found


@require_node
class KitNodeSuiteTests(unittest.TestCase):
    def test_expected_kits_carry_suites(self):
        missing = EXPECTED_KITS - set(kits_with_suites())
        self.assertFalse(missing, f"kits lost their test/*.test.js suites: {sorted(missing)}")

    def test_all_template_js_parses(self):
        for kit in sorted(kits_with_suites()):
            kit_dir = os.path.join(KITS_DIR, kit)
            js = glob.glob(os.path.join(kit_dir, "templates", "**", "*.js"), recursive=True)
            self.assertTrue(js, f"{kit}: expected template JS files")
            for f in js:
                rel = os.path.relpath(f, kit_dir)
                r = subprocess.run(["node", "--check", rel], cwd=kit_dir, capture_output=True, text=True)
                self.assertEqual(r.returncode, 0, f"node --check failed for {kit}/{rel}:\n{r.stderr}")

    def test_kit_suites_pass(self):
        ran = 0
        for kit, suites in sorted(kits_with_suites().items()):
            kit_dir = os.path.join(KITS_DIR, kit)
            for t in suites:
                rel = os.path.relpath(t, kit_dir)
                with self.subTest(kit=kit, suite=rel):
                    r = subprocess.run(["node", rel], cwd=kit_dir, capture_output=True, text=True, timeout=60)
                    self.assertEqual(r.returncode, 0, f"{kit} {rel} failed:\n{r.stdout}\n{r.stderr}")
                ran += 1
        self.assertGreaterEqual(ran, len(EXPECTED_KITS), "expected every kit suite to run")


if __name__ == "__main__":
    unittest.main()
