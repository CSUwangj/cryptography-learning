"""GraphQL characterization: catalog order, Lab content, RON-backed fixtures."""

from __future__ import annotations

import unittest

from helpers import graphql, load_fixture, wait_until_ready

PRACTICE_QUERY = """
query Practices {
  practice {
    labCategories {
      id
      name { lang text }
      labs {
        id
        wsEndpoints { host port }
        tcpEndpoints { host port }
        resources { lang name }
      }
    }
  }
}
"""

LAB_QUERY = """
query Lab($categoryId: String!, $labId: String!, $language: String) {
  lab(categoryId: $categoryId, labId: $labId, language: $language) {
    lang
    name
    content
    wsEndpoints { host port }
    tcpEndpoints { host port }
  }
}
"""


class GraphqlBaselineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        wait_until_ready()

    def test_hello_matches_stable_fixture(self):
        body = graphql("{ hello }")
        self.assertEqual(body, load_fixture("hello.json"))

    def test_practice_catalog_order_and_content_match_fixture(self):
        body = graphql(PRACTICE_QUERY)
        self.assertEqual(body, load_fixture("practice.json"))
        categories = body["data"]["practice"]["labCategories"]
        self.assertEqual([c["id"] for c in categories], ["classical", "modern"])
        self.assertEqual(
            [lab["id"] for lab in categories[0]["labs"]],
            ["affine", "caesar"],
        )

    def test_lab_description_loaded_from_generated_ron_paths(self):
        zh = graphql(
            LAB_QUERY,
            {"categoryId": "classical", "labId": "affine", "language": "zh-CN"},
        )
        self.assertEqual(zh, load_fixture("lab_affine_zh.json"))
        self.assertIn("baseline-affine-zh", zh["data"]["lab"]["content"])

        en = graphql(
            LAB_QUERY,
            {"categoryId": "classical", "labId": "affine", "language": "en-US"},
        )
        self.assertEqual(en, load_fixture("lab_affine_en.json"))

    def test_lab_defaults_to_first_resource_when_language_omitted(self):
        body = graphql(
            LAB_QUERY,
            {"categoryId": "classical", "labId": "affine"},
        )
        self.assertEqual(body["data"]["lab"]["lang"], "zh-CN")
        self.assertEqual(body["data"]["lab"]["name"], "仿射加密")

    def test_missing_lab_returns_graphql_error(self):
        body = graphql(
            LAB_QUERY,
            {"categoryId": "classical", "labId": "missing", "language": "zh-CN"},
            allow_errors=True,
        )
        self.assertIn("errors", body)
        data = body.get("data")
        if data is None:
            return
        self.assertIsNone(data.get("lab"))


if __name__ == "__main__":
    unittest.main()
