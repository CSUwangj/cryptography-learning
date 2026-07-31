"""HTTP characterization: root SPA, nested-route fallback, static assets."""

from __future__ import annotations

import re
import unittest

from helpers import http_get, wait_until_ready


class HttpSpaBaselineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        wait_until_ready()

    def test_root_spa_serves_html_shell(self):
        status, headers, body = http_get("/")
        self.assertEqual(status, 200)
        text = body.decode("utf-8", errors="replace")
        self.assertRegex(text, r"(?i)<!doctype html>")
        self.assertIn('id="root"', text)
        self.assertIn("Crypto Learn", text)
        content_type = headers.get("content-type", "")
        self.assertIn("text/html", content_type)

    def test_nested_practice_route_falls_back_to_spa_shell(self):
        status, headers, body = http_get("/practice/classical/affine")
        self.assertEqual(status, 200)
        text = body.decode("utf-8", errors="replace")
        self.assertRegex(text, r"(?i)<!doctype html>")
        self.assertIn('id="root"', text)
        self.assertIn("text/html", headers.get("content-type", ""))

    def test_deep_unknown_route_falls_back_to_spa_shell(self):
        status, _, body = http_get("/does/not/exist/nested")
        self.assertEqual(status, 200)
        self.assertRegex(
            body.decode("utf-8", errors="replace"),
            r"(?i)<!doctype html>",
        )

    def test_static_public_assets_are_served(self):
        for path in ("/manifest.json", "/favicon.ico", "/robots.txt", "/logo192.png"):
            with self.subTest(path=path):
                status, _, body = http_get(path)
                self.assertEqual(status, 200, path)
                self.assertTrue(body, path)

    def test_bundled_static_js_referenced_by_index_is_served(self):
        _, _, index = http_get("/")
        text = index.decode("utf-8", errors="replace")
        match = re.search(r'src="(/assets/[^"]+\.js)"', text)
        self.assertIsNotNone(match, "expected Vite bundle script in index.html")
        status, headers, body = http_get(match.group(1))
        self.assertEqual(status, 200)
        self.assertTrue(body)
        content_type = headers.get("content-type", "")
        self.assertTrue(
            "javascript" in content_type or match.group(1).endswith(".js")
        )

    def test_content_img_symlink_is_served_from_static_tree(self):
        status, _, body = http_get("/img/baseline.png")
        self.assertEqual(status, 200)
        self.assertTrue(body.startswith(b"\x89PNG\r\n\x1a\n"))


if __name__ == "__main__":
    unittest.main()
