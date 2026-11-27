"""Pin the check through its real entry point: one hit, one silence, one exemption."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

CHECK_SCRIPT = Path(__file__).resolve().parent.parent / "check_no_print.py"


def run_check(tmp_path: Path, source: str) -> subprocess.CompletedProcess[str]:
    """Write `source` to a throwaway module and run the check on it."""
    module = tmp_path / "module.py"
    module.write_text(source, encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(CHECK_SCRIPT), str(module)], capture_output=True, text=True, check=False
    )


def test_a_hit_names_the_rule_line_and_doc(tmp_path: Path) -> None:
    result = run_check(tmp_path, "def handle():\n    print('done')\n")

    assert result.returncode == 1
    assert "module.py:2:5: error [no-print/no-print] calls `print`" in result.stdout
    assert result.stdout.rstrip().endswith("(docs/conventions/logging.md#the-pattern)")


def test_legitimate_code_stays_silent(tmp_path: Path) -> None:
    result = run_check(tmp_path, "def main():\n    print('result')\n\n\ndef handle():\n    log('print')\n")

    assert result.returncode == 0
    assert result.stdout == ""


def test_a_reasoned_suppression_exempts_the_line_and_a_bare_one_does_not(tmp_path: Path) -> None:
    reasoned = run_check(tmp_path, "def handle():\n    print('x')  # no-print-ok: progress bar on a TTY\n")
    bare = run_check(tmp_path, "def handle():\n    print('x')  # no-print-ok:\n")

    assert reasoned.returncode == 0
    assert bare.returncode == 1
