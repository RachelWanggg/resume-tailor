"""Regression tests for the bullet-ranking scorer.

These run against `tests/fixtures/sample_bank.yaml`, not against anyone's real profile, so the
suite passes on a fresh clone with no `profile/` directory. That is deliberate: a test that
depends on private data cannot be run by a contributor.
"""

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools/make_tailored_resume.py"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "sample_bank.yaml"

SPEC = importlib.util.spec_from_file_location("bullet_bank_tool", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def search(jd, role="", limit=5):
    return MODULE.search_bank(jd, role=role, limit=limit, bank_path=FIXTURE)


class BulletBankTests(unittest.TestCase):
    def test_fixture_bank_is_valid(self):
        bank = MODULE.load_bank(FIXTURE)
        self.assertEqual(MODULE.validate_bank(bank), [])
        self.assertGreaterEqual(len(bank["bullets"]), 6)

    def test_shipped_example_bank_is_valid(self):
        """profile.example/ must always validate — it is what new users copy."""
        bank = MODULE.load_bank(ROOT / "profile.example" / "master_resume.yaml")
        self.assertEqual(MODULE.validate_bank(bank), [])

    def test_ai_evaluation_jd_ranks_eval_bullet_first(self):
        jd = """
        Build LLM evaluation systems with human-labeled golden sets. Measure grounding,
        factual accuracy, and unsupported claims for reliable production AI releases.
        """
        result = search(jd, role="Applied AI Engineer", limit=3)
        self.assertEqual(result["role_family"], "ai_ml")
        self.assertEqual(result["candidates"][0]["id"], "fx_llm_evaluation")

    def test_backend_cache_jd_finds_latency_bullet(self):
        jd = """
        Build backend APIs with PostgreSQL and Redis. Implement cache-aside invalidation,
        preserve read-after-write consistency, and reduce API latency.
        """
        result = search(jd, role="Backend Software Engineer", limit=5)
        ids = [c["id"] for c in result["candidates"]]
        self.assertIn("fx_cache_latency", ids)

    def test_role_family_blocks_irrelevant_family_bonus(self):
        jd = "Develop Salesforce customizations with Apex and Lightning Components."
        result = search(jd, role="Salesforce Developer", limit=5)
        self.assertEqual(result["role_family"], "other")
        self.assertFalse(any(c["match"]["role_family"] for c in result["candidates"]))

    def test_missing_bank_gives_actionable_error(self):
        """A fresh clone has no profile/. The error must say how to create one."""
        with self.assertRaises(SystemExit) as ctx:
            MODULE.load_bank(ROOT / "profile" / "does_not_exist.yaml")
        self.assertIn("cp -r profile.example profile", str(ctx.exception))

    def test_locked_metric_must_appear_in_text(self):
        """The validator's core guarantee: a locked metric cannot drift from its bullet."""
        bank = MODULE.load_bank(FIXTURE)
        bank["bullets"][0]["locked_metrics"] = ["999 widgets"]
        errors = MODULE.validate_bank(bank)
        self.assertTrue(any("999 widgets" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
