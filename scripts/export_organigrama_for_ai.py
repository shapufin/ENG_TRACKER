#!/usr/bin/env python3
"""Export Organigrama source into one AI-readable Markdown bundle.

The exporter is read-only with respect to source code. It collects the
Organigrama backend/frontend implementation, tests, E2E coverage, and the
related migration command, then groups files by language in a deterministic
Markdown document.

Usage:
    python scripts/export_organigrama_for_ai.py
    python scripts/export_organigrama_for_ai.py --output C:/temp/organigrama.md
    python scripts/export_organigrama_for_ai.py --root plugins/organigrama --root frontend/src/plugins/organigrama
"""

from __future__ import annotations

import argparse
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_ROOTS = (
    Path("plugins/organigrama"),
    Path("frontend/src/plugins/organigrama"),
    Path("frontend/e2e/organigrama.spec.ts"),
    Path("apps/users/management/commands/migrate_organigrama_techs.py"),
)
DEFAULT_OUTPUT = Path(".devin/tracking/organigrama-ai-bundle.md")

LANGUAGE_GROUPS = OrderedDict(
    [
        ("Python", {".py"}),
        ("TypeScript", {".ts"}),
        ("TSX / React", {".tsx"}),
        ("JavaScript", {".js", ".jsx", ".mjs", ".cjs"}),
        ("Styles", {".css", ".scss", ".sass", ".less"}),
        ("HTML", {".html", ".htm"}),
        ("JSON", {".json"}),
        ("Markdown", {".md"}),
        ("PowerShell", {".ps1"}),
    ]
)

EXCLUDED_DIRECTORY_NAMES = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "venv",
    ".venv",
}
EXCLUDED_SUFFIXES = {
    ".pyc",
    ".pyo",
    ".map",
    ".sqlite",
    ".sqlite3",
    ".db",
    ".db3",
    ".pem",
    ".key",
    ".crt",
    ".cer",
    ".p12",
    ".pfx",
}
EXCLUDED_FILE_NAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
}

FENCE_BY_GROUP = {
    "Python": "python",
    "TypeScript": "typescript",
    "TSX / React": "tsx",
    "JavaScript": "javascript",
    "Styles": "css",
    "HTML": "html",
    "JSON": "json",
    "Markdown": "markdown",
    "PowerShell": "powershell",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bundle Organigrama source files into an AI-readable Markdown document."
    )
    parser.add_argument(
        "--root",
        action="append",
        dest="roots",
        help="Source file or directory, relative to the repository root. Repeatable.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"Output Markdown path (default: {DEFAULT_OUTPUT}).",
    )
    parser.add_argument(
        "--include-unknown",
        action="store_true",
        help="Include recognized text files with extensions outside the default language groups.",
    )
    return parser.parse_args()


def find_repo_root(script_path: Path) -> Path:
    """Resolve the repository root from this script's location."""
    return script_path.resolve().parent.parent


def is_excluded(path: Path) -> bool:
    if any(part in EXCLUDED_DIRECTORY_NAMES for part in path.parts):
        return True
    if path.name in EXCLUDED_FILE_NAMES:
        return True
    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return True
    lower_name = path.name.lower()
    return lower_name.endswith((".secret", ".secrets", ".credentials"))


def iter_source_files(repo_root: Path, roots: Iterable[Path]) -> tuple[list[Path], list[str]]:
    files: set[Path] = set()
    skipped: list[str] = []

    for configured_root in roots:
        path = (repo_root / configured_root).resolve()
        if not path.exists():
            skipped.append(f"missing source: {configured_root.as_posix()}")
            continue
        if path.is_file():
            candidates = [path]
        else:
            candidates = [candidate for candidate in path.rglob("*") if candidate.is_file()]
        for candidate in candidates:
            relative = candidate.relative_to(repo_root)
            if is_excluded(relative):
                skipped.append(f"excluded: {relative.as_posix()}")
                continue
            files.add(candidate)

    return sorted(files, key=lambda item: item.relative_to(repo_root).as_posix().lower()), skipped


def language_group(path: Path, include_unknown: bool) -> str | None:
    suffix = path.suffix.lower()
    for group, suffixes in LANGUAGE_GROUPS.items():
        if suffix in suffixes:
            return group
    if include_unknown:
        try:
            path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            return None
        return "Other text"
    return None


