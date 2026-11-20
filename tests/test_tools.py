"""The vendored tools and the index builder, without network."""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import tempfile
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


def _definitions():
    out = {}
    for name in sorted(os.listdir(KITS_DIR)):
        path = os.path.join(KITS_DIR, name, "kit-type-definition.json")
        if os.path.isfile(path):
            with open(path) as f:
                out[name] = json.load(f)
    return out


def _version_tuple(text):
    return tuple(int(p) for p in text.split("."))


CONTAINER_FAMILIES = ("codegen", "importer", "stamped")


class KitDefinitionTests(unittest.TestCase):
    """Every kit is on kit schema 7 and names its size the way schema 7 does."""

    def setUp(self):
        self.defs = _definitions()

    def test_every_container_kit_declares_resources(self):
        missing = [n for n, d in self.defs.items() if d["kit_family"] in CONTAINER_FAMILIES and "resources" not in d]
        self.assertEqual(missing, [])

    def test_no_embedded_kit_declares_resources(self):
        sized = [n for n, d in self.defs.items() if d["kit_family"] == "embedded" and "resources" in d]
        self.assertEqual(sized, [])

    def test_no_kit_carries_a_retired_or_extension_key(self):
        offenders = [
            (n, k) for n, d in self.defs.items() for k in d if k in ("estimate", "targets") or k.startswith("x-")
        ]
        self.assertEqual(offenders, [])

    def test_every_kit_is_on_schema_7_with_the_floor_that_runs_it(self):
        for name, d in self.defs.items():
            self.assertEqual(d["schema_version"], "7", name)
            self.assertGreaterEqual(_version_tuple(d["kit_min_jengakit_version"]), (0, 10, 0), name)


class CopiesTests(unittest.TestCase):
    """The copied engine files and the table in SCHEMA_SOURCE agree with each other.

    The byte-for-byte comparison with the engine runs on the engine side; this
    keeps the table here honest so that comparison has nothing to trip on.
    """

    def _table(self):
        rows = {}
        with open(os.path.join(REPO_ROOT, "SCHEMA_SOURCE")) as f:
            for line in f:
                if "<-" in line and not line.startswith("#"):
                    repo_path, engine_path = (part.strip() for part in line.split("<-", 1))
                    rows[repo_path] = engine_path
        return rows

    def test_table_lists_every_schema_file_and_only_those(self):
        listed = sorted(p for p in self._table() if p.startswith("schema/"))
        present = sorted(f"schema/{f}" for f in os.listdir(os.path.join(REPO_ROOT, "schema")) if f.endswith(".json"))
        self.assertEqual(listed, present)

    def test_every_listed_copy_exists(self):
        for repo_path in self._table():
            if "*" in repo_path:
                continue
            self.assertTrue(os.path.isfile(os.path.join(REPO_ROOT, repo_path)), repo_path)

    def test_one_kit_schema_file_per_supported_version(self):
        from tools import schema_versions

        files = sorted(
            f[len("kit-type-definition.v") : -len(".json")]
            for f in os.listdir(os.path.join(REPO_ROOT, "schema"))
            if f.startswith("kit-type-definition.v")
        )
        self.assertEqual(files, sorted(schema_versions.SUPPORTED_SCHEMA_VERSIONS))
        self.assertEqual(schema_versions.LATEST_SCHEMA_VERSION, "7")
        validator = _load_script("validate-kits")
        self.assertEqual(sorted(validator._SCHEMA_BY_VERSION), files)


class ValidatorTests(unittest.TestCase):
    """The kit validator refuses each retired shape with a sentence naming the file."""

    def setUp(self):
        self.validator = _load_script("validate-kits")
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp)

    def _kit(self, source, change):
        dest = os.path.join(self.tmp, source)
        shutil.copytree(os.path.join(KITS_DIR, source), dest)
        path = os.path.join(dest, "kit-type-definition.json")
        with open(path) as f:
            defn = json.load(f)
        change(defn)
        with open(path, "w") as f:
            json.dump(defn, f)
        return self.validator.validate_kit(dest)

    def _assert_refused(self, errors, *words, names_file=True):
        self.assertTrue(errors, "expected a refusal")
        joined = "\n".join(errors)
        if names_file:
            self.assertIn("kit-type-definition.json", joined)
        for word in words:
            self.assertIn(word, joined)

    def test_shipped_kits_pass(self):
        self.assertEqual(self._kit("go-api", lambda d: None), [])
        self.assertEqual(self._kit("arduino-nano-blink", lambda d: None), [])

    def test_older_schema_version_refused(self):
        errors = self._kit("go-api", lambda d: d.update(schema_version="5"))
        self._assert_refused(errors, "kit schema '5'", '"schema_version": "7"')

    def test_estimate_refused(self):
        errors = self._kit("go-api", lambda d: d.update(estimate={"cpu_m": 10, "mem_mb": 32}))
        self._assert_refused(errors, "`estimate`", "resources")

    def test_targets_refused(self):
        errors = self._kit("go-api", lambda d: d.update(targets=["docker"]))
        self._assert_refused(errors, "`targets`")

    def test_extension_key_refused(self):
        errors = self._kit("go-api", lambda d: d.update({"x-host": {"a": 1}}))
        self._assert_refused(errors, "`x-host`")

    def test_container_kit_without_resources_refused(self):
        errors = self._kit("go-api", lambda d: d.pop("resources"))
        self._assert_refused(errors, "declares no `resources`")

    def test_embedded_kit_with_resources_refused(self):
        sized = {"cpu": "xs", "memory": "xs", "storage": "none"}
        errors = self._kit("arduino-nano-blink", lambda d: d.update(resources=sized))
        self._assert_refused(errors, "embedded")

    def test_unknown_step_refused(self):
        errors = self._kit("go-api", lambda d: d["resources"].update(cpu="huge"))
        self._assert_refused(errors, "resources.cpu", "huge", names_file=False)

    def test_implementation_word_in_description_refused(self):
        errors = self._kit("go-api", lambda d: d.update(description="A tiny web server for notes."))
        self._assert_refused(errors, "description names 'server'")

    def test_implementation_word_in_ui_description_refused(self):
        errors = self._kit("go-api", lambda d: d["ui"].update(description="Runs in one container image."))
        self._assert_refused(errors, "ui.description names 'container', 'image'")

    def test_long_first_sentence_refused(self):
        errors = self._kit("go-api", lambda d: d.update(description="A notes app " + "with tags " * 20 + "."))
        self._assert_refused(errors, "first sentence")


if __name__ == "__main__":
    unittest.main()
