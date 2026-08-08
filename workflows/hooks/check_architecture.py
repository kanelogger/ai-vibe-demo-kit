#!/usr/bin/env python3
"""Validate directory-level architecture indexes under configured code roots."""

from __future__ import annotations

import argparse
import ast
import fnmatch
import glob
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import List, Optional


class ConfigError(ValueError):
    """Raised when architecture_memory configuration is invalid."""


@dataclass(frozen=True)
class ArchitectureConfig:
    filename: str
    code_roots: tuple[str, ...]
    exclude: tuple[str, ...]


@dataclass(frozen=True)
class CheckResult:
    module_count: int
    code_root_count: int
    issues: tuple[str, ...]


def _scalar(raw: str, line_number: int) -> str:
    value = raw.strip()
    if not value:
        raise ConfigError(f"line {line_number}: expected a scalar value")
    if value[0] in {'"', "'"}:
        try:
            parsed = ast.literal_eval(value)
        except (SyntaxError, ValueError) as error:
            raise ConfigError(
                f"line {line_number}: invalid quoted value"
            ) from error
        if not isinstance(parsed, str):
            raise ConfigError(f"line {line_number}: expected a string")
        return parsed
    return value.split(" #", 1)[0].strip()


def parse_architecture_config(config_path: Path) -> ArchitectureConfig:
    """Parse the small architecture_memory subset used by project.yml."""
    lines = config_path.read_text(encoding="utf-8").splitlines()
    in_section = False
    current_list: Optional[str] = None
    filename: Optional[str] = None
    values: dict[str, list[str]] = {"code_roots": [], "exclude": []}

    for line_number, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        indent = len(line) - len(line.lstrip(" "))
        if not in_section:
            if indent == 0 and re.fullmatch(
                r"architecture_memory:\s*(?:#.*)?", stripped
            ):
                in_section = True
            continue

        if indent == 0:
            break

        key_match = re.fullmatch(r"  ([a-z_]+):(?:\s*(.*))?", line)
        if key_match:
            key, raw_value = key_match.groups()
            current_list = None
            if key == "filename":
                filename = _scalar(raw_value or "", line_number)
            elif key in values:
                if raw_value:
                    raise ConfigError(
                        f"line {line_number}: {key} must be a YAML list"
                    )
                current_list = key
            continue

        item_match = re.fullmatch(r"    -\s+(.+)", line)
        if item_match and current_list:
            values[current_list].append(_scalar(item_match.group(1), line_number))
            continue

        if current_list:
            raise ConfigError(
                f"line {line_number}: unsupported {current_list} list item"
            )

    if not in_section:
        raise ConfigError("missing architecture_memory section")
    if not filename:
        raise ConfigError("architecture_memory.filename is required")
    if not values["code_roots"]:
        raise ConfigError("architecture_memory.code_roots must not be empty")

    for value in (filename, *values["code_roots"], *values["exclude"]):
        path = PurePosixPath(value)
        if path.is_absolute() or ".." in path.parts:
            raise ConfigError(f"architecture path must stay inside the project: {value}")

    return ArchitectureConfig(
        filename=filename,
        code_roots=tuple(values["code_roots"]),
        exclude=tuple(values["exclude"]),
    )


def _matches_pattern(relative_path: str, pattern: str) -> bool:
    if fnmatch.fnmatchcase(relative_path, pattern):
        return True
    if pattern.startswith("**/"):
        return fnmatch.fnmatchcase(relative_path, pattern[3:])
    return False


def _is_excluded(path: Path, project_root: Path, patterns: tuple[str, ...]) -> bool:
    relative = path.relative_to(project_root).as_posix()
    parts = PurePosixPath(relative).parts
    prefixes = ("/".join(parts[:index]) for index in range(1, len(parts) + 1))
    return any(
        _matches_pattern(prefix, pattern)
        for prefix in prefixes
        for pattern in patterns
    )


def _resolve_code_roots(
    project_root: Path, patterns: tuple[str, ...]
) -> tuple[Path, ...]:
    matches: set[Path] = set()
    missing_patterns: list[str] = []

    for pattern in patterns:
        candidates = {
            Path(candidate).resolve()
            for candidate in glob.glob(str(project_root / pattern), recursive=True)
            if Path(candidate).is_dir()
        }
        if not candidates:
            missing_patterns.append(pattern)
        matches.update(candidates)

    if missing_patterns:
        joined = ", ".join(sorted(missing_patterns))
        raise ConfigError(f"code root pattern matched no directories: {joined}")

    ordered = sorted(matches, key=lambda path: (len(path.parts), path.as_posix()))
    roots: list[Path] = []
    for candidate in ordered:
        if not candidate.is_relative_to(project_root):
            raise ConfigError(f"code root resolved outside the project: {candidate}")
        if not any(candidate.is_relative_to(root) for root in roots):
            roots.append(candidate)
    return tuple(roots)


def _module_directories(
    project_root: Path,
    code_roots: tuple[Path, ...],
    exclude: tuple[str, ...],
) -> tuple[Path, ...]:
    modules: list[Path] = []
    for code_root in code_roots:
        for directory, child_names, _ in os.walk(code_root):
            current = Path(directory)
            child_names[:] = sorted(
                child
                for child in child_names
                if not _is_excluded(current / child, project_root, exclude)
            )
            if not _is_excluded(current, project_root, exclude):
                modules.append(current)
    return tuple(sorted(set(modules)))


def check_repository(project_root: Path, config: ArchitectureConfig) -> CheckResult:
    project_root = project_root.resolve()
    code_roots = _resolve_code_roots(project_root, config.code_roots)
    modules = _module_directories(project_root, code_roots, config.exclude)
    module_set = set(modules)
    issues: list[str] = []

    for module in modules:
        index_path = module / config.filename
        relative_index = index_path.relative_to(project_root).as_posix()
        if not index_path.is_file():
            issues.append(f"{relative_index}: missing architecture index")
            continue

        content = index_path.read_text(encoding="utf-8")
        children = sorted(
            child
            for child in module.iterdir()
            if child.is_dir() and child in module_set
        )
        for child in children:
            token = f"`{child.name}/`"
            if token not in content:
                issues.append(
                    f"{relative_index}: direct child {token} is not registered"
                )

    return CheckResult(
        module_count=len(modules),
        code_root_count=len(code_roots),
        issues=tuple(sorted(issues)),
    )


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="project.yml", type=Path)
    parser.add_argument(
        "--root",
        type=Path,
        help="project root; defaults to the directory containing the config",
    )
    args = parser.parse_args(argv)

    config_path = args.config.resolve()
    project_root = args.root.resolve() if args.root else config_path.parent
    try:
        config = parse_architecture_config(config_path)
        result = check_repository(project_root, config)
    except (ConfigError, OSError, UnicodeError) as error:
        print(f"architecture check configuration error: {error}", file=sys.stderr)
        return 2

    if result.issues:
        for issue in result.issues:
            print(f"ERROR {issue}", file=sys.stderr)
        print(
            f"architecture check failed: {len(result.issues)} issue(s)",
            file=sys.stderr,
        )
        return 1

    print(
        "architecture check passed: "
        f"{result.module_count} module(s) under "
        f"{result.code_root_count} code root(s)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
