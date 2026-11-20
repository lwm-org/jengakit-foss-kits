#!/usr/bin/env python3
"""Package each kit at its current version and create a GitHub release for it.

For every `kits/<name>/kit-type-definition.json` (kit schema 7):
  1. Read `version` from the definition.
  2. If a release tagged `<name>-v<version>` already exists with the expected
     asset AND the kit's content-hash matches the one recorded in the release
     body, skip (unchanged).
  3. If the release exists but the content DRIFTED (a kit fix that didn't bump
     the version), re-package and re-publish over the stale asset so the fix
     reaches users; the version tag alone is not trusted as a freshness key.
  4. Otherwise tar+gzip the kit into `<name>.tar.gz`, create the release,
     upload the tarball, and record its content-hash in the body.

Used by `.github/workflows/publish.yml` on push to `main`.

`--dry-run` packs every kit into a temporary folder (or `--out DIR`) and prints
its tag, bundle sha256 and content hash without calling GitHub. The PR
workflow runs it so a kit that cannot be packed fails before it reaches `main`.

Env (not needed for --dry-run):
  GITHUB_TOKEN        auth (the workflow's own token, contents: write)
  GITHUB_REPOSITORY   `<owner>/<repo>` (provided by Actions)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KITS_DIR = os.path.join(ROOT, "kits")
sys.path.insert(0, ROOT)  # so `tools` imports work when run from CI / any CWD

from tools.kit_bundler import _STRIP_DIRS  # noqa: E402
from tools.kit_bundler import pack as _kit_pack  # noqa: E402

# .get (not []) so the module imports without env for unit tests; the API
# helpers still fail loudly at request time if a token is genuinely missing.
TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO = os.environ.get("GITHUB_REPOSITORY", "")
API = f"https://api.github.com/repos/{REPO}"

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def list_kits():
    """Return [(name, version, kit_dir), ...] for every well-formed kit.

    Reads kit-type-definition.json (kit schema 7) only.
    """
    out = []
    for name in sorted(os.listdir(KITS_DIR)):
        kit_dir = os.path.join(KITS_DIR, name)
        defn = os.path.join(kit_dir, "kit-type-definition.json")
        if not os.path.isdir(kit_dir) or not os.path.isfile(defn):
            continue
        try:
            with open(defn) as f:
                version = json.load(f).get("version", "")
        except Exception:
            continue
        if not version:
            print(f"  skip: {name} has no version", file=sys.stderr)
            continue
        out.append((name, version, kit_dir))
    return out


def get_release(tag):
    r = requests.get(f"{API}/releases/tags/{tag}", headers=HEADERS, timeout=15)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


def create_release(tag, name, body=""):
    r = requests.post(
        f"{API}/releases",
        headers=HEADERS,
        json={
            "tag_name": tag,
            "name": name,
            "body": body,
            "draft": False,
            "prerelease": False,
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def upload_asset(release, asset_path, asset_name):
    upload_url = release["upload_url"].split("{")[0]
    with open(asset_path, "rb") as f:
        data = f.read()
    r = requests.post(
        f"{upload_url}?name={asset_name}",
        headers={**HEADERS, "Content-Type": "application/gzip"},
        data=data,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def delete_asset(asset_id):
    r = requests.delete(f"{API}/releases/assets/{asset_id}", headers=HEADERS, timeout=15)
    r.raise_for_status()


def patch_release_body(release_id, body):
    r = requests.patch(f"{API}/releases/{release_id}", headers=HEADERS, json={"body": body}, timeout=15)
    r.raise_for_status()
    return r.json()


def content_hash(kit_dir):
    """Deterministic hash of a kit's shipping content.

    Independent of tar/gzip (whose headers embed non-deterministic mtimes),
    so it can detect that a kit's FILES changed even when its version tag did
    not, which is what lets a kit fix propagate to the marketplace instead of
    being skipped as 'already released'. Applies the same dev-file exclusions
    as the bundler so it hashes exactly what ships.
    """
    h = hashlib.sha256()
    files = []
    for root, _dirs, fnames in os.walk(kit_dir):
        for fn in fnames:
            path = os.path.join(root, fn)
            rel = os.path.relpath(path, kit_dir)
            if any(part in _STRIP_DIRS for part in rel.split(os.sep)):
                continue
            files.append((rel, path))
    for rel, path in sorted(files):
        h.update(rel.replace(os.sep, "/").encode())
        h.update(b"\0")
        with open(path, "rb") as f:
            h.update(f.read())
        h.update(b"\0")
    return h.hexdigest()


def extract_content_hash(body):
    m = re.search(r"content-hash:\s*([0-9a-f]{64})", body or "")
    return m.group(1) if m else ""


def _release_body(asset_name, gzip_sha, content_hex):
    # Keep the `sha256:<hex>` bundle line FIRST: refresh-registry-index.py's
    # extract_sha() reads the first sha256 match as the bundle integrity hash.
    return (
        "Auto-published by `.github/workflows/publish.yml`.\n\n"
        f"`{asset_name}` SHA256: `{gzip_sha}`\n"
        f"content-hash: {content_hex}"
    )


def package_kit(name, kit_dir, dst_path):
    """Tar+gzip the kit dir, with `name/` as the top-level prefix.

    Delegates to tools/kit_bundler.pack, a byte-for-byte copy of the engine's
    lib/services/kit_bundler.py, so bundles have the same shape as the engine's
    Kit Studio download and "Install from file" flow.
    """
    return _kit_pack(name, kit_dir, dst_path)


def dry_run(out_dir=None):
    """Pack every kit locally; no network, no token. Returns the kit count."""
    kits = list_kits()
    print(f"Kits:  {len(kits)} (dry run, nothing published)")
    with tempfile.TemporaryDirectory() as tmp:
        dst = out_dir or tmp
        os.makedirs(dst, exist_ok=True)
        for name, version, kit_dir in kits:
            asset_name = f"{name}.tar.gz"
            gzip_sha = package_kit(name, kit_dir, os.path.join(dst, asset_name))
            print(f"  pack:    {name}-v{version}  {gzip_sha}  content-hash:{content_hash(kit_dir)}")
    return len(kits)


def main():
    parser = argparse.ArgumentParser(description="Release every kit whose version has no release yet")
    parser.add_argument("--dry-run", action="store_true", help="pack every kit locally and publish nothing")
    parser.add_argument("--out", help="with --dry-run, keep the bundles in this folder")
    args = parser.parse_args()
    if args.dry_run:
        if not dry_run(args.out):
            print("no kits found", file=sys.stderr)
            sys.exit(1)
        return
    if not TOKEN or not REPO:
        print("GITHUB_TOKEN and GITHUB_REPOSITORY are required (or pass --dry-run)", file=sys.stderr)
        sys.exit(2)

    print(f"Repo:  {REPO}")
    kits = list_kits()
    print(f"Kits:  {len(kits)}")

    published = 0
    republished = 0
    skipped = 0
    for name, version, kit_dir in kits:
        tag = f"{name}-v{version}"
        asset_name = f"{name}.tar.gz"
        existing = get_release(tag)
        asset = None
        if existing:
            asset = next((a for a in existing.get("assets", []) if a["name"] == asset_name), None)
        content_hex = content_hash(kit_dir)

        # Already released at this version AND the content is unchanged: skip.
        # If the content drifted (a kit fix that didn't bump the version), we
        # RE-PUBLISH over the stale bundle so the fix actually reaches users,
        # instead of the old "already released → skip" that stranded fixes.
        if existing and asset:
            if extract_content_hash(existing.get("body", "")) == content_hex:
                print(f"  skip:    {tag} (unchanged)")
                skipped += 1
                continue
            with tempfile.TemporaryDirectory() as tmp:
                tarball = os.path.join(tmp, asset_name)
                gzip_sha = package_kit(name, kit_dir, tarball)
                print(f"  update:  {tag} (content changed, republishing over stale bundle)")
                delete_asset(asset["id"])
                upload_asset(existing, tarball, asset_name)
                patch_release_body(existing["id"], _release_body(asset_name, gzip_sha, content_hex))
            republished += 1
            continue

        with tempfile.TemporaryDirectory() as tmp:
            tarball = os.path.join(tmp, asset_name)
            gzip_sha = package_kit(name, kit_dir, tarball)
            print(f"  publish: {tag}  {gzip_sha[:23]}...")
            body = _release_body(asset_name, gzip_sha, content_hex)
            release = existing or create_release(tag, name=tag, body=body)
            if existing:  # release exists but the asset was missing; refresh body too
                patch_release_body(existing["id"], body)
            upload_asset(release, tarball, asset_name)
        published += 1

    print(f"\nDone: {published} published, {republished} republished, {skipped} unchanged.")


if __name__ == "__main__":
    main()
