"""Public contract checks for web-image release automation."""

from __future__ import annotations

from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]


class ReleaseWorkflowContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (REPO_ROOT / ".github" / "workflows" / "release-web-image.yml").read_text(
            encoding="utf-8"
        )
        cls.acceptance_harness = (REPO_ROOT / "acceptance" / "run.sh").read_text(
            encoding="utf-8"
        )

    def test_release_workflow_validates_web_version_tags_before_publication(self):
        workflow = self.workflow
        self.assertIn("web-v*", workflow)
        self.assertIn('^web-v[0-9]+\\.[0-9]+\\.[0-9]+$', workflow)
        self.assertIn("./acceptance/run.sh", workflow)
        self.assertIn("--mode release", workflow)
        self.assertLess(workflow.index("Invalid release tag"), workflow.index("Publish candidate"))

    def test_release_workflow_uses_all_supported_browser_engines(self):
        workflow = self.workflow
        self.assertIn("chromium firefox webkit", workflow)
        self.assertIn("linux/amd64", workflow)
        self.assertIn("docker/login-action", workflow)
        self.assertIn("Compatibility:", workflow)
        self.assertIn("Verify anonymous public image pull", workflow)
        self.assertIn("docker logout ghcr.io", workflow)
        self.assertIn("Run three-browser acceptance against the local candidate", workflow)
        self.assertIn('docker image rm "$IMAGE"', workflow)
        self.assertIn("--metadata-file candidate-metadata.json", workflow)
        self.assertIn('candidate-manifest-digest.txt)" = "$digest"', workflow)
        self.assertIn("candidate-metadata.json", workflow)
        self.assertLess(
            workflow.index("Run three-browser acceptance against the local candidate"),
            workflow.index('docker push "$IMAGE"'),
        )
        self.assertIn(
            'record_browser_result "$browser" failed',
            self.acceptance_harness,
        )
        self.assertIn(
            "npx playwright test --project=$1",
            self.acceptance_harness,
        )
        self.assertNotRegex(workflow, r"(?:tag|IMAGE).*:latest")


if __name__ == "__main__":
    unittest.main()
