#!/usr/bin/env python3
"""Flag <the mistake, in one line>.

Gap: <why no ruff or pyright rule covers it, in one line>.

Rule `no-print`: a call to `print` in application code. Replace this sample rule with yours.
Exempt: files under SKIP_PARTS, names in ALLOWED_CALLERS, and a line ending in `# no-print-ok: <reason>`.
Exit 0 when clean, 1 when any finding prints, 2 on a usage error.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

CHECK = "no-print"
RULE = "no-print"
ACTION = "log through the module logger"
DOC = "docs/conventions/logging.md#the-pattern"
# Folders whose code may break the rule by design: tests assert on output, generated code is not edited by hand.
SKIP_PARTS: frozenset[str] = frozenset({"tests", "migrations", "__pycache__", ".venv", "node_modules"})
# Functions allowed to break the rule, each with its reason: a CLI entry point prints its result.
ALLOWED_CALLERS: frozenset[str] = frozenset({"main"})
SUPPRESSION = re.compile(rf"#\s*{re.escape(CHECK)}-ok:(?P<reason>.*)$")


@dataclass(frozen=True)
class Finding:
    """One rule hit at a 1-based line and column."""

    path: Path
    line: int
    column: int
    symptom: str

    def render(self) -> str:
        """Format as `path:line:col: error [check/rule] symptom; action (doc)`."""
        return f"{self.path}:{self.line}:{self.column}: error [{CHECK}/{RULE}] {self.symptom}; {ACTION} ({DOC})"


class Scanner(ast.NodeVisitor):
    """Collect every hit in one module."""

    def __init__(self, path: Path, source: str) -> None:
        self.path = path
        self.lines = source.splitlines()
        self.findings: list[Finding] = []
        self.function_names: list[str] = []

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        """Track the enclosing function so ALLOWED_CALLERS can exempt it."""
        self.function_names.append(node.name)
        self.generic_visit(node)
        self.function_names.pop()

    visit_AsyncFunctionDef = visit_FunctionDef  # type: ignore[assignment]

    def visit_Call(self, node: ast.Call) -> None:
        """Sample rule: flag `print(...)` outside an allowed caller."""
        is_print = isinstance(node.func, ast.Name) and node.func.id == "print"
        caller = self.function_names[-1] if self.function_names else None
        if is_print and caller not in ALLOWED_CALLERS:
            self.record(node, "calls `print`")
        self.generic_visit(node)

    def record(self, node: ast.expr, symptom: str) -> None:
        """Keep the hit unless its line carries a reasoned suppression; a bare marker is still reported."""
        line_text = self.lines[node.lineno - 1]
        suppression = SUPPRESSION.search(line_text)
        if suppression is not None and suppression.group("reason").strip():
            return
        self.findings.append(Finding(self.path, node.lineno, node.col_offset + 1, symptom))


def scan(path: Path) -> list[Finding]:
    """Parse one file and return its hits."""
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    scanner = Scanner(path, source)
    scanner.visit(tree)
    return scanner.findings


def iter_python_files(targets: list[Path]) -> list[Path]:
    """Expand files and folders into the Python files the rule covers."""
    files: list[Path] = []
    for target in targets:
        candidates = [target] if target.is_file() else sorted(target.rglob("*.py"))
        files.extend(path for path in candidates if not SKIP_PARTS.intersection(path.parts))
    return files


def main(argv: list[str]) -> int:
    """Print every hit in the given files or folders."""
    parser = argparse.ArgumentParser(prog=CHECK)
    parser.add_argument("targets", nargs="+", type=Path)
    args = parser.parse_args(argv)
    missing = [str(target) for target in args.targets if not target.exists()]
    if missing:
        print(f"not found: {', '.join(missing)}", file=sys.stderr)
        return 2
    findings = [finding for path in iter_python_files(args.targets) for finding in scan(path)]
    for finding in findings:
        print(finding.render())
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
