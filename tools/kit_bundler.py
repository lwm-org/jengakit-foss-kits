"""Kit bundler — single source of truth for the FOSS-canonical kit bundle format.

Format: gzipped tar (`<kit-name>.tar.gz`) with the kit name as the top-level
directory prefix. Strips `__pycache__`, `node_modules`, `dist`, `.git`.
Matches the format produced by `scripts/publish-kits.py.package_kit` exactly
— that script imports from this module so there's a single packing
implementation across Studio downloads, CI publishes, and "Install from file"
uploads.

Used by:
  - demo-ui/api_v1/kit_studio.py — Download bundle endpoint
  - demo-ui/api_v1/kit_studio.py — Install from bundle endpoint
  - scripts/publish-kits.py        — kit-release CI

Round-trip contract: a bundle produced by `pack()` is structurally
byte-equivalent (same arcname prefix, same exclusion rules, same gzip
compression) to one produced by `package_kit()` historically. Test
`tests/test_kit_bundler.py::BundleRoundTripTests` asserts this.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import tarfile
import tempfile
from typing import Optional

# Strip these directory names anywhere in the tarball.
_STRIP_DIRS = frozenset({"__pycache__", "node_modules", "dist", ".git"})


def _strip_dev_files(tarinfo: tarfile.TarInfo) -> Optional[tarfile.TarInfo]:
    """Filter callable for tarfile.add — drops dev cruft from the archive."""
    if any(part in tarinfo.name.split("/") for part in _STRIP_DIRS):
        return None
    return tarinfo


def pack(kit_name: str, kit_dir: str, dst_path: str) -> str:
    """Tar+gzip `kit_dir` into `dst_path` with `<kit_name>/` as top-level prefix.

    Returns sha256 digest of the resulting tarball, prefixed with `sha256:`
    (matches the format `scripts/refresh-registry-index.py` extracts from
    release bodies).
    """
    if not os.path.isdir(kit_dir):
        raise FileNotFoundError(f"kit_dir not found: {kit_dir}")
    with tarfile.open(dst_path, "w:gz") as tar:
        tar.add(kit_dir, arcname=kit_name, filter=_strip_dev_files)
    sha = hashlib.sha256()
    with open(dst_path, "rb") as f:
        for chunk in iter(lambda: f.read(64 * 1024), b""):
            sha.update(chunk)
    return f"sha256:{sha.hexdigest()}"


def unpack(tarball_path: str, into_dir: str, expected_kit_name: Optional[str] = None) -> str:
    """Extract `tarball_path` into `into_dir`. Returns the extracted kit name.

    The kit name is the top-level directory in the tarball. If
    `expected_kit_name` is given, asserts it matches; otherwise infers from
    the tarball.

    Refuses symlinks, hardlinks, and parent-traversal paths (defense against
    malicious bundles).
    """
    if not os.path.isfile(tarball_path):
        raise FileNotFoundError(f"tarball not found: {tarball_path}")

    with tarfile.open(tarball_path, "r:gz") as tar:
        members = []
        top_dirs: set[str] = set()
        for m in tar.getmembers():
            if m.issym() or m.islnk():
                continue
            if ".." in m.name.split("/"):
                continue
            members.append(m)
            top_dirs.add(m.name.split("/", 1)[0])

        if not members:
            raise ValueError(f"tarball {tarball_path} contains no usable members")
        if len(top_dirs) > 1:
            raise ValueError(
                f"tarball {tarball_path} has multiple top-level dirs {sorted(top_dirs)} "
                "— expected a single <kit_name>/ root"
            )

        kit_name = next(iter(top_dirs))
        if expected_kit_name is not None and kit_name != expected_kit_name:
            raise ValueError(f"tarball top-level dir {kit_name!r} does not match expected {expected_kit_name!r}")

        os.makedirs(into_dir, exist_ok=True)
        # Python 3.12 added the `filter` param for safe extraction; older
        # versions get the manual-checked members list above.
        if hasattr(tarfile, "data_filter"):
            tar.extractall(into_dir, members=members, filter="data")
        else:
            tar.extractall(into_dir, members=members)

    return kit_name


def install_to_kits_dir(tarball_path: str, kits_dir: str) -> str:
    """Install a kit bundle into `kits_dir`. Atomic: extracts to tmp, then
    swaps. Refuses to overwrite an existing kit dir without explicit removal
    (caller's job).

    Returns the installed kit_name. Raises FileExistsError if the kit already
    exists in `kits_dir`.
    """
    tmp_dir = tempfile.mkdtemp(prefix="jk_kit_install_")
    try:
        kit_name = unpack(tarball_path, tmp_dir)
        target = os.path.join(kits_dir, kit_name)
        if os.path.exists(target):
            raise FileExistsError(
                f"kit {kit_name!r} already installed at {target}; remove it first before reinstalling"
            )
        os.makedirs(kits_dir, exist_ok=True)
        shutil.move(os.path.join(tmp_dir, kit_name), target)
        return kit_name
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


__all__ = ["install_to_kits_dir", "pack", "unpack"]
