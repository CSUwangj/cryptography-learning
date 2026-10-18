"""Exercise review handoffs against real disposable Git checkouts, without commits."""

from pathlib import Path
import json
import shlex
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "review_handoff.py"


class ReviewHandoffTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="review-handoff-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.repo = self.directory / "repo with spaces"
        subprocess.run(
            ["git", "clone", "--quiet", "--shared", str(ROOT), str(self.repo)],
            check=True, capture_output=True,
        )
        self.base = self.git("rev-parse", "HEAD").stdout.strip()
        self.target = "handoff [sample].txt"
        (self.repo / self.target).write_text("ticket implementation\n")
        self.git("add", "--", self.target)
        self.notes = self.directory / "notes.md"
        self.notes.write_text("A1: the example is executable. Evidence: unit. No product decisions remain.\n")
        self.packet = self.directory / "round1.json"

    def git(self, *args):
        return subprocess.run(
            ["git", "--literal-pathspecs", "-C", str(self.repo), *args],
            text=True, capture_output=True, check=True,
        )

    def cli(self, *args, expected=0):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), *map(str, args)],
            text=True, capture_output=True, check=False,
        )
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return result

    def create(self, *args, expected=0):
        return self.cli(
            "create", "--repo", self.repo, "--base", self.base,
            "--issue", "#96", "--notes", self.notes, "--output", self.packet,
            "--check", "unit", "--paths", self.target, *args, expected=expected,
        )

    def run_python(self, code, *, label="unit", expected=0):
        return self.cli(
            "run", self.packet, "--label", label, "--", sys.executable, "-c", code,
            expected=expected,
        )

    def data(self):
        return json.loads(self.packet.read_text())

    def test_complete_handoff_has_reproducible_diff_and_check_evidence(self):
        self.create()
        diff = subprocess.run(shlex.split(self.data()["diff_command"]), capture_output=True, text=True, check=True)
        self.assertIn("+ticket implementation", diff.stdout)
        self.run_python("from pathlib import Path; assert Path('handoff [sample].txt').read_text() == 'ticket implementation\\n'; print('assertion passed')")
        self.cli("verify", self.packet, "--require-passed")
        attempt = self.data()["checks"]["unit"][0]
        self.assertEqual(attempt["exit_code"], 0)
        self.assertEqual(attempt["cwd"], str(self.repo))
        self.assertIn("assertion passed", Path(attempt["log"]).read_text())
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), self.base)
        self.assertEqual(self.git("diff", "--name-only").stdout, "")

    def test_failed_and_missing_checks_cannot_pass_and_attempts_are_retained(self):
        self.create("--check", "build")
        self.cli("verify", self.packet)
        self.cli("verify", self.packet, "--require-passed", expected=1)
        self.run_python("import sys; print('failure'); sys.exit(7)", expected=1)
        self.assertEqual(self.data()["checks"]["unit"][0]["exit_code"], 7)
        self.cli("verify", self.packet, "--require-passed", expected=1)
        self.run_python("print('fixed')")
        self.cli("verify", self.packet, "--require-passed", expected=1)
        self.run_python("print('built')", label="build")
        self.cli("verify", self.packet, "--require-passed")
        self.assertEqual([a["status"] for a in self.data()["checks"]["unit"]], ["failed", "passed"])

    def test_unstaged_target_is_rejected(self):
        (self.repo / self.target).write_text("unstaged fix\n")
        self.assertIn("unstaged changes", self.create(expected=1).stderr)
        self.assertFalse(self.packet.exists())

    def test_whitespace_failure_has_actionable_diagnostics(self):
        (self.repo / self.target).write_text("trailing whitespace \n")
        self.git("add", "--", self.target)
        self.assertIn("trailing whitespace", self.create(expected=1).stderr)

    def test_classified_unrelated_changes_are_preserved_and_fingerprinted(self):
        (self.repo / "prototype.txt").write_text("prototype\n")
        self.git("add", "prototype.txt")
        (self.repo / "prototype.txt").write_text("prototype with unstaged work\n")
        (self.repo / "draft.txt").write_text("untracked draft\n")
        before = self.git("status", "--porcelain").stdout
        self.assertIn("unclassified", self.create(expected=1).stderr)
        self.create("--exclude", "prototype.txt", "Prior prototype", "--exclude", "draft.txt", "Prior draft")
        self.cli("verify", self.packet)
        self.assertEqual(self.git("status", "--porcelain").stdout, before)
        (self.repo / "draft.txt").write_text("changed untracked draft\n")
        self.assertIn("snapshot changed", self.cli("verify", self.packet, expected=1).stderr)

    def test_changed_index_or_worktree_invalidates_snapshot(self):
        self.create()
        (self.repo / self.target).write_text("changed\n")
        self.cli("verify", self.packet, expected=1)
        self.git("add", "--", self.target)
        self.assertIn("snapshot changed", self.cli("verify", self.packet, expected=1).stderr)
        self.run_python("raise AssertionError('must not execute stale target')", expected=1)
        self.assertEqual(self.data()["checks"]["unit"], [])

    def test_rejects_wrong_base_empty_diff_and_unclassified_new_files(self):
        self.cli(
            "create", "--repo", self.repo, "--base", "HEAD~1", "--issue", "#96",
            "--notes", self.notes, "--output", self.packet, "--paths", self.target,
            "--check", "unit", expected=1,
        )
        self.cli(
            "create", "--repo", self.repo, "--base", self.base, "--issue", "#96",
            "--notes", self.notes, "--output", self.packet, "--paths", "AGENTS.md",
            "--check", "unit", expected=1,
        )
        self.create()
        (self.repo / "forgotten-test.txt").write_text("required but not staged\n")
        self.cli("verify", self.packet, expected=1)

    def test_check_that_edits_snapshot_is_not_passing_evidence(self):
        self.create()
        self.run_python("from pathlib import Path; Path('handoff [sample].txt').write_text('changed by check')", expected=1)
        attempt = self.data()["checks"]["unit"][0]
        self.assertEqual(attempt["exit_code"], 0)
        self.assertEqual(attempt["status"], "unavailable")
        self.cli("verify", self.packet, "--require-passed", expected=1)

    def test_missing_command_is_unavailable_and_log_tampering_is_rejected(self):
        self.create()
        self.cli("run", self.packet, "--label", "unit", "--", "/no-such-check-command", expected=1)
        self.assertEqual(self.data()["checks"]["unit"][0]["status"], "unavailable")
        self.cli("verify", self.packet, "--require-passed", expected=1)
        self.run_python("print('finished')")
        log = Path(self.data()["checks"]["unit"][-1]["log"])
        log.write_text("different log\n")
        self.assertIn("log changed", self.cli("verify", self.packet, expected=1).stderr)
        log.unlink()
        self.assertIn("missing check log", self.cli("verify", self.packet, expected=1).stderr)

    def test_interrupted_runner_leaves_an_unavailable_result(self):
        self.create()
        self.run_python("import os, signal; print('startup', flush=True); os.kill(os.getppid(), signal.SIGKILL)", expected=-9)
        self.assertEqual(self.data()["checks"]["unit"][0]["status"], "unavailable")
        self.assertIsNone(self.data()["checks"]["unit"][0]["exit_code"])
        self.cli("verify", self.packet)
        self.cli("verify", self.packet, "--require-passed", expected=1)

    def test_paths_are_literal_even_with_shell_and_git_metacharacters(self):
        name = "$(touch injected); [glob].txt"
        (self.repo / name).write_text("literal file\n")
        self.git("add", "--", name)
        self.create("--paths", self.target, name)
        diff = subprocess.run(shlex.split(self.data()["diff_command"]), capture_output=True, text=True, check=True)
        self.assertIn("+literal file", diff.stdout)
        self.cli("verify", self.packet)
        self.assertFalse((self.repo / "injected").exists())

    def test_deletion_and_rename_are_exact_staged_paths(self):
        self.git("mv", "CHANGELOG.md", "renamed changelog.md")
        self.create("--paths", self.target, "CHANGELOG.md", "renamed changelog.md")
        self.cli("verify", self.packet)

    def test_artifacts_are_external_and_existing_packets_are_preserved(self):
        self.create()
        original = self.packet.read_bytes()
        self.create(expected=1)
        self.assertEqual(self.packet.read_bytes(), original)
        self.cli("verify", self.directory / "missing.json", expected=1)
        self.packet = self.repo / "handoff.json"
        self.create(expected=1)
        self.assertFalse(self.packet.exists())


if __name__ == "__main__":
    unittest.main()
