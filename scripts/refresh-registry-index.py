#!/usr/bin/env python3
"""Regenerate index.json from the per-kit releases and publish it on the
rolling `registry-latest` release.

The marketplace runtime (the engine and any client of the same index) fetches `index.json`
from the `registry-latest` release of this repo. This script:

  1. Lists every release tagged `<kit>-v<version>` and groups by kit.
  2. Picks the highest version per kit (semver-aware).
  3. Builds an index.json with one entry per kit:
       {
         "name", "version", "tag", "bundle_url", "bundle_download_url",
         "bundle_hash", "display_name", "description", "category",
         "capabilities", "sample_prompts", "runtime", "ui", "author",
         "schema_version", "kit_family",
         # when the kit declares it:
         "kit_min_jengakit_version",
         # embedded-family kits also carry:
         "kit_toolchain", "kit_target", "kit_safety_class", "kit_flash_methods"
       }
     `kit_min_jengakit_version` is the lowest ENGINE release (lwm-org/jengakit
     version line) the kit works on. An engine older than that refuses the
     install.
     `bundle_download_url` is always the asset's browser_download_url, which is
     served off the GitHub API rate limit. `bundle_url` is what readers fetch:
     the browser_download_url when this repo is public, the API asset URL while
     it is private, because a private repo answers 404 on browser_download_url
     even with a valid token. BUNDLE_URL_MODE=download|api overrides that.
  4. Ensures the `registry-latest` release exists (never deletes it) and swaps
     its `index.json` asset.

Run after `publish-kits.py` from the same workflow.

`--dry-run [--out PATH]` builds the index from the local kit definitions as if
every kit were released at its current version, with placeholder URLs, and
publishes nothing. It needs no token.

Env (not needed for --dry-run):
  GITHUB_TOKEN        auth (the workflow's own token, contents: write)
  GITHUB_REPOSITORY   `<owner>/<repo>` (provided by Actions)
  BUNDLE_URL_MODE     download (default) | auto | api
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KITS_DIR = os.path.join(ROOT, "kits")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO = os.environ.get("GITHUB_REPOSITORY", "")
API = f"https://api.github.com/repos/{REPO}"

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

REGISTRY_TAG = "registry-latest"
INDEX_NAME = "index.json"
BUNDLE_URL_MODES = ("auto", "download", "api")

# Kit definition fields copied into the index when the kit declares them.
ROUTING_FIELDS = ("schema_version", "kit_family")
OPTIONAL_FIELDS = (
    "kit_min_jengakit_version",
    "kit_toolchain",
    "kit_target",
    "kit_safety_class",
    "kit_flash_methods",
)

KIT_TAG_RE = re.compile(r"^(?P<name>[a-z0-9][a-z0-9-]*)-v(?P<version>\d+(?:\.\d+){0,2}.*)$")


# ── Semver compare ───────────────────────────────────────────────────────────


def parse_version(v: str):
    """Best-effort semver tuple. Non-numeric parts compared lexically."""
    parts = re.split(r"[.\-+]", v)
    out = []
    for p in parts:
        try:
            out.append((0, int(p)))
        except ValueError:
            out.append((1, p))
    return tuple(out)


# ── GitHub API helpers ───────────────────────────────────────────────────────


def _requests():
    import requests

    return requests


def list_all_releases():
    requests = _requests()
    out = []
    page = 1
    while True:
        r = requests.get(f"{API}/releases?per_page=100&page={page}", headers=HEADERS, timeout=15)
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        out.extend(batch)
        page += 1
    return out


def repo_is_private() -> bool:
    r = _requests().get(API, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return bool(r.json().get("private"))


def get_or_create_registry_release():
    """Return the existing registry-latest release, or create one if missing.
    Idempotent: never deletes or recreates the release. That avoids the
    delete-and-recreate race where two concurrent runs could each delete the
    other's freshly created release."""
    requests = _requests()
    r = requests.get(f"{API}/releases/tags/{REGISTRY_TAG}", headers=HEADERS, timeout=15)
    if r.status_code == 200:
        return r.json()
    if r.status_code != 404:
        r.raise_for_status()

    r = requests.post(
        f"{API}/releases",
        headers=HEADERS,
        json={
            "tag_name": REGISTRY_TAG,
            "name": "Marketplace registry index (latest)",
            "body": "Auto-published. `index.json` is the only relevant asset.",
            "draft": False,
            "prerelease": False,
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def delete_asset(asset_id):
    r = _requests().delete(f"{API}/releases/assets/{asset_id}", headers=HEADERS, timeout=15)
    if r.status_code not in (204, 404):
        r.raise_for_status()


def upload_json_asset(release, json_path, asset_name):
    upload_url = release["upload_url"].split("{")[0]
    with open(json_path, "rb") as f:
        data = f.read()
    r = _requests().post(
        f"{upload_url}?name={asset_name}",
        headers={**HEADERS, "Content-Type": "application/json"},
        data=data,
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


# ── Kit metadata from local source ──────────────────────────────────────────


def load_kit_definitions():
    """Return {name: index fields} from each kit-type-definition.json (v4/v5).

    Synthesizes the v3-shaped `runtime` block from kit_language / kit_port /
    kit_base_image so older registry consumers keep reading it.
    """
    out = {}
    if not os.path.isdir(KITS_DIR):
        return out
    for name in sorted(os.listdir(KITS_DIR)):
        defn = os.path.join(KITS_DIR, name, "kit-type-definition.json")
        if not os.path.isfile(defn):
            continue
        try:
            with open(defn) as f:
                d = json.load(f)
        except Exception as e:
            print(f"  warn: {name}: unreadable definition ({e}), skipping", file=sys.stderr)
            continue
        synth_runtime = {}
        if d.get("kit_language"):
            synth_runtime["language"] = d["kit_language"]
        if d.get("kit_port") is not None:
            synth_runtime["port"] = d["kit_port"]
        if d.get("kit_base_image"):
            synth_runtime["base_image"] = d["kit_base_image"]
        entry = {
            "display_name": d.get("display_name", name),
            "description": d.get("description", ""),
            "category": d.get("category", ""),
            "capabilities": d.get("capabilities", []),
            "sample_prompts": d.get("sample_prompts", []),
            "runtime": synth_runtime,
            "ui": d.get("ui", {}),
            "author": d.get("author", ""),
        }
        for k in ROUTING_FIELDS:
            if d.get(k):
                entry[k] = d[k]
        for k in OPTIONAL_FIELDS:
            if d.get(k) is not None:
                entry[k] = d[k]
        out[name] = {"version": d.get("version", ""), "fields": entry}
    return out


# ── SHA from release body ────────────────────────────────────────────────────


def extract_sha(body: str) -> str:
    r"""publish-kits.py writes `SHA256: \`sha256:<hex>\`` into the release body."""
    if not body:
        return ""
    m = re.search(r"sha256:[0-9a-f]{64}", body)
    return m.group(0) if m else ""


# ── Index build (pure) ───────────────────────────────────────────────────────


def build_entries(releases, definitions, use_download_url: bool):
    by_kit: dict[str, list[dict]] = {}
    for rel in releases:
        if rel["tag_name"] == REGISTRY_TAG:
            continue
        m = KIT_TAG_RE.match(rel["tag_name"])
        if not m:
            continue
        by_kit.setdefault(m.group("name"), []).append({"version": m.group("version"), "release": rel})

    entries = []
    for name in sorted(by_kit):
        defn = definitions.get(name)
        if defn is None:
            print(f"  skip: {name} has no local definition (orphan release)")
            continue

        latest = max(by_kit[name], key=lambda r: parse_version(r["version"]))
        rel = latest["release"]
        asset = next((a for a in rel.get("assets", []) if a["name"].endswith(".tar.gz")), None)
        if not asset:
            print(f"  warn: {name}-v{latest['version']} has no .tar.gz asset, skipping")
            continue
        if latest["version"] != defn["version"]:
            print(f"  warn: {name}: newest release {latest['version']} != definition {defn['version']}")

        download_url = asset["browser_download_url"]
        entries.append(
            {
                "name": name,
                "version": latest["version"],
                "tag": rel["tag_name"],
                "bundle_url": download_url if use_download_url else asset["url"],
                "bundle_download_url": download_url,
                "bundle_hash": extract_sha(rel.get("body", "")),
                **defn["fields"],
            }
        )
        print(f"  index: {name}@{latest['version']}")
    return entries


def build_payload(entries, registry):
    return {
        "version": 1,
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "registry": registry,
        "total": len(entries),
        "kits": entries,
    }


def _local_releases(definitions, registry):
    """Releases as publish-kits.py would create them, for --dry-run."""
    out = []
    for name, d in definitions.items():
        tag = f"{name}-v{d['version']}"
        out.append(
            {
                "tag_name": tag,
                "body": "`" + name + ".tar.gz` SHA256: `sha256:" + "0" * 64 + "`",
                "assets": [
                    {
                        "name": f"{name}.tar.gz",
                        "url": f"https://api.github.com/repos/{registry}/releases/assets/0",
                        "browser_download_url": f"https://github.com/{registry}/releases/download/{tag}/{name}.tar.gz",
                    }
                ],
            }
        )
    return out


def resolve_use_download_url(mode: str) -> bool:
    if mode not in BUNDLE_URL_MODES:
        raise SystemExit(f"BUNDLE_URL_MODE must be one of {', '.join(BUNDLE_URL_MODES)}, got {mode!r}")
    if mode == "download":
        return True
    if mode == "api":
        return False
    return not repo_is_private()


# ── Main ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Rebuild index.json and publish it on registry-latest")
    parser.add_argument("--dry-run", action="store_true", help="build from local definitions, publish nothing")
    parser.add_argument("--out", help="with --dry-run, write index.json here instead of stdout")
    args = parser.parse_args()
    mode = os.environ.get("BUNDLE_URL_MODE", "download")

    definitions = load_kit_definitions()

    if args.dry_run:
        registry = REPO or "lwm-org/jengakit-foss-kits"
        entries = build_entries(_local_releases(definitions, registry), definitions, mode != "api")
        payload = build_payload(entries, registry)
        text = json.dumps(payload, indent=2)
        if args.out:
            with open(args.out, "w") as f:
                f.write(text)
        else:
            print(text)
        print(f"\nDry run: {len(entries)} kit(s), nothing published.", file=sys.stderr)
        sys.exit(0 if entries else 1)

    if not TOKEN or not REPO:
        print("GITHUB_TOKEN and GITHUB_REPOSITORY are required (or pass --dry-run)", file=sys.stderr)
        sys.exit(2)

    print(f"Repo:         {REPO}")
    print(f"Registry tag: {REGISTRY_TAG}")
    use_download_url = resolve_use_download_url(mode)
    print(f"bundle_url:   {'browser_download_url' if use_download_url else 'API asset URL'} (mode {mode})")

    releases = list_all_releases()
    print(f"Releases:     {len(releases)}")

    entries = build_entries(releases, definitions, use_download_url)
    payload = build_payload(entries, REPO)

    with tempfile.TemporaryDirectory() as tmp:
        idx_path = os.path.join(tmp, INDEX_NAME)
        with open(idx_path, "w") as f:
            json.dump(payload, f, indent=2)

        # Ensure the release exists, then swap the asset. Never delete the
        # release: concurrent runs would race into a window where
        # `registry-latest` does not exist and clients fetching then fail.
        rel = get_or_create_registry_release()
        for a in rel.get("assets", []):
            if a["name"] == INDEX_NAME:
                delete_asset(a["id"])

        # Refetch for a clean upload_url after the delete.
        r = _requests().get(f"{API}/releases/tags/{REGISTRY_TAG}", headers=HEADERS, timeout=15)
        r.raise_for_status()
        upload_json_asset(r.json(), idx_path, INDEX_NAME)

    print(f"\nDone. {len(entries)} kit(s) in the index.")
    if not entries:
        print(
            "No per-kit releases found. Run publish-kits.py first, "
            "or check that release tags match the <name>-v<version> shape.",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
