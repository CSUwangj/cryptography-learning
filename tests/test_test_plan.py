"""Public changed-path planner contracts."""

from pathlib import Path
import base64
import json
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import test_plan


class TestPlanTest(unittest.TestCase):
    def test_range_uses_existing_full_git_range(self):
        result = subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD~1^{commit}"],
            cwd=ROOT, text=True, capture_output=True,
        )
        if result.returncode:
            self.skipTest("checkout has no parent commit for a range probe")
        plan = test_plan.plan_range(ROOT, result.stdout.strip(), "HEAD")
        self.assertIn("paths", plan)
        self.assertIn("checks", plan)

    def test_successful_empty_range_is_docs_only(self):
        plan = test_plan.plan_range(ROOT, "HEAD", "HEAD")
        self.assertEqual(plan, {"kind": "docs-only", "paths": [], "checks": [], "omissions": []})

    def test_range_includes_changes_from_each_commit(self):
        result = subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD~2^{commit}"],
            cwd=ROOT, text=True, capture_output=True,
        )
        if result.returncode:
            self.skipTest("checkout has fewer than two parent commits")
        before = result.stdout.strip()
        expected = subprocess.run(
            ["git", "diff", "--name-only", "-z", before, "HEAD"],
            cwd=ROOT, capture_output=True, check=True,
        ).stdout.split(b"\0")
        expected_paths = {value.decode() for value in expected if value}
        plan = test_plan.plan_range(ROOT, before, "HEAD")
        self.assertEqual(set(plan["paths"]), expected_paths)

    def test_path_records_union_renames_deletions_and_multiple_commits(self):
        records = [
            ("M", "frontend/src/crypto_graph/new.test.ts"),
            ("M", "backend/crates/completion-claims/src/lib.rs"),
            ("R100", "frontend/src/crypto_graph/new.test.ts", "frontend/src/crypto_graph/renamed.test.ts"),
            ("D", "backend/crates/completion-claims/src/lib.rs"),
        ]
        plan = test_plan.plan_records(records)
        self.assertEqual(set(plan["paths"]), {
            "frontend/src/crypto_graph/new.test.ts",
            "frontend/src/crypto_graph/renamed.test.ts",
            "backend/crates/completion-claims/src/lib.rs",
        })
        ids = {check["id"] for check in plan["checks"]}
        self.assertIn("frontend-tests", ids)
        self.assertIn("claims", ids)

    def test_multiple_frontend_routes_union_test_files(self):
        plan = test_plan.plan_paths([
            "frontend/src/crypto_graph/index.test.ts",
            "frontend/src/practice/map.test.ts",
        ])
        command = next(item["argv"] for item in plan["checks"] if item["id"] == "frontend-tests")
        self.assertIn("src/crypto_graph/index.test.ts", command)
        self.assertIn("src/practice/map.test.ts", command)

    def test_documentation_only_and_unknown_executable_fallback(self):
        self.assertEqual(test_plan.plan_paths(["docs/research/example.md"])["kind"], "docs-only")
        with self.assertRaisesRegex(ValueError, "empty check plan"):
            test_plan.plan_paths([])
        fallback = test_plan.plan_paths(["scripts/new-executable.py"])
        self.assertIn("tooling", {check["id"] for check in fallback["checks"]})
        self.assertTrue(any("unknown" in reason for check in fallback["checks"] for reason in check["reasons"]))
        root_fallback = test_plan.plan_paths(["unknown-config.toml"])
        self.assertTrue({"backend_tests", "frontend-tests", "tooling"} <= {item["id"] for item in root_fallback["checks"]})

    def test_frontend_leaf_selects_named_test_and_empty_selection_fails(self):
        leaf = "frontend/src/crypto_graph/index.test.ts"
        plan = test_plan.plan_paths([leaf])
        check = next(check for check in plan["checks"] if check["id"] == "frontend-tests")
        self.assertIn("src/crypto_graph/index.test.ts", check["argv"])
        self.assertIn("--passWithNoTests=false", check["argv"])

    def test_browser_specs_have_distinct_check_ids(self):
        plan = test_plan.plan_paths([
            "frontend/e2e/home-layout.spec.ts",
            "frontend/e2e/learning.spec.ts",
            "frontend/e2e/aes-cipher-demo.spec.ts",
            "frontend/e2e/visualizers.spec.ts",
        ])
        checks = {item["id"]: item["argv"] for item in plan["checks"]}
        self.assertEqual(
            {
                "browser_home-layout", "browser_learning", "image_acceptance",
                "browser_aes-cipher-demo", "browser_visualizers", "browser_parallel_regressions",
            },
            set(checks),
        )
        self.assertIn("home-layout.spec.ts", checks["browser_home-layout"])
        self.assertIn("learning.spec.ts", checks["browser_learning"])
        self.assertEqual(
            checks["browser_parallel_regressions"],
            [
                "npx", "playwright", "test", "--project=chromium", "--workers=2",
                "e2e/home-layout.spec.ts", "e2e/learning.spec.ts",
                "e2e/visualizers.spec.ts", "--grep",
                "stacks features on phones|loads catalog and deep link|selects Preserve or Strict|renders an accessible continuous comparison|marks retained snapshots|executes an initial comparison|Shared AES presentation",
            ],
        )

    def test_registered_ui_prototype_records_demo_browser_omission(self):
        for path in (
            "frontend/demos/UiOptimizationPrototype.tsx",
            "frontend/demos/LearningShellPrototype.tsx",
            "frontend/demos/Aes192OverlayPrototype.tsx",
            "frontend/demos/aes192OverlayPrototypeData.ts",
            "frontend/demos/uiOptimizationPrototypeFixture.ts",
        ):
            with self.subTest(path=path):
                plan = test_plan.plan_paths([path])
                self.assertNotIn("demo_browser", {item["id"] for item in plan["checks"]})
                self.assertEqual(plan["omissions"], [{
                    "id": "demo_browser",
                    "status": "not-run",
                    "reason": "registered UI prototype does not change the real demo contract",
                }])
                self.assertIn("frontend-tests", {item["id"] for item in plan["checks"]})

    def test_real_demo_and_prototype_paths_union_checks_and_suppress_omission(self):
        real = test_plan.plan_paths(["frontend/demos/aes128CipherLesson.ts"])
        real_ids = {item["id"] for item in real["checks"]}
        self.assertTrue({"demo_browser", "frontend-tests", "frontend_typecheck"} <= real_ids)

        mixed = test_plan.plan_paths([
            "frontend/demos/UiOptimizationPrototype.tsx",
            "frontend/demos/aes128CipherLesson.ts",
        ])
        mixed_ids = {item["id"] for item in mixed["checks"]}
        self.assertIn("demo_browser", mixed_ids)
        self.assertEqual(mixed["omissions"], [])
        self.assertTrue(any("runtime demos" in reason for item in mixed["checks"] if item["id"] == "demo_browser" for reason in item["reasons"]))

        component = test_plan.plan_paths(["frontend/demos/AesCipherDemo.tsx"])
        selected = next(item["argv"] for item in component["checks"] if item["id"] == "frontend-tests")
        self.assertIn("demos/AesCipherDemo.test.tsx", selected)

    def test_prototype_and_real_visualizer_change_select_demo_browser(self):
        plan = test_plan.plan_paths([
            "frontend/demos/UiOptimizationPrototype.tsx",
            "frontend/src/visualizers/index.ts",
        ])
        self.assertIn("demo_browser", {item["id"] for item in plan["checks"]})
        self.assertEqual(plan["omissions"], [])

    def test_prototype_and_real_runtime_compiler_change_select_demo_browser(self):
        plan = test_plan.plan_paths([
            "frontend/demos/UiOptimizationPrototype.tsx",
            "frontend/src/lesson_runtime/compiler.ts",
        ])
        self.assertIn("demo_browser", {item["id"] for item in plan["checks"]})
        self.assertEqual(plan["omissions"], [])

    def test_unregistered_demo_paths_keep_browser_coverage(self):
        for path in (
            "frontend/demos/aes128CipherLesson.ts",
            "frontend/demos/KeyExpansionPrototype.tsx",
        ):
            with self.subTest(path=path):
                plan = test_plan.plan_paths([path])
                self.assertIn("demo_browser", {item["id"] for item in plan["checks"]})
                self.assertEqual(plan["omissions"], [])

    def test_prototype_documentation_does_not_select_runtime_checks(self):
        plan = test_plan.plan_paths(["frontend/demos/UI_OPTIMIZATION_PROTOTYPE.md"])
        self.assertEqual(plan, {
            "kind": "docs-only",
            "paths": ["frontend/demos/UI_OPTIMIZATION_PROTOTYPE.md"],
            "checks": [],
            "omissions": [],
        })

    def test_image_paths_select_smoke_except_preserved_browser_acceptance(self):
        smoke_paths = (
            "baseline/content/lessons/example.md",
            "baseline/tests/test_http_spa.py",
            "Dockerfile",
            "docker-compose.yml",
            "start-web-tier.sh",
            "acceptance/run.sh",
        )
        for path in smoke_paths:
            with self.subTest(path=path):
                checks = {item["id"]: item for item in test_plan.plan_paths([path])["checks"]}
                self.assertIn("image_smoke", checks)
                self.assertEqual(checks["image_smoke"]["argv"][-1], "smoke")
                self.assertNotIn("image_acceptance", checks)

        preserved = {
            "baseline/fixtures/graphql/catalog.json": "image_acceptance",
            "baseline/terminal/ws_protocol.py": "image_acceptance",
            "frontend/e2e/web-tier.spec.ts": "image_acceptance",
            "frontend/e2e/learning.spec.ts": "image_acceptance",
        }
        for path, identifier in preserved.items():
            with self.subTest(path=path):
                checks = {item["id"]: item for item in test_plan.plan_paths([path])["checks"]}
                self.assertIn(identifier, checks)
                self.assertEqual(checks[identifier]["argv"][-1], "pr")

    def test_mixed_image_paths_keep_union_of_smoke_and_browser_checks(self):
        plan = test_plan.plan_paths([
            "Dockerfile",
            "frontend/e2e/web-tier.spec.ts",
        ])
        checks = {item["id"]: item for item in plan["checks"]}
        self.assertTrue({"image_smoke", "image_acceptance"} <= set(checks))
        self.assertEqual(checks["image_smoke"]["argv"][-1], "smoke")
        self.assertEqual(checks["image_acceptance"]["argv"][-1], "pr")

    def test_frontend_discovery_uses_supplied_repository(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            test_file = repo / "frontend/src/practice/map.test.ts"
            test_file.parent.mkdir(parents=True)
            test_file.write_text("", encoding="utf-8")
            plan = test_plan.plan_paths(
                ["frontend/src/practice/PracticePage.tsx"], repo=repo
            )
        command = next(item["argv"] for item in plan["checks"] if item["id"] == "frontend-tests")
        self.assertIn("src/practice/map.test.ts", command)

    def test_browser_helpers_select_their_consuming_specs(self):
        worker = test_plan.plan_paths(["frontend/e2e/v2-default-trace-browser.tsx"])
        self.assertEqual(
            {item["id"] for item in worker["checks"]},
            {"browser_crypto-graph-worker"},
        )
        terminal = test_plan.plan_paths(["frontend/e2e/fixtures/browser_terminal_fixture.py"])
        self.assertEqual(
            {item["id"] for item in terminal["checks"]},
            {"browser_terminal"},
        )
        unknown = test_plan.plan_paths(["frontend/e2e/new-helper.ts"])
        self.assertIn("frontend-tests", {item["id"] for item in unknown["checks"]})
        self.assertNotIn("browser_new-helper.ts", {item["id"] for item in unknown["checks"]})
        aes_fixture = test_plan.plan_paths(["frontend/e2e/aes-learning-fixture.tsx"])
        self.assertEqual(
            {item["id"] for item in aes_fixture["checks"]},
            {"browser_aes-cipher-demo", "browser_visualizers"},
        )

    def test_dependency_edges_and_toolchain_fallbacks(self):
        cases = {
            "backend/apps/completion-relay/src/lib.rs": {"relay", "relay_fmt", "relay_clippy"},
            "backend/crates/completion-claims/src/lib.rs": {"claims"},
            "backend/apps/web-server/src/model.rs": {"backend", "backend_schema", "frontend-tests", "frontend_codegen", "frontend_typecheck"},
            "frontend/schema/schema.gql": {"backend_schema", "frontend-tests", "frontend_codegen", "frontend_typecheck"},
            "frontend/src/crypto_graph/worker_adapter.ts": {"frontend-tests", "frontend_typecheck", "browser_crypto-graph-worker"},
            "baseline/fixtures/graphql/catalog.json": {"frontend-tests", "image_acceptance"},
            "baseline/content/lessons/example.md": {"image_smoke"},
            "baseline/tests/test_http_spa.py": {"image_smoke"},
            "baseline/terminal/ws_protocol.py": {"image_acceptance"},
            "frontend/demos/example.ts": {"frontend-tests", "demo_browser"},
            "frontend/demos/AesCipherDemo.tsx": {"frontend-tests", "frontend_typecheck", "demo_browser"},
            "frontend/e2e/web-tier.spec.ts": {"image_acceptance"},
            "frontend/e2e/completion-records.spec.ts": {"completion_acceptance"},
            "frontend/e2e/crypto-graph-worker.spec.ts": {"browser_crypto-graph-worker"},
            "frontend/e2e/v2-default-trace-browser.tsx": {"browser_crypto-graph-worker"},
            "frontend/e2e/fixtures/browser_terminal_fixture.py": {"browser_terminal"},
            "frontend/src/terminal/browser/harness.tsx": {"browser_terminal", "frontend-tests", "frontend_typecheck"},
            "frontend/terminal-harness.html": {"browser_terminal", "frontend-tests", "frontend_build"},
            "frontend/src/practice/PracticeNavigation.tsx": {"frontend-tests", "frontend_typecheck"},
            "frontend/src/completion_board/CompletionRecordsPage.tsx": {"frontend-tests", "frontend_typecheck"},
            "frontend/src/index.tsx": {"frontend-tests", "frontend_typecheck", "frontend_build"},
            "frontend/src/vite-env.d.ts": {"frontend-tests", "frontend_typecheck"},
            "acceptance/completion/run.sh": {"completion_acceptance", "tooling"},
            "frontend/package-lock.json": {"frontend-tests", "frontend_typecheck", "frontend_build", "frontend_install"},
            "rust-toolchain.toml": {"backend_fmt", "backend_clippy", "backend_tests", "backend_build"},
            "start-web-tier.sh": {"image_smoke", "tooling"},
        }
        for path, expected in cases.items():
            with self.subTest(path=path):
                ids = {check["id"] for check in test_plan.plan_paths([path])["checks"]}
                self.assertTrue(expected <= ids, f"{path}: missing {expected - ids}")

        schema = next(
            item for item in test_plan.plan_paths(["frontend/schema/schema.gql"])["checks"]
            if item["id"] == "backend_schema"
        )
        self.assertIn("cryptography-learning-backend", schema["argv"])

        gql = {item["id"] for item in test_plan.plan_paths(["frontend/src/practice/graphql/practices.gql"])["checks"]}
        self.assertTrue({"frontend-tests", "backend_schema", "frontend_codegen", "frontend_typecheck"} <= gql)

        for path in ("frontend/src/lesson_runtime/compiler.ts", "frontend/src/lesson_runtime/browser.ts"):
            tests = next(item for item in test_plan.plan_paths([path])["checks"] if item["id"] == "frontend-tests")
            self.assertIn("src/lesson_runtime/bitFlip.test.ts", tests["argv"])
        tests = next(item for item in test_plan.plan_paths(["frontend/src/crypto_graph/index.ts"])["checks"] if item["id"] == "frontend-tests")
        self.assertIn("src/lesson_runtime/bitFlip.test.ts", tests["argv"])
        self.assertIn("src/visualizers/ClassicalReadability.test.tsx", tests["argv"])

        for path, expected in (
            ("frontend/src/practice/PracticeNavigation.tsx", "src/app/PracticeNavigation.routes.test.tsx"),
            ("frontend/src/completion_board/CompletionRecordsPage.tsx", "src/app/CompletionRecords.routes.test.tsx"),
        ):
            tests = next(item for item in test_plan.plan_paths([path])["checks"] if item["id"] == "frontend-tests")
            self.assertIn(expected, tests["argv"])

    def test_worker_source_and_browser_helper_share_one_check(self):
        plan = test_plan.plan_paths([
            "frontend/src/crypto_graph/worker_adapter.ts",
            "frontend/e2e/v2-default-trace-browser.tsx",
        ])
        ids = {item["id"] for item in plan["checks"]}
        self.assertEqual(ids & {"browser_crypto-graph-worker", "worker_browser"}, {"browser_crypto-graph-worker"})

    def test_unknown_frontend_module_uses_visible_broad_fallback(self):
        plan = test_plan.plan_paths(["frontend/src/newmodule/feature.ts"])
        checks = {item["id"]: item for item in plan["checks"]}
        self.assertTrue({"frontend-tests", "frontend_typecheck", "frontend_build"} <= checks.keys())
        self.assertTrue(any("unknown frontend module" in reason for reason in checks["frontend-tests"]["reasons"]))

    def test_unavailable_comparison_base_selects_visible_broad_fallback(self):
        plan = test_plan.plan_range(ROOT, "0" * 40, "HEAD")
        self.assertTrue({"backend_fmt", "frontend-tests", "tooling"} <= {item["id"] for item in plan["checks"]})
        self.assertIn("comparison base unavailable", plan["fallback"])

    def test_runner_executes_only_selected_argv_and_returns_its_status(self):
        plan = {"checks": [{"id": "probe", "cwd": ".", "argv": [sys.executable, "-c", "raise SystemExit(7)"]}]}
        encoded = base64.b64encode(json.dumps(plan).encode()).decode()
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "test_plan.py"), "run", "--plan", encoded, "--id", "probe"],
            cwd=ROOT, check=False,
        )
        self.assertEqual(result.returncode, 7)

    def test_codegen_runner_rejects_untracked_generated_output(self):
        generated = ROOT / "frontend/src/transport/generated/.planner-untracked-probe"
        plan = {
            "checks": [{
                "id": "frontend_codegen",
                "cwd": ".",
                "argv": [
                    sys.executable,
                    "-c",
                    "from pathlib import Path; Path(%r).write_text('probe')" % str(generated),
                ],
            }],
        }
        encoded = base64.b64encode(json.dumps(plan).encode()).decode()
        try:
            result = subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "test_plan.py"), "run", "--plan", encoded, "--id", "frontend_codegen"],
                cwd=ROOT,
                check=False,
            )
            self.assertEqual(result.returncode, 1)
        finally:
            generated.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
