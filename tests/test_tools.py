"""The vendored tools and the index builder, without network."""

from __future__ import annotations

import importlib.util
import json
import os
import unittest

from tests._node import KITS_DIR, REPO_ROOT


def _load_script(name):
    path = os.path.join(REPO_ROOT, "scripts", f"{name}.py")
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class BoardRegistryTests(unittest.TestCase):
    def test_loads_every_vendored_board(self):
        from tools import board_registry

        boards = sorted(f[:-5] for f in os.listdir(os.path.join(REPO_ROOT, "boards")) if f.endswith(".json"))
        self.assertEqual([d.board_id for d in board_registry.all_descriptors()], boards)

    def test_missing_boards_folder_is_fatal(self):
        from tools import board_registry

        saved = board_registry._BOARDS_DIR
        board_registry._BOARDS_DIR = os.path.join(REPO_ROOT, "no-such-boards")
        try:
            with self.assertRaises(FileNotFoundError):
                board_registry.reload()
        finally:
            board_registry._BOARDS_DIR = saved
            board_registry.reload()


class IndexTests(unittest.TestCase):
    def setUp(self):
        self.idx = _load_script("refresh-registry-index")
        self.defs = self.idx.load_kit_definitions()
        self.releases = self.idx._local_releases(self.defs, "lwm-org/jengakit-foss-kits")

    def _declared_floor(self, name):
        with open(os.path.join(KITS_DIR, name, "kit-type-definition.json")) as f:
            return json.load(f).get("kit_min_jengakit_version")

    def test_one_entry_per_kit(self):
        entries = self.idx.build_entries(self.releases, self.defs, True)
        kits = sorted(d for d in os.listdir(KITS_DIR) if os.path.isdir(os.path.join(KITS_DIR, d)))
        self.assertEqual([e["name"] for e in entries], kits)

    def test_version_floor_copied_when_declared(self):
        for e in self.idx.build_entries(self.releases, self.defs, True):
            floor = self._declared_floor(e["name"])
            if floor is None:
                self.assertNotIn("kit_min_jengakit_version", e)
            else:
                self.assertEqual(e["kit_min_jengakit_version"], floor)

    def test_bundle_url_follows_the_mode(self):
        public = self.idx.build_entries(self.releases, self.defs, True)[0]
        private = self.idx.build_entries(self.releases, self.defs, False)[0]
        self.assertTrue(public["bundle_url"].startswith("https://github.com/"))
        self.assertTrue(private["bundle_url"].startswith("https://api.github.com/"))
        self.assertEqual(public["bundle_download_url"], private["bundle_download_url"])

    def test_registry_names_this_repo(self):
        payload = self.idx.build_payload([], "lwm-org/jengakit-foss-kits")
        self.assertEqual(payload["registry"], "lwm-org/jengakit-foss-kits")


class PackTests(unittest.TestCase):
    def test_content_hash_ignores_stripped_dirs(self):
        pub = _load_script("publish-kits")
        kit = os.path.join(KITS_DIR, "static-website")
        self.assertRegex(pub.content_hash(kit), r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
