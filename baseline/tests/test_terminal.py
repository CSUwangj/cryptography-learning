"""Terminal connection path and known-defect registry."""

from __future__ import annotations

import importlib.util
import sys
import unittest

from helpers import (
    KNOWN_DEFECTS,
    REPO_ROOT,
    graphql,
    wait_until_ready,
    ws_connect,
    ws_read_frame,
    ws_send_frame,
)

REQUIRED_DEFECT_IDS = (
    "duplicate-local-echo",
    "duplicate-server-output",
    "paste",
    "resize",
    "lifecycle",
)

LAB_WS_QUERY = """
query Lab($categoryId: String!, $labId: String!) {
  lab(categoryId: $categoryId, labId: $labId) {
    wsEndpoints { host port }
  }
}
"""


def _load_fixture_module():
    path = REPO_ROOT / "baseline" / "terminal" / "fixture.py"
    spec = importlib.util.spec_from_file_location("baseline_terminal_fixture", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class KnownDefectRegistryTest(unittest.TestCase):
    def test_registry_documents_required_defect_categories(self):
        text = KNOWN_DEFECTS.read_text(encoding="utf-8")
        for defect_id in REQUIRED_DEFECT_IDS:
            with self.subTest(defect_id=defect_id):
                self.assertIn(f"`{defect_id}`", text)

    def test_registry_does_not_present_defects_as_desired_behavior(self):
        text = KNOWN_DEFECTS.read_text(encoding="utf-8")
        self.assertIn("Desired after modernization", text)
        self.assertIn("does **not** assert the defective", text)
        self.assertIn("as acceptance requirements", text)


class TerminalConnectionPathTest(unittest.TestCase):
    """Prove GraphQL advertises the Challenge WS path and the fixture speaks it."""

    @classmethod
    def setUpClass(cls):
        wait_until_ready()
        fixture_mod = _load_fixture_module()
        try:
            cls.fixture = fixture_mod.TerminalFixture(host="127.0.0.1", port=19020).start()
        except OSError as exc:
            raise unittest.SkipTest(str(exc)) from exc

    @classmethod
    def tearDownClass(cls):
        cls.fixture.stop()

    def test_practice_lab_advertises_fixture_ws_endpoint(self):
        body = graphql(
            LAB_WS_QUERY,
            {"categoryId": "classical", "labId": "affine"},
        )
        endpoints = body["data"]["lab"]["wsEndpoints"]
        self.assertEqual(endpoints, [{"host": "127.0.0.1", "port": 19020}])

    def test_fixture_banner_and_echo_are_exactly_once(self):
        sock, pending = ws_connect("127.0.0.1", self.fixture.port)
        try:
            opcode, banner = ws_read_frame(sock, pending)
            self.assertEqual(opcode, 0x1)
            self.assertEqual(banner, self.fixture.banner)

            ws_send_frame(sock, b"ping-once")
            opcode, echoed = ws_read_frame(sock, pending)
            self.assertEqual(opcode, 0x1)
            self.assertEqual(echoed, b"ping-once")

            # No second spontaneous frame should arrive; a short timeout proves that.
            sock.settimeout(0.3)
            with self.assertRaises(OSError):
                ws_read_frame(sock, pending)
        finally:
            sock.close()


if __name__ == "__main__":
    unittest.main()
