"""Public CLI coverage for staged handoff packets."""

from pathlib import Path
import json
import hashlib
import os
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
        subprocess.run(["git", "clone", "--quiet", "--shared", str(ROOT), str(self.repo)], check=True)
        self.notes = self.directory / "notes.md"
        self.notes.write_text("AC1: packet contains staged scope and frozen plan.\n")
        self.packet = self.directory / "packet.json"

    def git(self, *args):
        return subprocess.run(["git", "--literal-pathspecs", "-C", str(self.repo), *args],
                              text=True, capture_output=True, check=True)

    def cli(self, *args, expected=0, env=None):
        result = subprocess.run([sys.executable, str(SCRIPT), *map(str, args)],
                                text=True, capture_output=True, check=False, env=env)
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return result

    def stage(self, name, content="fixture\n"):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        self.git("add", "--", name)

    def create(self, *extra, expected=0):
        return self.cli("create", "--repo", self.repo, "--issue", "#118", "--notes", self.notes,
                        "--output", self.packet, *extra, expected=expected)

    def data(self):
        return json.loads(self.packet.read_text())

    def fake_fish(self, *, fail_first=False, interrupt=False, mutate=None):
        bindir = self.directory / "bin"
        bindir.mkdir(exist_ok=True)
        counter = self.directory / "fish-count"
        fish = bindir / "fish"
        mutation = f"\nfrom pathlib import Path; Path({str(mutate)!r}).write_text('mutated by check\\n')" if mutate else ""
        action = "import os; os.kill(os.getppid(), 9)" if interrupt else (
            f"from pathlib import Path; p=Path({str(counter)!r}); n=int(p.read_text()) if p.exists() else 0; p.write_text(str(n+1)); "
            + ("\nif n == 0: raise SystemExit(7)" if fail_first else "")
            + mutation
        )
        fish.write_text(f"#!{sys.executable}\n{action}\n")
        fish.chmod(0o755)
        return {**os.environ, "PATH": str(bindir) + os.pathsep + os.environ["PATH"]}

    def stage_frontend_test(self):
        self.stage("frontend/src/crypto_graph/index.test.ts", "test('fixture', () => {})\n")

    def test_create_discovers_staged_scope_and_requires_exclusions(self):
        self.stage("docs/agents/target.md")
        self.stage("prototype.txt")
        (self.repo / "draft.txt").write_text("untracked\n")
        result = self.create(expected=1)
        self.assertIn("classify every non-target change", result.stderr)
        self.create("--exclude", "prototype.txt", "prototype", "--exclude", "draft.txt", "draft")
        data = self.data()
        self.assertEqual(data["paths"], ["docs/agents/target.md"])
        self.assertEqual(data["excluded"], {"prototype.txt": "prototype", "draft.txt": "draft"})
        self.assertEqual(data["plan"]["kind"], "docs-only")
        self.assertIn("Snapshot ID:", self.cli("verify", self.packet).stdout)

    def test_default_output_is_external_and_printed(self):
        self.stage("docs/agents/target.md")
        result = self.cli("create", "--repo", self.repo, "--issue", "#118", "--notes", self.notes)
        line = next(line for line in result.stdout.splitlines() if line.startswith("Created "))
        output = Path(line.split("Created ", 1)[1].split(";", 1)[0])
        self.assertTrue(output.is_file())
        self.assertFalse(output.is_relative_to(self.repo))
        self.assertIn("Snapshot ID:", result.stdout)

    def test_run_docs_only_plan_succeeds_and_rejects_caller_configuration(self):
        self.stage("docs/agents/target.md")
        self.create()
        self.cli("run", self.packet)
        self.cli("verify", self.packet, "--require-passed")
        self.cli("run", self.packet, "--label", "unit", expected=1)
        self.cli("run", self.packet, "--cwd", ".", expected=2)

    def test_legacy_custom_command_syntax_is_rejected_without_packet_write(self):
        self.stage_frontend_test()
        self.create()
        label = self.data()["plan"]["checks"][0]["id"]
        original = self.packet.read_bytes()
        self.cli("run", self.packet, "--label", label, "--", sys.executable, "-c", "print('custom')", expected=2)
        self.assertEqual(self.packet.read_bytes(), original)

    def test_non_empty_plan_runs_all_checks_keeps_failure_and_allows_label_rerun(self):
        self.stage_frontend_test()
        self.create()
        planned = [item["id"] for item in self.data()["plan"]["checks"]]
        self.assertGreaterEqual(len(planned), 2)
        env = self.fake_fish(fail_first=True)
        self.cli("run", self.packet, env=env, expected=1)
        data = self.data()
        self.assertEqual([data["checks"][name][-1]["status"] for name in planned[1:]], ["passed"] * (len(planned) - 1))
        self.assertEqual(data["checks"][planned[0]][0]["status"], "failed")
        self.assertTrue(Path(data["checks"][planned[0]][0]["log"]).is_file())
        self.cli("run", self.packet, "--label", planned[0], env=env)
        self.cli("verify", self.packet, "--require-passed")

    def test_selected_frontend_install_precedes_dependent_checks(self):
        package = json.loads((self.repo / "frontend/package.json").read_text())
        package["description"] = "Installation order regression fixture"
        self.stage("frontend/package.json", json.dumps(package, indent=2) + "\n")
        self.create()
        env = self.fake_fish()
        fish = self.directory / "bin/fish"
        marker = self.directory / "frontend-installed"
        # AGENTS.md and CI install dependencies before running frontend tools.
        fish.write_text(
            f"#!{sys.executable}\n"
            "from pathlib import Path\n"
            "import sys\n"
            f"marker = Path({str(marker)!r})\n"
            "if sys.argv[-1] == 'nvm use; and npm ci':\n"
            "    marker.write_text('installed\\n')\n"
            "elif not marker.exists():\n"
            "    raise SystemExit('frontend consumer dispatched before npm ci: ' + sys.argv[-1])\n"
        )
        self.cli("run", self.packet, env=env)
        data = self.data()
        self.assertEqual(set(data["checks"]), {
            "frontend_install", "frontend-tests", "frontend_build", "frontend_typecheck",
        })
        self.assertTrue(marker.is_file())
        for name, attempts in data["checks"].items():
            self.assertEqual(len(attempts), 1, name)
            self.assertEqual(attempts[0]["status"], "passed", name)
        self.cli("verify", self.packet, "--require-passed")

    def test_extra_check_labels_cannot_satisfy_verify(self):
        self.stage("docs/agents/target.md")
        self.create()
        data = self.data()
        evil_log = self.directory / "evil.log"
        evil_log.write_text("evil\n")
        data["checks"]["evil"] = [{"command": ["true"], "cwd": str(self.repo), "status": "passed", "log": str(evil_log), "log_sha256": hashlib.sha256(evil_log.read_bytes()).hexdigest()}]
        self.packet.write_text(json.dumps(data))
        result = self.cli("verify", self.packet, "--require-passed", expected=1)
        self.assertIn("unexpected check: evil", result.stderr)

    def test_snapshot_and_log_integrity_regressions_remain_guarded(self):
        self.stage_frontend_test()
        self.create()
        env = self.fake_fish()
        self.cli("run", self.packet, env=env)
        attempt = self.data()["checks"]["frontend-tests"][0]
        Path(attempt["log"]).write_text("tampered\n")
        self.assertIn("log changed", self.cli("verify", self.packet, expected=1).stderr)
        Path(attempt["log"]).unlink()
        self.assertIn("missing check log", self.cli("verify", self.packet, expected=1).stderr)
        self.stage("frontend/src/crypto_graph/index.test.ts", "changed fixture\n")
        self.assertIn("snapshot changed", self.cli("verify", self.packet, expected=1).stderr)

    def test_interrupted_runner_records_unavailable_attempt(self):
        self.stage_frontend_test()
        self.create()
        self.cli("run", self.packet, env=self.fake_fish(interrupt=True), expected=-9)
        attempt = self.data()["checks"]["frontend-tests"][0]
        self.assertEqual(attempt["status"], "unavailable")
        self.assertIsNone(attempt["exit_code"])

    def test_check_mutating_target_is_unavailable_and_invalidates_packet(self):
        self.stage_frontend_test()
        self.create()
        target = self.repo / "frontend/src/crypto_graph/index.test.ts"
        self.cli("run", self.packet, env=self.fake_fish(mutate=target), expected=1)
        attempt = self.data()["checks"]["frontend-tests"][0]
        self.assertEqual(attempt["status"], "unavailable")
        self.assertEqual(attempt["exit_code"], 0)
        result = self.cli("verify", self.packet, expected=1)
        self.assertIn("target files have unstaged changes", result.stderr)

    def test_mutating_check_stops_before_starting_later_checks(self):
        self.stage_frontend_test()
        self.create()
        target = self.repo / "frontend/src/crypto_graph/index.test.ts"
        self.cli("run", self.packet, env=self.fake_fish(mutate=target), expected=1)
        data = self.data()
        planned = [item["id"] for item in data["plan"]["checks"]]
        self.assertGreaterEqual(len(planned), 2)
        self.assertEqual(len(data["checks"][planned[0]]), 1)
        self.assertEqual(data["checks"][planned[0]][0]["status"], "unavailable")
        self.assertTrue(all(not data["checks"][label] for label in planned[1:]))
        result = self.cli("verify", self.packet, expected=1)
        self.assertIn("target files have unstaged changes", result.stderr)

    def test_frozen_plan_change_requires_new_packet(self):
        self.stage("docs/agents/target.md")
        self.create()
        data = self.data()
        data["plan"]["checks"].append({"id": "invented", "cwd": ".", "argv": ["true"], "reasons": ["test"]})
        self.packet.write_text(json.dumps(data))
        result = self.cli("verify", self.packet, expected=1)
        self.assertIn("handoff plan or identity changed", result.stderr)

    def test_formal_review_records_against_snapshot(self):
        self.stage("docs/agents/target.md")
        self.create()
        evidence = self.directory / "review.md"
        evidence.write_text("Formal review passed.\n")
        snapshot = self.data()["snapshot_id"]
        self.cli("review", self.packet, "--axis", "standards", "--status", "passed",
                 "--snapshot", snapshot, "--evidence", evidence)
        self.cli("review", self.packet, "--axis", "spec", "--status", "passed",
                 "--snapshot", snapshot, "--evidence", evidence)
        self.cli("verify", self.packet, "--require-passed", "--require-reviewed")

    def test_review_findings_and_snapshot_reuse_are_blocked(self):
        self.stage("docs/agents/target.md")
        self.create()
        evidence = self.directory / "review.md"
        evidence.write_text("Formal review found R1.\n")
        snapshot = self.data()["snapshot_id"]
        self.cli("review", self.packet, "--axis", "standards", "--status", "passed",
                 "--snapshot", snapshot, "--evidence", evidence)
        self.cli("review", self.packet, "--axis", "spec", "--status", "passed",
                 "--snapshot", snapshot, "--evidence", evidence, "--finding", "R1", "open")
        self.cli("verify", self.packet, "--require-reviewed", expected=1)
        self.stage("docs/agents/target.md", "revised\n")
        self.cli("review", self.packet, "--axis", "spec", "--status", "passed",
                 "--snapshot", snapshot, "--evidence", evidence, expected=1)


if __name__ == "__main__":
    unittest.main()
