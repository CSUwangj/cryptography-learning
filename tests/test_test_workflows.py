"""Static contract checks for shared push planning and nightly coverage."""

from pathlib import Path
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import test_plan


class TestWorkflowTest(unittest.TestCase):
    def test_push_groups_finish_frontend_guards_before_image_browser_acceptance(self):
        workflow = (ROOT / ".github/workflows/build.yml").read_text()
        grouping = textwrap.dedent(workflow.split("<<'PY'\n", 1)[1].split("\n          PY", 1)[0])
        cases = (
            ["frontend/e2e/learning.spec.ts"],
            ["frontend/e2e/learning.spec.ts", "frontend/package-lock.json", "frontend/.codegen.yml",
             "backend/apps/web-server/src/serve.rs", "scripts/test_plan.py", "Dockerfile"],
            ["frontend/e2e/completion-records.spec.ts"],
            ["frontend/src/crypto_graph/index.test.ts", "Dockerfile"],
        )
        with tempfile.TemporaryDirectory() as directory:
            plan_path = Path(directory) / "plan.json"
            for paths in cases:
                with self.subTest(paths=paths):
                    plan = test_plan.plan_paths(paths)
                    plan_path.write_text(json.dumps(plan))
                    result = subprocess.run([sys.executable, "-", str(plan_path)], input=grouping,
                                            text=True, capture_output=True, check=False)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    outputs = dict(line.split("=", 1) for line in result.stdout.splitlines())
                    self.assertEqual(base64.b64decode(outputs["encoded"]), plan_path.read_bytes())
                    groups = {entry["group"]: entry for entry in json.loads(outputs["groups"])["include"]}
                    planned_ids = [item["id"] for item in plan["checks"]]
                    grouped_ids = [identifier for entry in groups.values() for identifier in entry["checks"]]
                    self.assertCountEqual(grouped_ids, planned_ids)
                    self.assertEqual(len(grouped_ids), len(set(grouped_ids)))
                    image = groups["image"]
                    image_browsers = set(planned_ids) & {"image_acceptance", "completion_acceptance"}
                    if image_browsers:
                        self.assertNotIn("frontend", groups)
                        self.assertTrue(image["browser"])
                        for browser in image_browsers:
                            for guard in ("frontend_lint", "frontend-tests"):
                                self.assertLess(image["checks"].index(guard), image["checks"].index(browser))
                        self.assertEqual(image["checks"], [identifier for identifier in planned_ids
                                                         if identifier not in {"tooling", "backend"}])
                        units = next(item["argv"] for item in plan["checks"] if item["id"] == "frontend-tests")
                        if "frontend_install" in planned_ids:
                            self.assertEqual(units, ["npm", "test", "--", "--maxWorkers=1", "--passWithNoTests=false"])
                        else:
                            self.assertIn("src/app/i18n/noEmbeddedUiResources.test.ts", units)
                    else:
                        self.assertIn("frontend", groups)
                        self.assertEqual(image["checks"], ["image_smoke"])
                        self.assertFalse(image["browser"])
                    self.assertEqual(image["has_install"], "frontend_install" in planned_ids)
                    if image["has_install"]:
                        self.assertEqual(image["checks"][0], "frontend_install")
                        self.assertLess(image["checks"].index("frontend_codegen"), image["checks"].index("frontend_typecheck"))
                    if "tooling" in planned_ids:
                        self.assertEqual(groups["tooling"]["checks"], ["tooling"])
                    if "backend" in planned_ids:
                        self.assertEqual(groups["backend"]["checks"], ["backend"])
        install_step = workflow.split("      - name: Run frontend install check once\n", 1)[1].split("      - name:", 1)[0]
        self.assertIn("if: ${{ matrix.has_install }}", install_step)
        self.assertIn('scripts/test_plan.py run --plan "$PLAN" --id frontend_install', install_step)

    def test_nightly_frontend_runs_the_shared_lint_command(self):
        workflow = (ROOT / ".github/workflows/nightly.yml").read_text()
        frontend = workflow.split("  frontend:\n", 1)[1].split("  vite-acceptance:\n", 1)[0]
        self.assertIn("          npm run lint\n", frontend)

    def test_workflows_use_actions_with_node24_runtimes(self):
        minimum_versions = {
            "actions/checkout": 5,
            "actions/setup-node": 5,
            "actions/cache": 5,
            "actions/upload-artifact": 6,
            "docker/setup-buildx-action": 4,
            "docker/login-action": 4,
            "actions/attest-build-provenance": 3,
        }
        for path in (ROOT / ".github/workflows").glob("*.yml"):
            for action, version in re.findall(r"uses:\s*([^\s@]+)@v(\d+)\b", path.read_text()):
                if action in minimum_versions:
                    with self.subTest(workflow=path.name, action=action):
                        self.assertGreaterEqual(int(version), minimum_versions[action])

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
        self.assertIn('identifier in {"image_smoke", "image_acceptance", "completion_acceptance"}', workflow)
        self.assertIn('entry["browser"] |= identifier in {"image_acceptance", "completion_acceptance", "demo_browser"}', workflow)
        self.assertIn("if: ${{ matrix.group == 'frontend' || matrix.browser }}", workflow)
        self.assertIn("if: ${{ !matrix.has_install && (matrix.browser || matrix.group == 'frontend') }}", workflow)
        self.assertNotIn('or group == "image"', workflow)
        self.assertIn("Build web-tier image once", workflow)
        self.assertIn("Build completion relay image once", workflow)
        self.assertIn("CHECK_IDS", workflow)
        self.assertIn("name: Build / aggregate", workflow)
        self.assertIn("if: always()", workflow)
        self.assertIn('test "$CHECKS_RESULT" = success', workflow)
        self.assertNotIn("paths:", workflow)

    def test_nightly_covers_immutable_independent_runtime_suites(self):
        workflow = (ROOT / ".github/workflows/nightly.yml").read_text()
        for required in (
            "cron: '17 2 * * *'", "workflow_dispatch:",
            "  tooling:", "  backend:", "  frontend:", "  vite-acceptance:",
            "  image-acceptance:", "  aggregate:",
            "python3 -m unittest discover -s tests",
            "cargo fmt --all -- --check", "cargo clippy --locked --all-targets",
            "cargo test --locked -- --nocapture", "cargo build --locked --release",
            "npm run gen", "npm run typecheck", "npm test -- --maxWorkers=1", "npm run build",
            "e2e/crypto-graph-worker.spec.ts", "e2e/visualizers.spec.ts",
            "e2e/overlay.spec.ts", "e2e/spn-cipher.spec.ts",
            "e2e/aes-cipher-demo.spec.ts", "e2e/learning.spec.ts",
            "e2e/completion-records-layout.spec.ts", "e2e/home-layout.spec.ts",
            "e2e/practice-navigation.spec.ts",
            "--mode release", "--target completion-relay",
            "acceptance/completion/run.sh", "--print-sqlite-version",
            "continue-on-error: true", "runs-on: macos-latest",
            "ref: ${{ github.sha }}", "needs: [tooling, backend, frontend, vite-acceptance, image-acceptance]",
        ):
            with self.subTest(required=required):
                self.assertIn(required, workflow)
        self.assertNotIn("github.event.repository.default_branch", workflow)
        self.assertNotIn("web-tier.spec.ts", workflow)

    def test_completion_harness_requires_one_executed_browser_case(self):
        harness = (ROOT / "acceptance/completion/run.sh").read_text()
        self.assertIn("--reporter=json", harness)
        self.assertIn("stats['expected'] != 1", harness)
        self.assertIn("stats['skipped']", harness)
        self.assertIn('COMPLETION_SKIP_NPM_CI:-0', harness)

    def test_nightly_preserves_vite_diagnostics_and_runs_relay_after_browser_failure(self):
        workflow = (ROOT / ".github/workflows/nightly.yml").read_text()
        self.assertIn("frontend/test-results", workflow)
        self.assertIn("id: image-build", workflow)
        self.assertIn("if: ${{ always() && steps.image-build.outcome == 'success' }}", workflow)
        self.assertIn("COMPLETION_SKIP_NPM_CI: '1'", workflow)

    def test_push_completion_acceptance_reuses_installed_frontend_dependencies(self):
        workflow = (ROOT / ".github/workflows/build.yml").read_text()
        self.assertIn('if [[ "$check_id" == completion_acceptance ]]; then', workflow)
        self.assertIn('COMPLETION_SKIP_NPM_CI=1 python3 scripts/test_plan.py run', workflow)

    def test_completion_harness_preserves_the_node_pin_with_setup_node_or_nvm(self):
        harness = (ROOT / "acceptance/completion/run.sh").read_text()
        function = harness.split("run_frontend_playwright() {", 1)[1].split("\nrun_frontend_playwright\n", 1)[0]
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            pin = (ROOT / "frontend/.nvmrc").read_text().strip()
            for name, body in {
                "node": 'echo "v$REPORTED_NODE"\n',
                "npm": 'echo install >> "$CALLS"\n',
                "npx": '[[ "$(node --version)" == "v$NODE_PIN" ]] || exit 40\necho "$*" >> "$CALLS"\necho \'{}\'\n',
            }.items():
                command = temp / name
                command.write_text("#!/bin/bash\n" + body)
                command.chmod(0o755)
            # Hosted runners have nvm, but setup-node installs into a separate tool cache.
            (temp / "nvm.sh").write_text(
                'nvm() { [[ "$REPORTED_NODE" != "$NODE_PIN" ]] || return 37; '
                'echo "nvm $*" >> "$CALLS"; export REPORTED_NODE="$NODE_PIN"; }\n')
            for node_version, skip_install in ((pin, "0"), (pin, "1"), ("0.0.0", "1")):
                with self.subTest(node_version=node_version, skip_install=skip_install):
                    calls = temp / "calls"
                    calls.unlink(missing_ok=True)
                    result = subprocess.run(
                        ["/bin/bash", "-euc", "run_frontend_playwright() {" + function + "\nrun_frontend_playwright"],
                        env={**os.environ, "ROOT": str(ROOT), "ARTIFACT_DIR": directory,
                             "PATH": directory, "NVM_DIR": directory, "CALLS": str(calls),
                             "NODE_PIN": pin, "REPORTED_NODE": node_version,
                             "COMPLETION_SKIP_NPM_CI": skip_install},
                        capture_output=True, text=True,
                    )
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertEqual(calls.read_text().splitlines(),
                                     ([] if node_version == pin else ["nvm use"]) +
                                     ([] if skip_install == "1" else ["install"]) +
                                     ["playwright test --project=chromium e2e/completion-records.spec.ts --reporter=json"])
                    self.assertEqual((temp / "playwright-results.json").read_text(), "{}\n")

    def test_push_workflow_caches_dependencies_and_bounds_required_jobs(self):
        workflow = (ROOT / ".github/workflows/build.yml").read_text()
        plan = workflow.split("  plan:", 1)[1].split("  checks:", 1)[0]
        checks = workflow.split("  checks:", 1)[1].split("  aggregate:", 1)[0]
        self.assertIn("timeout-minutes: 5", plan)
        self.assertIn("timeout-minutes: 30", checks)
        self.assertIn("cache: npm", checks)
        self.assertIn("actions/cache@v5", checks)
        self.assertIn("~/.cargo/registry", checks)
        self.assertIn("backend/target", checks)
        self.assertIn("/tmp/.buildx-cache", checks)
        self.assertIn("/tmp/.buildx-cache-web", checks)
        self.assertIn("/tmp/.buildx-cache-relay", checks)
        self.assertIn("key: buildkit-${{ runner.os }}-${{ github.sha }}", checks)
        self.assertIn("restore-keys: buildkit-${{ runner.os }}-", checks)
        self.assertIn("cache_from=(--cache-from type=local,src=/tmp/.buildx-cache-web)", checks)
        self.assertIn("cache_from+=(--cache-from type=local,src=/tmp/.buildx-cache-relay)", checks)
        self.assertNotIn("cache-to type=local,dest=/tmp/.buildx-cache-relay,mode=max", checks)
        self.assertIn("!matrix.has_install", checks)

    def test_nightly_runs_independent_cached_jobs_and_strict_aggregate(self):
        workflow = (ROOT / ".github/workflows/nightly.yml").read_text()
        for job in (
            "  tooling:", "  backend:", "  frontend:", "  vite-acceptance:",
            "  image-acceptance:", "  aggregate:",
        ):
            self.assertIn(job, workflow)
        self.assertIn("timeout-minutes: 30", workflow)
        self.assertIn("timeout-minutes: 5", workflow)
        self.assertIn("path: ~/.npm", workflow)
        self.assertIn("actions/cache@v5", workflow)
        self.assertIn("~/.cargo/registry", workflow)
        self.assertIn("/tmp/.buildx-cache", workflow)
        self.assertIn("/tmp/.buildx-cache-web", workflow)
        self.assertIn("/tmp/.buildx-cache-relay", workflow)
        self.assertIn("key: nightly-buildkit-${{ runner.os }}-${{ github.sha }}", workflow)
        self.assertIn("restore-keys: nightly-buildkit-${{ runner.os }}-", workflow)
        self.assertIn("web_cache_from=()", workflow)
        self.assertIn("web_cache_from+=(--cache-from type=local,src=/tmp/.buildx-cache-web)", workflow)
        self.assertIn("relay_cache_from=(--cache-from type=local,src=/tmp/.buildx-cache-web)", workflow)
        self.assertIn("relay_cache_from+=(--cache-from type=local,src=/tmp/.buildx-cache-relay)", workflow)
        self.assertNotIn("cache-to type=local,dest=/tmp/.buildx-cache-relay,mode=max", workflow)
        self.assertIn("needs: [tooling, backend, frontend, vite-acceptance, image-acceptance]", workflow)
        self.assertIn('test "$result" = success', workflow)
        self.assertGreaterEqual(workflow.count("ref: ${{ github.sha }}"), 5)
        self.assertNotIn("github.event.repository.default_branch", workflow)


if __name__ == "__main__":
    unittest.main()
