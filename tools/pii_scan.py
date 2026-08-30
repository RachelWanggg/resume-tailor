#!/usr/bin/env python3
"""pii_scan.py — refuse to publish personal data.

Scans every file git would track for things that must never reach a public repo: real names,
emails, phone numbers, absolute home paths, browser session artifacts, and credentials.

    python3 tools/pii_scan.py            # scan the repo
    python3 tools/pii_scan.py --staged   # scan only staged files (use as a pre-commit hook)

Exit 0 = clean, exit 1 = findings. Run it before every push.

This is a safety net, not a guarantee. It catches the patterns that have actually leaked from
projects like this one; it cannot know your roommate's name. Read your own diff too.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Files that legitimately contain example contact details. They are checked against the
# fiction rules below instead of being skipped entirely.
EXAMPLE_FILES = {
    "profile.example/profile.yaml",
    "profile.example/master_resume.yaml",
    "profile.example/fact_ledger.md",
    "tests/fixtures/sample_bank.yaml",
}

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".codegraph", "outputs", "profile",
             ".playwright-mcp", ".venv", "venv"}
SKIP_SUFFIXES = {".pdf", ".docx", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip", ".db"}

# Domains and number ranges reserved for documentation, so they can never reach a real person.
FICTION_ALLOW = re.compile(
    r"example\.(com|org|net)|example-user|jordan-rivera-example|"
    r"@example\b|555-01\d\d|55501\d\d|localhost|127\.0\.0\.1|"
    # Obvious placeholders in documentation and example configs.
    r"YOUR_USERNAME|YOUR_NAME|<username>|<user>|USERNAME|\$HOME|~/",
    re.I,
)

CHECKS = [
    ("email",
     re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
     "a real email address"),
    ("phone",
     re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
     "something shaped like a phone number"),
    ("home_path",
     re.compile(r"/(?:Users|home)/(?!<)[A-Za-z0-9._-]+/"),
     "an absolute path containing a username"),
    ("linkedin_profile",
     re.compile(r"linkedin\.com/in/[A-Za-z0-9-]+"),
     "a LinkedIn profile URL"),
    ("secret",
     re.compile(r"\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|"
                r"(?:api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]{8,})", re.I),
     "a credential"),
    ("session_artifact",
     re.compile(r"\b(li_at|JSESSIONID|Set-Cookie|document\.cookie\s*=)\b"),
     "a browser session artifact"),
]

# Files whose whole job is to describe these patterns.
SELF_REFERENTIAL = {"tools/pii_scan.py", ".gitignore"}


def tracked_files(staged: bool) -> list[Path]:
    if staged:
        out = subprocess.run(["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
                             cwd=ROOT, capture_output=True, text=True)
        return [ROOT / line for line in out.stdout.split("\n") if line.strip()]

    files = []
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.relative_to(ROOT).parts):
            continue
        if p.suffix.lower() in SKIP_SUFFIXES:
            continue
        files.append(p)
    return files


def scan_file(path: Path) -> list[tuple[int, str, str, str]]:
    rel = str(path.relative_to(ROOT))
    if rel in SELF_REFERENTIAL:
        return []
    try:
        text = path.read_text(encoding="utf-8", errors="strict")
    except (UnicodeDecodeError, OSError):
        return []  # binary or unreadable; nothing to scan

    findings = []
    for lineno, line in enumerate(text.split("\n"), 1):
        for name, pattern, description in CHECKS:
            for match in pattern.finditer(line):
                hit = match.group(0)
                if FICTION_ALLOW.search(hit):
                    continue
                # A version string or a long digit run is not a phone number.
                if name == "phone" and re.search(r"\d{11,}", line.replace(" ", "")):
                    continue
                findings.append((lineno, name, hit, description))
    return findings


def main() -> int:
    ap = argparse.ArgumentParser(description="Scan for personal data before publishing")
    ap.add_argument("--staged", action="store_true", help="scan only staged files")
    args = ap.parse_args()

    total = 0
    for path in sorted(tracked_files(args.staged)):
        if not path.exists():
            continue
        for lineno, name, hit, description in scan_file(path):
            rel = path.relative_to(ROOT)
            note = ""
            if str(rel) in EXAMPLE_FILES:
                note = ("  ← example file: use example.com addresses and 555-01xx "
                        "numbers, which cannot reach anyone")
            print(f"{rel}:{lineno}: [{name}] {description}: {hit}{note}")
            total += 1

    print()
    if total:
        print(f"FAIL — {total} finding(s). Nothing should be pushed until these are resolved.")
        print("If a finding is a false positive, narrow the pattern in tools/pii_scan.py rather")
        print("than adding a blanket skip.")
        return 1

    print("PASS — no personal data found.")
    print("This is a safety net, not a guarantee. Read your diff before pushing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
