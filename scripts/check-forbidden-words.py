#!/usr/bin/env python3
"""Fail when a tracked file names a hosting platform the kits must not depend on.

The kits run on Docker. Their files, prompts, schema and docs stay free of
orchestrator and hosted-platform names so a kit never reads as if it needed one.

Each pattern is matched case-insensitively against every tracked text file.
A line that must keep a match (a schema key the validator reads, code whose
behaviour cannot change in a prose sweep) goes in
`scripts/forbidden-words-allow.txt` as `path<TAB>regex`, with a `#` comment
above it saying why. The regex is searched in the matching line.

Exit 0 when clean, 1 when any unallowed match is found.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALLOW_FILE = os.path.join(ROOT, "scripts", "forbidden-words-allow.txt")
SELF = {"scripts/check-forbidden-words.py", "scripts/forbidden-words-allow.txt"}

PATTERNS = [
    r"kubernetes",
    r"\bk8s\b",
    r"\bgke\b",
    r"\bhelm\b",
    r"\bkubectl\b",
    r"svc\.cluster\.local",
    r"cloud[ -]platform",
    r"jengakit[ -]cloud",
    r"cloud[ -]only",
]
FORBIDDEN = re.compile("|".join(PATTERNS), re.IGNORECASE)


def load_allow() -> list[tuple[str, re.Pattern[str]]]:
    out = []
    if not os.path.exists(ALLOW_FILE):
        return out
    with open(ALLOW_FILE, encoding="utf-8") as f:
        for n, raw in enumerate(f, 1):
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if "\t" not in line:
                sys.exit(f"{ALLOW_FILE}:{n}: expected 'path<TAB>regex'")
            path, rx = line.split("\t", 1)
            out.append((path.strip(), re.compile(rx.strip())))
    return out


def tracked_files() -> list[str]:
    res = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True
    )
    return [p for p in res.stdout.decode().split("\0") if p]


def main() -> int:
    allow = load_allow()
    used = set()
    hits = []
    for rel in tracked_files():
        if rel in SELF:
            continue
        try:
            with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
                lines = f.readlines()
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue
        for n, line in enumerate(lines, 1):
            if not FORBIDDEN.search(line):
                continue
            ok = False
            for i, (path, rx) in enumerate(allow):
                if path == rel and rx.search(line):
                    ok = True
                    used.add(i)
                    break
            if not ok:
                hits.append(f"{rel}:{n}: {line.strip()}")
    stale = [f"{allow[i][0]}\t{allow[i][1].pattern}" for i in range(len(allow)) if i not in used]
    for h in hits:
        print(h)
    for s in stale:
        print(f"stale allow-list entry (matches nothing): {s}")
    if hits or stale:
        print(f"\n{len(hits)} forbidden reference(s), {len(stale)} stale allow-list entr(ies).")
        print("Rewrite in Docker or product terms, or allow-list with a reason in scripts/forbidden-words-allow.txt.")
        return 1
    print("No forbidden platform references.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
