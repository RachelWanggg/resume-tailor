#!/usr/bin/env python3
"""Search and maintain the master resume (header, education, and approved bullets).

The tool never writes a resume and never stores JDs. It ranks approved bullets
against a JD so the AI tailoring workflow can reuse known-good evidence before
generating new prose.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# The operator's own bullet bank. Gitignored; created by `cp -r profile.example profile`.
# Override with --bank to point at a different file (the test suite does this).
BANK_PATH = ROOT / "profile" / "master_resume.yaml"

REQUIRED_FIELDS = {
    "id", "status", "source", "source_role", "role_families", "technologies",
    "themes", "locked_metrics", "text",
}
ROLE_PATTERNS = (
    ("data_engineer", r"data engineer|data platform|etl|elt|warehouse|lakehouse|kafka|streaming"),
    ("ai_ml", r"\bai\b|machine learning|\bml\b|llm|genai|nlp|inference|model|agentic"),
    ("security", r"security|threat|authn|authz|vulnerability|compliance"),
    ("sre_platform", r"sre|devops|platform engineer|infrastructure|on-call|observability"),
    ("full_stack", r"full[- ]stack|frontend|front-end|react|vue|user interface"),
    ("backend", r"backend|back-end|api|distributed systems|server-side|software engineer"),
)
ALIASES = {
    "ci/cd": ("ci/cd", "continuous integration", "github actions"),
    "rest apis": ("rest", "restful", "api", "apis"),
    "llm evaluation": ("llm evaluation", "evaluation harness", "eval harness", "golden set"),
    "multi-agent orchestration": ("multi-agent", "multi agent", "agentic system"),
    "aws sns": ("sns", "amazon sns"),
    "aws sqs": ("sqs", "amazon sqs"),
    "aws lambda": ("lambda", "serverless"),
    "sag": ("sag", "sql-augmented generation", "sql augmented generation"),
}
STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it",
    "of", "on", "or", "that", "the", "their", "this", "to", "use", "using", "with", "will",
    "you", "your", "we", "our", "work", "working", "experience",
}


def load_bank(path: Path = BANK_PATH) -> dict:
    """Load JSON-syntax YAML using only the Python standard library."""
    if not path.exists():
        raise SystemExit(
            f"No bullet bank found at {path}\n"
            "Create your profile first:\n"
            "    cp -r profile.example profile\n"
            "then edit profile/master_resume.yaml with your own roles and bullets."
        )
    return json.loads(path.read_text())


def save_bank(bank: dict, path: Path = BANK_PATH) -> None:
    path.write_text(json.dumps(bank, indent=2, ensure_ascii=False) + "\n")


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def words(text: str) -> set[str]:
    return {
        token for token in re.findall(r"[a-z][a-z0-9+#./-]*", normalize(text))
        if token not in STOPWORDS
    }


def infer_role_family(jd: str, role: str = "") -> str:
    haystack = f"{role}\n{jd}".lower()
    for family, pattern in ROLE_PATTERNS:
        if re.search(pattern, haystack):
            return family
    return "other"


def term_present(term: str, text: str) -> bool:
    lowered = normalize(text)
    aliases = ALIASES.get(term.lower(), (term.lower(),))
    return any(re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", lowered) for alias in aliases)


def score_bullet(entry: dict, jd: str, role_family: str) -> tuple[float, dict]:
    tech_hits = [tech for tech in entry["technologies"] if term_present(tech, jd)]
    theme_hits = [theme for theme in entry["themes"] if term_present(theme, jd)]
    family_hit = role_family in entry["role_families"]
    jd_words, bullet_words = words(jd), words(entry["text"])
    union = jd_words | bullet_words
    lexical = len(jd_words & bullet_words) / len(union) if union else 0.0
    score = 5.0 * family_hit + 3.0 * len(tech_hits) + 1.5 * len(theme_hits) + 4.0 * lexical
    return round(score, 3), {
        "role_family": family_hit,
        "technology_hits": tech_hits,
        "theme_hits": theme_hits,
        "lexical_overlap": round(lexical, 3),
    }


def search_bank(jd: str, role: str = "", limit: int = 8, source: str = "",
                bank_path: Path = BANK_PATH) -> dict:
    bank = load_bank(bank_path)
    role_family = infer_role_family(jd, role)
    candidates = []
    for entry in bank["bullets"]:
        if entry.get("status") != "approved":
            continue
        if source and normalize(entry["source"]) != normalize(source):
            continue
        score, reasons = score_bullet(entry, jd, role_family)
        if score <= 0:
            continue
        candidates.append({
            "id": entry["id"],
            "score": score,
            "source": entry["source"],
            "source_role": entry["source_role"],
            "technologies": entry["technologies"],
            "locked_metrics": entry["locked_metrics"],
            "text": entry["text"],
            "match": reasons,
        })
    candidates.sort(key=lambda item: (-item["score"], item["id"]))
    return {
        "role_family": role_family,
        "candidate_count": len(candidates),
        "candidates": candidates[:limit],
    }


def validate_bank(bank: dict) -> list[str]:
    errors: list[str] = []
    if bank.get("schema_version") != 2:
        errors.append("schema_version must be 2")
    bullets = bank.get("bullets")
    if not isinstance(bullets, list):
        return errors + ["bullets must be a list"]
    seen_ids: set[str] = set()
    seen_text: set[str] = set()
    for index, entry in enumerate(bullets):
        missing = REQUIRED_FIELDS - set(entry)
        if missing:
            errors.append(f"bullets[{index}] missing: {', '.join(sorted(missing))}")
            continue
        if entry["id"] in seen_ids:
            errors.append(f"duplicate id: {entry['id']}")
        seen_ids.add(entry["id"])
        normalized_text = normalize(entry["text"])
        if normalized_text in seen_text:
            errors.append(f"duplicate text: {entry['id']}")
        seen_text.add(normalized_text)
        if entry["status"] != "approved":
            errors.append(f"non-approved entry in canonical bank: {entry['id']}")
        plain_text = entry["text"].replace("**", "")
        for metric in entry["locked_metrics"]:
            if normalize(metric) not in normalize(plain_text):
                errors.append(f"metric {metric!r} missing from {entry['id']}")
    return errors


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def add_approved(args: argparse.Namespace) -> dict:
    if not args.approved:
        raise SystemExit("Refusing to add: --approved is required after explicit operator approval")
    bank = load_bank(args.bank)
    text = args.bullet.strip()
    if any(normalize(item["text"]) == normalize(text) for item in bank["bullets"]):
        raise SystemExit("Refusing to add: identical bullet already exists")
    digest = hashlib.sha256(normalize(text).encode()).hexdigest()[:8]
    entry = {
        "id": args.id or f"{slug(args.source)}_{digest}",
        "status": "approved",
        "source": args.source,
        "source_role": args.source_role,
        "role_families": [item.strip() for item in args.role_families.split(",") if item.strip()],
        "technologies": [item.strip() for item in args.technologies.split(",") if item.strip()],
        "themes": [item.strip() for item in args.themes.split(",") if item.strip()],
        "locked_metrics": [item.strip() for item in args.locked_metrics.split(",") if item.strip()],
        "text": text,
    }
    bank["bullets"].append(entry)
    errors = validate_bank(bank)
    if errors:
        raise SystemExit("Refusing to write invalid bank:\n" + "\n".join(errors))
    save_bank(bank, args.bank)
    return entry


def read_jd(args: argparse.Namespace) -> str:
    if args.jd_file:
        return Path(args.jd_file).read_text(errors="ignore")
    if args.jd_text is not None:
        return args.jd_text
    raise SystemExit("--jd-file or --jd-text is required")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Search the master resume's approved bullets")
    parser.add_argument(
        "--bank", type=Path, default=BANK_PATH,
        help="path to the bullet bank (default: profile/master_resume.yaml)",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    search = sub.add_parser("search", help="rank approved bullets against a JD")
    search.add_argument("--jd-file")
    search.add_argument("--jd-text")
    search.add_argument("--role", default="")
    search.add_argument("--source", default="")
    search.add_argument("--limit", type=int, default=8)
    sub.add_parser("validate", help="validate bank schema and locked metrics")
    add = sub.add_parser("add", help="add one explicitly approved bullet")
    add.add_argument("--approved", action="store_true")
    add.add_argument("--id")
    add.add_argument("--source", required=True)
    add.add_argument("--source-role", required=True)
    add.add_argument("--role-families", required=True)
    add.add_argument("--technologies", required=True)
    add.add_argument("--themes", default="")
    add.add_argument("--locked-metrics", default="")
    add.add_argument("--bullet", required=True)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "search":
        result = search_bank(read_jd(args), args.role, args.limit, args.source, args.bank)
    elif args.command == "validate":
        errors = validate_bank(load_bank(args.bank))
        result = {"valid": not errors, "errors": errors}
    else:
        result = add_approved(args)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
