from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


HOOKS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HOOKS_DIR))

from check_architecture import (  # noqa: E402
    ArchitectureConfig,
    ConfigError,
    check_repository,
    parse_architecture_config,
)


class ArchitectureCheckTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def write_index(self, directory: Path, children: tuple[str, ...] = ()) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        rows = "\n".join(f"| `{child}/` | child module |" for child in children)
        (directory / "ARCHITECTURE.md").write_text(
            "# Architecture\n\n## Modules\n\n"
            "| Directory | Responsibility |\n"
            "| --- | --- |\n"
            f"{rows}\n",
            encoding="utf-8",
        )

    def config(self, *code_roots: str, exclude: tuple[str, ...] = ()) -> ArchitectureConfig:
        return ArchitectureConfig(
            filename="ARCHITECTURE.md",
            code_roots=code_roots,
            exclude=exclude,
        )

    def test_accepts_complete_code_tree_and_ignores_governance_directories(self) -> None:
        self.write_index(self.root / "src", ("orders",))
        self.write_index(self.root / "src/orders")
        (self.root / ".agents/skills/example").mkdir(parents=True)

        result = check_repository(self.root, self.config("src"))

        self.assertEqual(2, result.module_count)
        self.assertEqual((), result.issues)

    def test_reports_missing_directory_index(self) -> None:
        self.write_index(self.root / "src", ("orders",))
        (self.root / "src/orders").mkdir()

        result = check_repository(self.root, self.config("src"))

        self.assertEqual(
            ("src/orders/ARCHITECTURE.md: missing architecture index",),
            result.issues,
        )

    def test_reports_child_missing_from_parent_index(self) -> None:
        self.write_index(self.root / "src")
        self.write_index(self.root / "src/orders")

        result = check_repository(self.root, self.config("src"))

        self.assertEqual(
            (
                "src/ARCHITECTURE.md: direct child `orders/` is not registered",
            ),
            result.issues,
        )

    def test_prunes_explicitly_excluded_code_directories(self) -> None:
        self.write_index(self.root / "src", ("orders",))
        self.write_index(self.root / "src/orders")
        (self.root / "src/orders/__tests__/fixtures").mkdir(parents=True)

        result = check_repository(
            self.root,
            self.config("src", exclude=("**/__tests__", "**/fixtures")),
        )

        self.assertEqual(2, result.module_count)
        self.assertEqual((), result.issues)

    def test_expands_globbed_code_roots(self) -> None:
        self.write_index(self.root / "apps/store/src")
        self.write_index(self.root / "apps/admin/src")

        result = check_repository(self.root, self.config("apps/*/src"))

        self.assertEqual(2, result.code_root_count)
        self.assertEqual((), result.issues)

    def test_parses_architecture_memory_from_project_yaml(self) -> None:
        config_path = self.root / "project.yml"
        config_path.write_text(
            "project:\n"
            "  id: example\n"
            "architecture_memory:\n"
            '  filename: "ARCHITECTURE.md"\n'
            "  code_roots:\n"
            '    - "src"\n'
            "  exclude:\n"
            '    - "**/__tests__"\n'
            "workflow:\n"
            "  definitions: workflows/\n",
            encoding="utf-8",
        )

        config = parse_architecture_config(config_path)

        self.assertEqual("ARCHITECTURE.md", config.filename)
        self.assertEqual(("src",), config.code_roots)
        self.assertEqual(("**/__tests__",), config.exclude)

    def test_rejects_missing_code_roots(self) -> None:
        config_path = self.root / "project.yml"
        config_path.write_text(
            "architecture_memory:\n  filename: ARCHITECTURE.md\n",
            encoding="utf-8",
        )

        with self.assertRaisesRegex(ConfigError, "code_roots"):
            parse_architecture_config(config_path)


if __name__ == "__main__":
    unittest.main()
