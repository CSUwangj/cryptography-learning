"""Exercise review handoffs against real disposable Git checkouts, without commits."""

from pathlib import Path
import json
import os
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

    def cli(self, *args, expected=0, env=None):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), *map(str, args)],
            text=True, capture_output=True, check=False, env=env,
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

    def record_review(self, axis, status="passed", *, expected=0, snapshot=None, findings=()):
        evidence = self.directory / f"{axis}-review.md"
        evidence.write_text(f"Formal {axis} review: {status}. Evidence covers the recorded snapshot.\n")
        return self.cli(
            "review", self.packet, "--axis", axis, "--status", status,
            "--snapshot", snapshot or self.data()["snapshot_id"],
            "--evidence", evidence,
            *[argument for finding in findings for argument in ("--finding", *finding)],
            expected=expected,
        )

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
        failure = self.directory / "check-fails"
        failure.touch()
        command = f"from pathlib import Path; import sys; sys.exit(7 if Path({str(failure)!r}).exists() else 0)"
        self.run_python(command, expected=1)
        self.assertEqual(self.data()["checks"]["unit"][0]["exit_code"], 7)
        self.cli("verify", self.packet, "--require-passed", expected=1)
        failure.unlink()
        self.run_python(command)
        self.cli("verify", self.packet, "--require-passed", expected=1)
        self.run_python("print('built')", label="build")
        result = self.cli("verify", self.packet, "--require-passed")
        self.assertEqual([a["status"] for a in self.data()["checks"]["unit"]], ["failed", "passed"])
        self.assertIn('"attempts": 2', result.stdout)
        self.assertIn('"previous_failed": 1', result.stdout)

    def test_frontend_runtime_and_dependency_changes_require_full_suite(self):
        changed = []
        for name in ("frontend/src/verification-example.ts", "frontend/package-lock.json",
                     "frontend/schema/schema.gql", "frontend/index.html", "frontend/.nvmrc",
                     "frontend/vite.config.mts", "frontend/tsconfig.json"):
            with self.subTest(path=name):
                file = self.repo / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text((file.read_text() if file.exists() else "") + "verification fixture\n")
                self.git("add", "--", name)
                changed.append(name)
                self.packet = self.directory / f"case-{len(changed)}.json"
                result = self.create(
                    "--paths", self.target, name,
                    *[argument for old in changed[:-1] for argument in ("--exclude", old, "Other fixture")],
                    expected=1,
                )
                self.assertIn("missing required check: frontend-tests", result.stderr)
                self.assertFalse(self.packet.exists())

    def test_frontend_documentation_does_not_require_runtime_suite(self):
        documents = ("frontend/README.md", "frontend/schema/README.md", "frontend/src/README.md")
        for name in documents:
            (self.repo / name).write_text("Documentation-only example.\n")
            self.git("add", "--", name)
        self.create("--paths", self.target, *documents)
        self.run_python("print('documentation checked')")
        self.cli("verify", self.packet, "--require-passed")

    def test_full_suite_is_required_even_when_focused_check_passes(self):
        name = "frontend/src/verification-example.ts"
        (self.repo / name).write_text("export const example = true\n")
        self.git("add", "--", name)
        self.create("--paths", self.target, name, "--check", "frontend-tests")
        self.run_python("print('focused check passed')")
        result = self.cli("verify", self.packet, "--require-passed", expected=1)
        self.assertIn('"frontend-tests": "not-run"', result.stdout)
        # Older packets can omit the gate entirely; verification must still find it.
        legacy = self.data()
        del legacy["checks"]["frontend-tests"]
        self.packet.write_text(json.dumps(legacy))
        self.cli("verify", self.packet)
        result = self.cli("verify", self.packet, "--require-passed", expected=1)
        self.assertIn("missing required check: frontend-tests", result.stderr)
        self.assertIn('Incomplete checks: ["frontend-tests"]', result.stdout)

    def test_frontend_gate_executes_only_its_fixed_command_and_directory(self):
        self.create("--check", "frontend-tests")
        original = self.packet.read_bytes()
        marker = self.directory / "executed.json"
        replacement = f"from pathlib import Path; Path({str(marker)!r}).write_text('subset ran')"
        self.run_python(replacement, label="frontend-tests", expected=1)
        self.assertFalse(marker.exists())
        self.assertEqual(self.packet.read_bytes(), original)

        # A stand-in records the runner's dispatch without invoking the frontend suite.
        bin_dir = self.directory / "bin"
        bin_dir.mkdir()
        fish = bin_dir / "fish"
        fish.write_text(
            f"#!{sys.executable}\nimport json, os, sys\nfrom pathlib import Path\n"
            f"Path({str(marker)!r}).write_text(json.dumps([os.getcwd(), sys.argv[1:]]))\n"
        )
        fish.chmod(0o755)
        env = {**os.environ, "PATH": str(bin_dir) + os.pathsep + os.environ["PATH"]}
        command = ("fish", "-lc", "nvm use; and npm test -- --maxWorkers=1")
        self.cli("run", self.packet, "--label", "frontend-tests", "--", *command, env=env, expected=1)
        self.assertFalse(marker.exists())
        self.assertEqual(self.packet.read_bytes(), original)
        self.cli("run", self.packet, "--label", "frontend-tests", "--cwd", "frontend",
                 "--", *command, env=env)
        self.assertEqual(json.loads(marker.read_text()), [str(self.repo / "frontend"), list(command[1:])])
        self.run_python("print('other acceptance check passed')")
        self.cli("verify", self.packet, "--require-passed")

    def test_replacement_command_or_directory_cannot_overwrite_failed_check(self):
        self.create()
        command = "import sys; sys.exit(7)"
        self.run_python(command, expected=1)
        original = self.packet.read_bytes()
        marker = self.directory / "subset-ran"
        replacement = f"from pathlib import Path; Path({str(marker)!r}).touch()"
        self.run_python(replacement, expected=1)
        self.assertFalse(marker.exists())
        self.assertEqual(self.packet.read_bytes(), original)
        self.cli("run", self.packet, "--label", "unit", "--cwd", "frontend",
                 "--", sys.executable, "-c", command, expected=1)
        self.assertEqual(self.packet.read_bytes(), original)
        self.cli("verify", self.packet, "--require-passed", expected=1)

    def test_legacy_changed_commands_cannot_supply_passing_evidence(self):
        self.create("--check", "focused")
        self.run_python("import sys; sys.exit(7)", expected=1)
        self.run_python("print('subset passed')", label="focused")
        legacy = self.data()
        legacy["checks"]["unit"].extend(legacy["checks"].pop("focused"))
        self.packet.write_text(json.dumps(legacy))
        self.cli("verify", self.packet)
        result = self.cli("verify", self.packet, "--require-passed", expected=1)
        self.assertIn("command or working directory changed", result.stderr)

    def test_passing_checks_do_not_imply_completed_reviews(self):
        self.create()
        self.run_python("print('checks passed')")
        result = self.cli("verify", self.packet, "--require-passed")
        self.assertIn('Formal review status: {"spec": "pending", "standards": "pending"}', result.stdout)
        result = self.cli("verify", self.packet, "--require-passed", "--require-reviewed", expected=1)
        self.assertIn("both formal-review axes must pass", result.stderr)

    def test_formal_reviews_are_separate_from_checks_and_keep_each_axis_history(self):
        self.create()
        self.record_review("standards")
        self.cli("verify", self.packet, "--require-reviewed", expected=1)
        for status in ("pending", "changes-required", "disputed"):
            with self.subTest(status=status):
                self.record_review("spec", status)
                self.cli("verify", self.packet, "--require-reviewed", expected=1)
        self.record_review("spec")
        self.cli("verify", self.packet, "--require-reviewed")
        self.cli("verify", self.packet, "--require-passed", "--require-reviewed", expected=1)
        self.run_python("print('verified')")
        self.cli("verify", self.packet, "--require-passed", "--require-reviewed")
        self.assertEqual([r["status"] for r in self.data()["reviews"]["spec"]],
                         ["pending", "changes-required", "disputed", "passed"])
        self.assertIn("Formal spec review: passed", self.data()["reviews"]["spec"][-1]["evidence"])

    def test_unresolved_findings_survive_pass_and_need_explicit_disposition(self):
        self.create()
        self.record_review("standards")
        for status in ("open", "disputed"):
            with self.subTest(status=status):
                self.record_review("spec", findings=[("R1", status)])
                result = self.cli("verify", self.packet, "--require-reviewed", expected=1)
                self.assertIn("spec:R1", result.stderr)
                self.record_review("spec")
                self.cli("verify", self.packet, "--require-reviewed", expected=1)
        # The other axis cannot clear Spec's finding with the same ID.
        self.record_review("standards", findings=[("R1", "resolved")])
        self.cli("verify", self.packet, "--require-reviewed", expected=1)
        for status in ("resolved", "withdrawn", "non-blocking"):
            with self.subTest(status=status):
                self.record_review("spec", findings=[("R1", status)])
                self.cli("verify", self.packet, "--require-reviewed")

    def test_reviews_cannot_be_recorded_or_reused_on_another_snapshot(self):
        self.create()
        self.record_review("standards")
        self.record_review("spec")
        original = self.data()
        original_bytes = self.packet.read_bytes()
        (self.repo / self.target).write_text("repaired implementation\n")
        self.git("add", "--", self.target)
        self.record_review("spec", expected=1)
        self.assertEqual(self.packet.read_bytes(), original_bytes)
        self.cli("verify", self.packet, "--require-reviewed", expected=1)
        self.packet = self.directory / "round2.json"
        self.create()
        self.assertNotEqual(original["snapshot_id"], self.data()["snapshot_id"])
        result = self.record_review("spec", snapshot=original["snapshot_id"], expected=1)
        self.assertIn("snapshot ID differs", result.stderr)
        self.assertEqual(self.data()["reviews"]["spec"], [])
        copied = self.data()
        copied["reviews"] = original["reviews"]
        self.packet.write_text(json.dumps(copied))
        result = self.cli("verify", self.packet, "--require-reviewed", expected=1)
        self.assertIn("snapshot ID differs", result.stderr)

    def test_legacy_packets_need_explicit_review_records(self):
        self.create()
        self.run_python("print('checked')")
        legacy = self.data()
        del legacy["reviews"]
        del legacy["snapshot_id"]
        self.packet.write_text(json.dumps(legacy))
        self.cli("verify", self.packet, "--require-passed")
        self.cli("verify", self.packet, "--require-reviewed", expected=1)
        result = self.cli("verify", self.packet)
        identity = result.stdout.split("Snapshot ID: ", 1)[1].splitlines()[0]
        self.record_review("standards", snapshot=identity)
        self.record_review("spec", snapshot=identity)
        self.cli("verify", self.packet, "--require-passed", "--require-reviewed")

    def test_invalid_review_records_leave_packet_unchanged(self):
        self.create()
        original = self.packet.read_bytes()
        for findings in ([("R1", "typo")], [(" ", "open")],
                         [("R1", "open"), ("R1", "resolved")]):
            with self.subTest(findings=findings):
                self.record_review("spec", findings=findings, expected=1)
                self.assertEqual(self.packet.read_bytes(), original)
        empty = self.directory / "empty-review.md"
        empty.write_text(" ")
        result = self.cli(
            "review", self.packet, "--axis", "spec", "--status", "passed",
            "--snapshot", self.data()["snapshot_id"], "--evidence", empty, expected=1,
        )
        self.assertIn("must not be empty", result.stderr)
        self.assertEqual(self.packet.read_bytes(), original)
        result = self.cli(
            "review", self.packet, "--axis", "spec", "--status", "passed",
            "--snapshot", self.data()["snapshot_id"],
            "--evidence", self.repo / self.target, expected=1,
        )
        self.assertIn("outside the reviewed worktree", result.stderr)
        self.assertEqual(self.packet.read_bytes(), original)

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
        command = self.directory / "check-command"
        self.cli("run", self.packet, "--label", "unit", "--", command, expected=1)
        self.assertEqual(self.data()["checks"]["unit"][0]["status"], "unavailable")
        self.cli("verify", self.packet, "--require-passed", expected=1)
        command.write_text(f"#!{sys.executable}\nprint('finished')\n")
        command.chmod(0o755)
        self.cli("run", self.packet, "--label", "unit", "--", command)
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
