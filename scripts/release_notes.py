#!/usr/bin/env python3
"""Validate and render human-written web-image release notes."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def changelog_entry(changelog: Path, version: str) -> str:
    try:
        text = changelog.read_text(encoding="utf-8")
    except OSError as error:
        raise ValueError(f"cannot read {changelog}: {error.strerror}") from error

    heading = re.compile(rf"^## {re.escape(version)} — \d{{4}}-\d{{2}}-\d{{2}}\s*$", re.MULTILINE)
    matches = list(heading.finditer(text))
    if not matches:
        raise ValueError(f"{changelog}: missing release notes for version {version}")
    if len(matches) > 1:
        raise ValueError(f"{changelog}: duplicate release notes for version {version}")

    start = matches[0].start()
    next_heading = re.compile(r"^## ", re.MULTILINE).search(text, matches[0].end())
    entry = text[start : next_heading.start() if next_heading else len(text)].rstrip()
    if not entry[matches[0].end() - start :].strip():
        raise ValueError(f"{changelog}: release notes for version {version} are empty")
    return entry


def render(entry: str, source_sha: str, image: str) -> str:
    docs = f"https://github.com/CSUwangj/cryptography-learning/blob/{source_sha}/docs/deployment.md"
    return f"""{entry}

---

### Release metadata

- Source commit: {source_sha}
- Image: {image}
- Application Manifest schema: 1
- Supported platform: linux/amd64
- Compatibility: this image supports Application Manifest schema version 1. Rollback requires an image that also supports schema version 1; no other schema version is supported.
- [Web image support policy]({docs}#public-web-image-releases)
- [Host deployment guidance]({docs})
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("validate", "render"))
    parser.add_argument("version")
    parser.add_argument("source_sha", nargs="?")
    parser.add_argument("image", nargs="?")
    parser.add_argument("--changelog", type=Path, default=Path("CHANGELOG.md"))
    args = parser.parse_args()

    if args.command == "render" and (args.source_sha is None or args.image is None):
        parser.error("render requires SOURCE_SHA and IMAGE")

    try:
        entry = changelog_entry(args.changelog, args.version)
    except ValueError as error:
        print(f"release notes error: {error}", file=sys.stderr)
        return 1

    if args.command == "render":
        print(render(entry, args.source_sha, args.image), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
