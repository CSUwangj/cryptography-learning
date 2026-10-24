"""Static contract checks for shared push planning and nightly coverage."""

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class TestWorkflowTest(unittest.TestCase):
    def test_push_workflow_uses_full_range_and_stable_aggregate(self):
        workflow = (ROOT / ".github/workflows/build.yml").read_text()
        self.assertIn("  push:", workflow)
        self.assertNotIn("pull_request:", workflow)
        self.assertIn('BEFORE: ${{ github.event.before }}', workflow)
        self.assertIn('AFTER: ${{ github.sha }}', workflow)
        self.assertIn("scripts/test_plan.py range", workflow)
        self.assertIn("scripts/test_plan.py run", workflow)
        self.assertIn('groups=', workflow)
        self.assertIn('matrix: ${{ fromJSON(needs.plan.outputs.groups) }}', workflow)
        self.assertIn("name: Selected ${{ matrix.group }} checks", workflow)
        self.assertNotIn("matrix.id", workflow)
        self.assertIn("Build web-tier image once", workflow)
        self.assertIn("Build completion relay image once", workflow)
        self.assertIn("CHECK_IDS", workflow)
        self.assertIn("name: Build / aggregate", workflow)
        self.assertIn("if: always()", workflow)
        self.assertIn('test "$CHECKS_RESULT" = success', workflow)
        self.assertNotIn("paths:", workflow)

    def test_nightly_covers_default_branch_full_and_runtime_suites(self):
        workflow = (ROOT / ".github/workflows/nightly.yml").read_text()
        for required in (
            "cron: '17 2 * * *'", "workflow_dispatch:",
            "github.event.repository.default_branch",
            "python3 -m unittest discover -s tests",
            "cargo fmt --all -- --check", "cargo clippy --locked --all-targets",
            "cargo test --locked -- --nocapture", "cargo build --locked --release",
            "npm run gen", "npm run typecheck", "npm test -- --maxWorkers=1", "npm run build",
            "e2e/crypto-graph-worker.spec.ts", "e2e/visualizers.spec.ts",
            "e2e/aes-cipher-demo.spec.ts", "e2e/learning.spec.ts",
            "e2e/completion-records-layout.spec.ts", "e2e/home-layout.spec.ts",
            "e2e/practice-navigation.spec.ts",
            "--mode release", "--target completion-relay",
            "acceptance/completion/run.sh", "--print-sqlite-version",
            "continue-on-error: true", "runs-on: macos-14",
        ):
            with self.subTest(required=required):
                self.assertIn(required, workflow)
        vite_lane = workflow.split("- name: Vite-only browser acceptance", 1)[1].split("- name:", 1)[0]
        self.assertNotIn("web-tier.spec.ts", vite_lane)

    def test_completion_harness_requires_one_executed_browser_case(self):
        harness = (ROOT / "acceptance/completion/run.sh").read_text()
        self.assertIn("--reporter=json", harness)
        self.assertIn("stats['expected'] != 1", harness)
        self.assertIn("stats['skipped']", harness)


if __name__ == "__main__":
    unittest.main()