def read_source(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def fence_for(group: str) -> str:
    return FENCE_BY_GROUP.get(group, "text")


def safe_heading(value: str) -> str:
    return value.replace("\r", " ").replace("\n", " ").strip()


def build_bundle(
    repo_root: Path,
    files: list[Path],
    skipped: list[str],
    output_path: Path,
    include_unknown: bool,
) -> str:
    grouped: OrderedDict[str, list[tuple[Path, str]]] = OrderedDict(
        (group, []) for group in LANGUAGE_GROUPS
    )
    if include_unknown:
        grouped["Other text"] = []

    unreadable: list[str] = []
    for path in files:
        group = language_group(path, include_unknown)
        if group is None:
            continue
        content = read_source(path)
        relative = path.relative_to(repo_root)
        if content is None:
            unreadable.append(relative.as_posix())
            continue
        grouped[group].append((relative, content))

    included = [(group, entries) for group, entries in grouped.items() if entries]
    file_count = sum(len(entries) for _, entries in included)
    line_count = sum(content.count("\n") + (1 if content and not content.endswith("\n") else 0) for _, entries in included for _, content in entries)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    output: list[str] = [
        "# Organigrama AI Code Bundle",
        "",
        "> Generated artifact. Do not edit this file; regenerate it with the exporter.",
        "> Source files remain authoritative. Each section preserves the original repository-relative path.",
        "",
        "## Bundle manifest",
        "",
        f"- Generated at: `{generated_at}`",
        f"- Repository root: `{repo_root}`",
        f"- Included files: **{file_count}**",
        f"- Included lines: **{line_count}**",
        f"- Language groups: **{len(included)}**",
        f"- Output path: `{output_path}`",
        "",
        "## Recommended AI reading order",
        "",
        "1. Read the Python backend model, serializer, ViewSet, and services.",
        "2. Read the TypeScript types, API services, and React Query hooks.",
        "3. Read the TSX pages/components in builder → publish/admin → viewer order.",
        "4. Read tests and E2E coverage to compare intended behavior with implementation.",
        "5. Treat `group_uuid` as visual membership and `reports_to`/`contains` as explicit hierarchy unless the code says otherwise.",
        "",
        "## Export policy",
        "",
        "- Included: Organigrama backend/frontend source, tests, E2E coverage, and the related migration command.",
        "- Excluded: dependencies, build output, caches, bytecode, databases, certificates, private keys, and environment files.",
        "- Files are grouped by language but retain their original path and content boundaries.",
        "",
    ]

    if skipped or unreadable:
        output.extend(["## Skipped files", ""])
        for item in sorted(set(skipped + [f"unreadable: {item}" for item in unreadable])):
            output.append(f"- `{item}`")
        output.append("")

    for group, entries in included:
        output.extend([f"# LANGUAGE: {group}", ""])
        for relative, content in entries:
            line_count_for_file = content.count("\n") + (1 if content and not content.endswith("\n") else 0)
            output.extend(
                [
                    f"## FILE: `{relative.as_posix()}`",
                    "",
                    f"- Relative path: `{relative.as_posix()}`",
                    f"- Lines: **{line_count_for_file}**",
                    "",
                    f"```{fence_for(group)}",
                    content.rstrip("\n"),
                    "```",
                    "",
                ]
            )

    return "\n".join(output).rstrip() + "\n"


def main() -> int:
    args = parse_args()
    repo_root = find_repo_root(Path(__file__))
    configured_roots = tuple(Path(root) for root in args.roots) if args.roots else DEFAULT_ROOTS
    output_path = (repo_root / args.output).resolve()
    files, skipped = iter_source_files(repo_root, configured_roots)
    bundle = build_bundle(repo_root, files, skipped, output_path, args.include_unknown)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(bundle, encoding="utf-8", newline="\n")

    included_count = sum(1 for line in bundle.splitlines() if line.startswith("## FILE: `"))
    try:
        display_output = output_path.relative_to(repo_root)
    except ValueError:
        display_output = output_path
    print(f"Wrote {display_output}")
    print(f"Included files: {included_count}")
    print(f"Configured roots: {len(configured_roots)}")
    if skipped:
        print(f"Skipped entries: {len(skipped)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
