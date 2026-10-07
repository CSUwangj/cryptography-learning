"""Public contract checks for web-image release automation."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]
RELEASE_NOTES = REPO_ROOT / "scripts" / "release_notes.py"
PUBLISH_RELEASE_NOTES = REPO_ROOT / "scripts" / "publish_release_notes.sh"


class ReleaseWorkflowContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (REPO_ROOT / ".github" / "workflows" / "release-web-image.yml").read_text(
            encoding="utf-8"
        )
        cls.release_notes = RELEASE_NOTES.read_text(encoding="utf-8")
        cls.publish_release_notes = PUBLISH_RELEASE_NOTES.read_text(encoding="utf-8")
        cls.acceptance_harness = (REPO_ROOT / "acceptance" / "run.sh").read_text(
            encoding="utf-8"
        )

    def test_release_workflow_validates_web_version_tags_before_publication(self):
        workflow = self.workflow
        self.assertIn("web-v*", workflow)
        self.assertIn('^web-v[0-9]+\\.[0-9]+\\.[0-9]+$', workflow)
        self.assertIn("./acceptance/run.sh", workflow)
        self.assertIn("--mode release", workflow)
        self.assertLess(
            workflow.index("Invalid release tag"),
            workflow.index("Publish the tested candidate manifest"),
        )
        self.assertIn("scripts/release_notes.py validate", workflow)
        self.assertLess(
            workflow.index("Validate changelog release notes before publication"),
            workflow.index("Build one immutable Linux AMD64 candidate manifest"),
        )

    def test_release_workflow_uses_all_supported_browser_engines(self):
        workflow = self.workflow
        self.assertIn("chromium firefox webkit", workflow)
        self.assertIn("linux/amd64", workflow)
        self.assertIn("docker/login-action", workflow)
        self.assertIn("Compatibility:", self.release_notes)
        self.assertIn("Verify anonymous public image pull", workflow)
        self.assertIn("docker logout ghcr.io", workflow)
        self.assertIn("Run three-browser acceptance against the immutable candidate", workflow)
        self.assertIn('push-by-digest=true', workflow)
        self.assertIn('name-canonical=true', workflow)
        self.assertIn('imagetools create --prefer-index=false --tag "$IMAGE" "$CANDIDATE_IMAGE"', workflow)
        self.assertIn("--metadata-file candidate-metadata.json", workflow)
        self.assertIn('candidate-manifest-digest.txt)" = "$digest"', workflow)
        self.assertIn("candidate-metadata.json", workflow)
        self.assertLess(
            workflow.index("Run three-browser acceptance against the immutable candidate"),
            workflow.index('imagetools create --prefer-index=false --tag "$IMAGE" "$CANDIDATE_IMAGE"'),
        )
        self.assertIn(
            'record_browser_result "$browser" failed',
            self.acceptance_harness,
        )
        self.assertIn(
            "npx playwright test --project=$1",
            self.acceptance_harness,
        )
        self.assertIn('imagetools inspect "$IMAGE" --raw', workflow)
        self.assertNotIn("imagetools inspect \"$IMAGE\" --format '{{.Digest}}'", workflow)
        self.assertNotRegex(workflow, r"(?:tag|IMAGE).*:latest")

    def test_release_record_is_idempotent_for_retried_tags(self):
        self.assertIn("./scripts/publish_release_notes.sh", self.workflow)
        self.assertNotIn("actions/download-artifact", self.workflow)
        self.assertIn("browser-results.txt", self.workflow)
        self.assertIn('gh release view "$GITHUB_REF_NAME"', self.publish_release_notes)
        self.assertIn('gh release edit "$GITHUB_REF_NAME"', self.publish_release_notes)


class ReleaseNotesTest(unittest.TestCase):
    changelog = textwrap.dedent(
        """\
        # Changelog

        ## Unreleased

        Future work.

        ## 1.2.30 — 2026-10-01

        Similar version.

        ## 1.2.3 — 2026-09-30

        Human-written release notes.

        ### Verification

        Manual verification survives.

        ## 1.2.2 — 2026-09-29

        Older version.
        """
    )

    def run_notes(self, *args: str, changelog: Path):
        return subprocess.run(
            ["python3", str(RELEASE_NOTES), *args, "--changelog", str(changelog)],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_render_selects_exact_version_and_preserves_human_notes(self):
        with tempfile.TemporaryDirectory() as directory:
            changelog = Path(directory) / "CHANGELOG.md"
            changelog.write_text(self.changelog, encoding="utf-8")
            result = self.run_notes(
                "render",
                "1.2.3",
                "abc123",
                "ghcr.io/example/web:1.2.3@sha256:digest",
                changelog=changelog,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("## 1.2.3 — 2026-09-30", result.stdout)
        self.assertIn("### Verification", result.stdout)
        self.assertIn("Manual verification survives.", result.stdout)
        self.assertNotIn("1.2.30", result.stdout)
        self.assertNotIn("Unreleased", result.stdout)
        self.assertNotIn("Older version.", result.stdout)
        self.assertIn("Source commit: abc123", result.stdout)
        self.assertIn("ghcr.io/example/web:1.2.3@sha256:digest", result.stdout)
        self.assertIn("Application Manifest schema: 1", result.stdout)
        self.assertIn("linux/amd64", result.stdout)
        self.assertIn("Rollback requires an image that also supports schema version 1", result.stdout)
        self.assertIn("/blob/abc123/docs/deployment.md", result.stdout)
        for browser_record in (
            "Browser acceptance:",
            "browser-results.txt",
            "npx playwright",
            "chromium",
            "firefox",
            "webkit",
            "running=",
            "passed=",
            "failed=",
        ):
            self.assertNotIn(browser_record, result.stdout)

    def test_invalid_changelog_entries_fail_before_publication(self):
        cases = {
            "missing file": (Path("missing.md"), "cannot read"),
            "missing version": ("# Changelog\n\n## 1.2.2 — 2026-09-29\n\nNotes.\n", "missing release notes"),
            "duplicate version": (
                "## 1.2.3 — 2026-09-30\n\nFirst.\n\n## 1.2.3 — 2026-09-29\n\nSecond.\n",
                "duplicate release notes",
            ),
            "empty version": ("## 1.2.3 — 2026-09-30\n\n   \n", "release notes for version 1.2.3 are empty"),
        }
        with tempfile.TemporaryDirectory() as directory:
            for name, (content, diagnostic) in cases.items():
                changelog = Path(directory) / f"{name}.md"
                if isinstance(content, str):
                    changelog.write_text(content, encoding="utf-8")
                else:
                    changelog = Path(directory) / "missing.md"
                result = self.run_notes("validate", "1.2.3", changelog=changelog)
                self.assertNotEqual(result.returncode, 0, name)
                self.assertIn(diagnostic, result.stderr, name)

    def test_create_and_edit_replace_release_notes(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            (workspace / "CHANGELOG.md").write_text(self.changelog, encoding="utf-8")
            bin_dir = workspace / "bin"
            bin_dir.mkdir()
            gh = bin_dir / "gh"
            gh.write_text(
                "#!/usr/bin/env bash\n"
                "if [[ \"$1 $2\" == 'release view' ]]; then exit \"${GH_RELEASE_EXISTS:-1}\"; fi\n"
                "printf '%s\\n' \"$*\" >> \"$GH_LOG\"\n"
                "cat \"${!#}\" > \"$GH_BODY\"\n",
                encoding="utf-8",
            )
            gh.chmod(0o755)
            for exists, command in (("0", "edit"), ("1", "create")):
                log = workspace / f"{command}.log"
                body = workspace / f"{command}.md"
                environment = {
                    **os.environ,
                    "PATH": f"{bin_dir}:{os.environ['PATH']}",
                    "GH_LOG": str(log),
                    "GH_BODY": str(body),
                    "GH_RELEASE_EXISTS": exists,
                    "GITHUB_REF_NAME": "web-v1.2.3",
                    "GITHUB_SHA": "abc123",
                    "PUBLISHED_IMAGE": "ghcr.io/example/web:1.2.3@sha256:digest",
                }
                result = subprocess.run(
                    ["bash", str(PUBLISH_RELEASE_NOTES)],
                    cwd=workspace,
                    env=environment,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(
                    log.read_text(encoding="utf-8").strip(),
                    f"release {command} web-v1.2.3 --title Web image web-v1.2.3 --notes-file release-notes.md",
                )
                notes = (workspace / "release-notes.md").read_text(encoding="utf-8")
                self.assertIn("Human-written release notes.", notes)
                self.assertNotIn("Browser acceptance:", notes)
                self.assertEqual(body.read_text(encoding="utf-8"), notes)


if __name__ == "__main__":
    unittest.main()
