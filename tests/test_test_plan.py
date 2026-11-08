"""Public changed-path planner contracts."""

from pathlib import Path
import base64
import hashlib
import json
import os
import shlex
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import test_plan


class TestPlanTest(unittest.TestCase):
    def test_frontend_paths_select_the_read_only_lint_command(self):
        for path in (
            "frontend/src/app/home/HomePage.tsx",
            "frontend/src/practice/map.test.ts",
            "frontend/src/lesson_runtime/fixture/aes192-first-round.ts",
            "frontend/demos/UiOptimizationPrototype.tsx",
            "frontend/e2e/learning.spec.ts",
            "frontend/scripts/playwright-server.mjs",
            "frontend/vite.config.mts",
            "frontend/eslint.config.mjs",
            "frontend/package.json",
            "frontend/package-lock.json",
        ):
            with self.subTest(path=path):
                checks = {item["id"]: item for item in test_plan.plan_paths([path])["checks"]}
                self.assertIn("frontend_lint", checks)
                self.assertEqual(checks["frontend_lint"]["cwd"], "frontend")
                self.assertEqual(checks["frontend_lint"]["argv"], ["npm", "run", "lint"])

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

    def test_documentation_companions_select_direct_consumers(self):
        examples = (
            ("docs/examples/migration/xor-v1", "src/lesson_runtime/migrationExample.test.ts"),
            ("docs/examples/migration/xor-v2", "src/lesson_runtime/migrationExample.test.ts"),
            ("docs/examples/migration/projection", "src/lesson_runtime/migrationExample.test.ts"),
            ("docs/examples/operations/xor-constant", "src/crypto_graph/operationExample.test.ts"),
        )
        command = ["npm", "test", "--", "--maxWorkers=1", "--passWithNoTests=false"]
        for root, consumer in examples:
            for name in ("lesson.yaml", "locales/en-US.yaml", "locales/zh-CN.yaml"):
                path = f"{root}/{name}"
                with self.subTest(path=path):
                    checks = {item["id"]: item for item in test_plan.plan_paths([path])["checks"]}
                    self.assertEqual(set(checks), {"frontend-tests"})
                    self.assertEqual(checks["frontend-tests"]["argv"], [*command, consumer])
        mixed = test_plan.plan_paths([
            *(f"{root}/lesson.yaml" for root, _ in examples),
            "frontend/src/practice/map.test.ts", "scripts/test_plan.py",
        ])
        checks = {item["id"]: item for item in mixed["checks"]}
        self.assertEqual(set(checks), {"frontend-tests", "frontend_typecheck", "tooling"})
        self.assertEqual(checks["frontend-tests"]["argv"], [*command, *sorted({
            *(consumer for _, consumer in examples),
            "src/practice/map.test.ts", "src/app/i18n/noEmbeddedUiResources.test.ts",
        })])
        for unknown in ("docs/examples/unrelated/lesson.yaml", "docs/examples/operations/other/lesson.yaml",
                        "docs/examples/migration/tool.py"):
            with self.subTest(unknown=unknown):
                fallback = test_plan.plan_paths([f"{examples[0][0]}/lesson.yaml", unknown])
                checks = {item["id"]: item for item in fallback["checks"]}
                self.assertTrue({"backend_tests", "frontend-tests", "tooling"} <= set(checks))
                self.assertEqual(checks["frontend-tests"]["argv"], command)

    def test_frontend_leaf_selects_named_test_and_empty_selection_fails(self):
        leaf = "frontend/src/crypto_graph/index.test.ts"
        plan = test_plan.plan_paths([leaf])
        check = next(check for check in plan["checks"] if check["id"] == "frontend-tests")
        self.assertIn("src/crypto_graph/index.test.ts", check["argv"])
        self.assertIn("--passWithNoTests=false", check["argv"])

    def test_frontend_changes_include_ui_resource_guard(self):
        for path in (
            "frontend/src/crypto_graph/index.test.ts",
            "frontend/src/app/home/HomePage.tsx",
            "frontend/src/app/App.css",
            "frontend/src/app/i18n/locales/en-US/demos.json",
            "frontend/demos/LearningShellPrototype.tsx",
            "frontend/e2e/aes-cipher-demo.spec.ts",
        ):
            with self.subTest(path=path):
                plan = test_plan.plan_paths([path])
                check = next(item for item in plan["checks"] if item["id"] == "frontend-tests")
                self.assertEqual(check["argv"].count("src/app/i18n/noEmbeddedUiResources.test.ts"), 1)

    def test_full_frontend_suite_discovers_guard_without_an_extra_run(self):
        plan = test_plan.plan_paths(["frontend/package.json"])
        checks = [item for item in plan["checks"] if item["id"] == "frontend-tests"]
        self.assertEqual(len(checks), 1)
        self.assertEqual(checks[0]["argv"], ["npm", "test", "--", "--maxWorkers=1", "--passWithNoTests=false"])

    def test_plans_classify_heavy_checks_and_leave_named_units_lightweight(self):
        cases = (
            ("frontend/e2e/local-run.spec.ts", "browser_local-run", True),
            ("frontend/package.json", "frontend-tests", True),
            ("frontend/package.json", "frontend_build", True),
            ("backend/Cargo.toml", "backend_build", True),
            ("acceptance/run.sh", "image_smoke", True),
            ("frontend/src/crypto_graph/index.test.ts", "frontend-tests", False),
            ("scripts/test_plan.py", "tooling", False),
        )
        for path, identifier, expected in cases:
            with self.subTest(path=path, identifier=identifier):
                checks = {item["id"]: item for item in test_plan.plan_paths([path])["checks"]}
                self.assertIs(checks[identifier].get("heavyweight", False), expected)

    def test_named_frontend_union_covering_the_full_suite_is_heavy(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            leaves = ["src/crypto_graph/index.test.ts", "src/practice/map.test.ts"]
            guard = "src/app/i18n/noEmbeddedUiResources.test.ts"
            for name in [*leaves, guard]:
                path = repo / "frontend" / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("test('fixture', () => {})\n")
            for selected, heavy in ((leaves[:1], False), (leaves[1:], False), (leaves, True)):
                with self.subTest(selected=selected):
                    checks = {item["id"]: item for item in test_plan.plan_paths(
                        [f"frontend/{name}" for name in selected], repo=repo,
                    )["checks"]}
                    check = checks["frontend-tests"]
                    self.assertEqual(check["cwd"], "frontend")
                    self.assertEqual(check["argv"], [
                        "npm", "test", "--", "--maxWorkers=1", "--passWithNoTests=false",
                        *sorted([*selected, guard]),
                    ])
                    self.assertIs(check["heavyweight"], heavy)

    def test_backend_only_changes_do_not_select_ui_resource_guard(self):
        plan = test_plan.plan_paths(["backend/apps/web-server/src/serve.rs"])
        self.assertNotIn("frontend-tests", {item["id"] for item in plan["checks"]})

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
                "frontend-tests",
            },
            set(checks),
        )
        self.assertIn("e2e/home-layout.spec.ts", checks["browser_home-layout"])
        self.assertIn("e2e/learning.spec.ts", checks["browser_learning"])
        self.assertEqual(
            checks["browser_parallel_regressions"],
            [
                "npx", "playwright", "test", "--project=chromium", "--workers=2",
                "e2e/home-layout.spec.ts", "e2e/learning.spec.ts",
                "e2e/visualizers.spec.ts", "--grep",
                "stacks features on phones|loads catalog and deep link|selects Preserve or Strict|renders an accessible continuous comparison|marks retained snapshots|executes an initial comparison|Shared AES presentation",
            ],
        )

    def test_local_browser_ownership_selects_real_endpoint_regression(self):
        for path in ("frontend/playwright.config.ts", "frontend/scripts/playwright-server.mjs"):
            with self.subTest(path=path):
                checks = {item["id"]: item for item in test_plan.plan_paths([path])["checks"]}
                self.assertEqual(checks["browser_local-run"]["argv"], [
                    "npx", "playwright", "test", "--project=chromium", "e2e/local-run.spec.ts",
                ])
                self.assertEqual(checks["frontend-tests"]["argv"][5:], [
                    "src/app/i18n/noEmbeddedUiResources.test.ts",
                ])

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

    def test_demo_test_change_runs_only_that_test_and_shared_guards(self):
        for path in (
            "frontend/demos/AesCipherDemo.language.test.tsx",
            "frontend/demos/aes192OverlayPrototypeData.test.ts",
        ):
            with self.subTest(path=path):
                checks = {item["id"]: item for item in test_plan.plan_paths([path])["checks"]}
                self.assertEqual(set(checks), {"frontend-tests", "frontend_typecheck"})
                self.assertEqual(checks["frontend-tests"]["argv"][5:], [
                    path.removeprefix("frontend/"),
                    "src/app/i18n/noEmbeddedUiResources.test.ts",
                ])

    def test_first_round_helper_selects_both_real_browser_consumers(self):
        checks = {item["id"]: item for item in test_plan.plan_paths([
            "frontend/src/lesson_runtime/fixture/aes192-first-round.ts",
        ])["checks"]}
        self.assertEqual(set(checks), {"browser_overlay", "browser_spn-cipher", "frontend-tests", "frontend_typecheck"})
        for spec in ("overlay", "spn-cipher"):
            self.assertEqual(checks[f"browser_{spec}"]["argv"], [
                "npx", "playwright", "test", "--project=chromium", f"e2e/{spec}.spec.ts",
            ])
        self.assertEqual(checks["frontend-tests"]["argv"][5:], [
            "src/app/i18n/noEmbeddedUiResources.test.ts",
        ])

    def test_narrowed_routes_keep_shared_source_browser_coverage(self):
        for shared in ("frontend/demos/main.tsx", "frontend/src/visualizers/RenderHost.tsx"):
            with self.subTest(shared=shared):
                checks = {item["id"]: item for item in test_plan.plan_paths([
                    "frontend/demos/AesCipherDemo.language.test.tsx",
                    "frontend/src/lesson_runtime/fixture/aes192-first-round.ts",
                    shared,
                ])["checks"]}
                self.assertEqual(checks["demo_browser"]["argv"], [
                    "npx", "playwright", "test", "--project=chromium", "e2e/visualizers.spec.ts",
                ])
                self.assertTrue({"browser_overlay", "browser_spn-cipher", "frontend_typecheck"} <= set(checks))
                self.assertIn("demos/AesCipherDemo.language.test.tsx", checks["frontend-tests"]["argv"])

    def test_first_round_helper_and_changed_consumers_skip_unrelated_units(self):
        checks = {item["id"]: item for item in test_plan.plan_paths([
            "frontend/src/lesson_runtime/fixture/aes192-first-round.ts",
            "frontend/e2e/overlay.spec.ts",
            "frontend/e2e/spn-cipher.spec.ts",
            "frontend/e2e/visualizers.spec.ts",
            "frontend/src/visualizers/index.test.ts",
            "frontend/src/visualizers/overlay.test.tsx",
        ])["checks"]}
        self.assertEqual(checks["frontend-tests"]["argv"][5:], [
            "src/app/i18n/noEmbeddedUiResources.test.ts",
            "src/visualizers/index.test.ts",
            "src/visualizers/overlay.test.tsx",
        ])
        self.assertEqual(set(checks), {
            "browser_overlay", "browser_spn-cipher", "browser_visualizers",
            "browser_parallel_regressions", "frontend-tests", "frontend_typecheck",
        })

    def test_teaching_spn_demo_selects_its_browser_and_runtime_consumers(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            for name in (
                "frontend/e2e/teaching-spn-v2-demo.spec.ts",
                "frontend/src/lesson_runtime/index.test.ts",
                "frontend/src/visualizers/spnCipher.test.tsx",
            ):
                path = repo / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.touch()
            for path in ("frontend/demos/SpnV2Demo.tsx", "frontend/demos/teachingSpnV2Lesson.ts"):
                with self.subTest(path=path):
                    checks = {item["id"]: item for item in test_plan.plan_paths([path], repo=repo)["checks"]}
                    self.assertNotIn("demo_browser", checks)
                    self.assertEqual(checks["browser_teaching-spn-v2-demo"]["argv"], [
                        "npx", "playwright", "test", "--project=chromium", "e2e/teaching-spn-v2-demo.spec.ts",
                    ])
                    self.assertEqual(checks["frontend-tests"]["argv"][5:], [
                        "src/app/i18n/noEmbeddedUiResources.test.ts",
                        "src/lesson_runtime/index.test.ts",
                        "src/visualizers/spnCipher.test.tsx",
                    ])
                    self.assertIn("frontend_typecheck", checks)

    def test_teaching_spn_mapping_keeps_shared_browser_regressions(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            browser = repo / "frontend/e2e/teaching-spn-v2-demo.spec.ts"
            browser.parent.mkdir(parents=True)
            browser.touch()
            for shared in ("frontend/demos/main.tsx", "frontend/src/visualizers/RenderHost.tsx"):
                with self.subTest(shared=shared):
                    checks = {item["id"]: item for item in test_plan.plan_paths([
                        "frontend/demos/teachingSpnV2Lesson.ts", shared,
                    ], repo=repo)["checks"]}
                    self.assertIn("browser_teaching-spn-v2-demo", checks)
                    self.assertIn("demo_browser", checks)

    def test_teaching_spn_demo_without_dedicated_browser_uses_generic_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            for path in ("frontend/demos/SpnV2Demo.tsx", "frontend/demos/teachingSpnV2Lesson.ts"):
                with self.subTest(path=path):
                    checks = {item["id"]: item for item in test_plan.plan_paths([path], repo=Path(directory))["checks"]}
                    self.assertIn("demo_browser", checks)
                    self.assertNotIn("browser_teaching-spn-v2-demo", checks)

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
            {"browser_crypto-graph-worker", "frontend-tests"},
        )
        terminal = test_plan.plan_paths(["frontend/e2e/fixtures/browser_terminal_fixture.py"])
        self.assertEqual(
            {item["id"] for item in terminal["checks"]},
            {"browser_terminal", "frontend-tests"},
        )
        unknown = test_plan.plan_paths(["frontend/e2e/new-helper.ts"])
        self.assertIn("frontend-tests", {item["id"] for item in unknown["checks"]})
        self.assertNotIn("browser_new-helper.ts", {item["id"] for item in unknown["checks"]})
        aes_fixture = test_plan.plan_paths(["frontend/e2e/aes-learning-fixture.tsx"])
        self.assertEqual(
            {item["id"] for item in aes_fixture["checks"]},
            {"browser_aes-cipher-demo", "browser_visualizers", "frontend-tests"},
        )

    def test_identical_visualizer_browser_commands_run_once(self):
        plan = test_plan.plan_paths([
            "frontend/e2e/aes-learning-fixture.tsx",
            "frontend/src/visualizers/index.ts",
        ])
        visualizer_command = [
            "npx", "playwright", "test", "--project=chromium", "e2e/visualizers.spec.ts",
        ]
        visualizer_checks = [item for item in plan["checks"] if item["argv"] == visualizer_command]
        self.assertEqual(len(visualizer_checks), 1)
        self.assertEqual(
            set(visualizer_checks[0]["reasons"]),
            {
                "AES fixture helper has overlay browser consumer",
                "real lesson runtime or visualizer behavior changed",
            },
        )

    def test_visualizer_spec_and_source_share_one_run_with_all_reasons(self):
        plan = test_plan.plan_paths([
            "frontend/e2e/visualizers.spec.ts",
            "frontend/src/visualizers/index.ts",
        ])
        visualizer_checks = [
            item for item in plan["checks"]
            if item["argv"][:4] == ["npx", "playwright", "test", "--project=chromium"]
            and item["argv"][4:] in (["visualizers.spec.ts"], ["e2e/visualizers.spec.ts"])
        ]
        self.assertEqual(len(visualizer_checks), 1)
        self.assertEqual(visualizer_checks[0]["cwd"], "frontend")
        self.assertEqual(set(visualizer_checks[0]["reasons"]), {
            "Vite-compatible browser test changed",
            "real lesson runtime or visualizer behavior changed",
        })
        self.assertIn("browser_parallel_regressions", {item["id"] for item in plan["checks"]})

    def test_merged_real_demo_check_is_not_reported_as_prototype_omission(self):
        plan = test_plan.plan_paths([
            "frontend/demos/UiOptimizationPrototype.tsx",
            "frontend/e2e/visualizers.spec.ts",
            "frontend/src/visualizers/index.ts",
        ])
        self.assertEqual(plan["omissions"], [])

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


class LocalPreviewTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="plan-preview-")
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / "repo with spaces"
        subprocess.run(["git", "clone", "--quiet", "--shared", str(ROOT), str(self.repo)], check=True)

    def change(self, name):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(path.read_text() + "\n" if path.exists() else "preview fixture\n")

    def preview(self, *args, env=None):
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts/test_plan.py"), "local", "--repo", str(self.repo), *args],
            text=True, capture_output=True, check=False, env=env,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout

    def test_explanation_reports_the_existing_plan_without_changing_json(self):
        path = "docs/examples/migration/xor-v1/lesson.yaml"
        self.change(path)
        plan = test_plan.plan_paths([path], repo=self.repo)
        self.assertEqual(json.loads(self.preview()), plan)
        explanation = self.preview("--explain")
        self.assertIn("Working-tree preview (provisional)", explanation)
        self.assertIn("net differences between HEAD and the working tree plus non-ignored untracked paths", explanation)
        self.assertIn("Final handoff create discovers its classified staged scope", explanation)
        self.assertIn(f"  - {path}", explanation)
        self.assertIn("Plan kind: checks", explanation)
        self.assertIn("Selected checks (1):", explanation)
        self.assertIn("  - frontend-tests\n", explanation)
        self.assertIn("cwd: frontend", explanation)
        self.assertIn("command: npm test -- --maxWorkers=1 --passWithNoTests=false src/lesson_runtime/migrationExample.test.ts", explanation)
        self.assertIn("configured env: (none; inherits caller environment)", explanation)
        self.assertIn("migration companion Lesson or locale changed", explanation)
        self.assertNotIn("backend_build", explanation)
        for item in plan["checks"]:
            self.assertIn(f"command: {shlex.join(item['argv'])}", explanation)
            self.assertIn(f"cwd: {shlex.quote(item['cwd'])}", explanation)
            for reason in item["reasons"]:
                self.assertIn(f"      - {reason}", explanation)

    def test_unknown_paths_warn_without_suppressing_conservative_checks(self):
        paths = [
            "unmapped-config.yaml",
            "frontend/src/newmodule/feature.ts",
            "scripts/new-executable.py",
        ]
        for path in paths:
            self.change(path)
        plan = json.loads(self.preview())
        explanation = self.preview("--explain")
        for warning in (
            "unknown root executable path fallback: unmapped-config.yaml",
            "unknown frontend module newmodule; broad fallback",
            "unknown executable path fallback: scripts/new-executable.py",
        ):
            self.assertEqual(explanation.count(f"WARNING: {warning}\n"), 1)
        self.assertTrue({
            "backend_tests", "backend_fmt", "backend_clippy", "backend_build",
            "frontend-tests", "frontend_typecheck", "frontend_build", "tooling",
        } <= {item["id"] for item in plan["checks"]})
        self.assertEqual(plan, test_plan.plan_paths(paths, repo=self.repo))
        for path in paths:
            self.assertIn(f"  - {path}\n", explanation)
        for item in plan["checks"]:
            self.assertIn(f"  - {item['id']}\n", explanation)
            self.assertIn(f"command: {shlex.join(item['argv'])}\n", explanation)
            for reason in item["reasons"]:
                self.assertIn(f"      - {reason}\n", explanation)

    def test_registered_prototype_explains_its_intentional_omission(self):
        self.change("frontend/demos/UiOptimizationPrototype.tsx")
        explanation = self.preview("--explain")
        self.assertIn("Intentional omissions (1):", explanation)
        self.assertIn("  - demo_browser: not-run\n", explanation)
        self.assertIn("registered UI prototype does not change the real demo contract", explanation)
        self.assertNotIn("  - demo_browser\n", explanation)
        self.assertIn("  - frontend-tests\n", explanation)
        self.change("frontend/src/visualizers/index.ts")
        mixed = self.preview("--explain")
        self.assertIn("  - demo_browser\n", mixed)
        self.assertIn("Intentional omissions (0):", mixed)
        self.assertNotIn("  - demo_browser: not-run\n", mixed)

    def test_mixed_explanation_keeps_configured_env_and_merged_browser_reasons(self):
        paths = [
            "frontend/package.json", "frontend/e2e/visualizers.spec.ts",
            "frontend/src/visualizers/index.ts", "docs/examples/operations/xor-constant/lesson.yaml",
        ]
        for path in paths:
            self.change(path)
        plan = test_plan.plan_paths(paths, repo=self.repo)
        self.assertEqual(json.loads(self.preview()), plan)
        explanation = self.preview("--explain")
        self.assertIn("Vite-compatible browser test changed", explanation)
        self.assertIn("real lesson runtime or visualizer behavior changed", explanation)
        self.assertIn("Operation companion Lesson or locale changed", explanation)
        for item in plan["checks"]:
            self.assertEqual(explanation.count(f"  - {item['id']}\n"), 1)
            self.assertIn(f"cwd: {shlex.quote(item['cwd'])}\n", explanation)
            self.assertIn(f"command: {shlex.join(item['argv'])}\n", explanation)
            for key, value in item.get("env", {}).items():
                self.assertIn(f"configured env: {shlex.quote(f'{key}={value}')}\n", explanation)
            for reason in item["reasons"]:
                self.assertIn(f"      - {reason}\n", explanation)
        self.assertIn("configured env: VITE_FEEDBACK_URL=", explanation)
        self.assertNotIn("WARNING:", explanation)

    def test_documentation_only_preview_has_no_checks_or_omissions(self):
        path = "docs/preview with spaces.md"
        self.change(path)
        explanation = self.preview("--explain")
        self.assertIn("Plan kind: docs-only\n", explanation)
        self.assertIn(f"  - '{path}'\n", explanation)
        self.assertIn("Selected checks (0):\n", explanation)
        self.assertIn("Intentional omissions (0):\n", explanation)
        self.assertNotIn("WARNING:", explanation)

    def test_preview_describes_net_head_scope_when_staged_yaml_is_deleted(self):
        staged = "preview-scope.yaml"
        docs = "docs/spec-preview-probe.md"
        self.change(staged)
        subprocess.run(["git", "-C", str(self.repo), "add", "--", staged], check=True)
        (self.repo / staged).unlink()
        self.change(docs)
        staged_paths = subprocess.run(
            ["git", "-C", str(self.repo), "diff", "--cached", "--name-only"],
            text=True, capture_output=True, check=True,
        ).stdout.splitlines()
        self.assertEqual(staged_paths, [staged])
        self.assertIn("backend_build", {
            item["id"] for item in test_plan.plan_paths(staged_paths, repo=self.repo)["checks"]
        })
        self.assertEqual(json.loads(self.preview()), {
            "kind": "docs-only", "paths": [docs], "checks": [], "omissions": [],
        })
        explanation = self.preview("--explain")
        self.assertIn(f"  - {docs}\n", explanation)
        self.assertNotIn(f"  - {staged}\n", explanation)
        self.assertIn("Selected checks (0):\n", explanation)
        self.assertIn("net differences between HEAD and the working tree", explanation)
        self.assertIn("non-ignored untracked paths", explanation)
        self.assertIn("Staged changes canceled in the working tree can be absent from this preview.", explanation)
        self.assertIn("Final handoff create discovers its classified staged scope", explanation)

    def test_preview_preserves_files_index_and_status_without_launching_checks(self):
        staged = "docs/examples/migration/xor-v1/lesson.yaml"
        self.change(staged)
        subprocess.run(["git", "-C", str(self.repo), "add", "--", staged], check=True)
        self.change("Dockerfile")
        untracked = "unmapped-config.yaml"
        self.change(untracked)
        marker = Path(self.temp.name) / "check-launched"
        sentinel = f"#!/bin/sh\nprintf launched >> {shlex.quote(str(marker))}\nexit 97\n"
        bindir = Path(self.temp.name) / "bin"
        bindir.mkdir()
        for program in ("npm", "npx", "cargo", "python3", "fish"):
            executable = bindir / program
            executable.write_text(sentinel)
            executable.chmod(0o755)
        (self.repo / "acceptance/run.sh").write_text(sentinel)
        env = {**os.environ, "PATH": str(bindir) + os.pathsep + os.environ["PATH"]}

        def state():
            status = subprocess.run(
                ["git", "-C", str(self.repo), "status", "--porcelain=v1", "-z"],
                capture_output=True, check=True,
            ).stdout
            files = {
                str(path.relative_to(self.repo)): (hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_mode)
                for path in self.repo.rglob("*") if path.is_file() and ".git" not in path.relative_to(self.repo).parts
            }
            return status, (self.repo / ".git/index").read_bytes(), files

        before = state()
        plan = json.loads(self.preview(env=env))
        explanation = self.preview("--explain", env=env)
        self.assertEqual(state(), before)
        self.assertFalse(marker.exists(), "preview launched a selected check")
        self.assertEqual(set(plan["paths"]), {staged, "Dockerfile", untracked, "acceptance/run.sh"})
        for path in plan["paths"]:
            self.assertIn(f"  - {shlex.quote(path)}\n", explanation)
        self.assertIn("Read-only: no checks run; no acceptance evidence recorded.", explanation)


if __name__ == "__main__":
    unittest.main()
