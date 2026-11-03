"""Unit tests for MKP-005 aggregate-only restore comparator (no database access)."""
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location(
    "restore_check", Path(__file__).with_name("verify_staging_restore.py")
)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)

def sample():
    return {
        "organizations": 1, "stores": 2, "products": 5, "sales": 3,
        "sale_items": 4, "customers": 2, "customer_credits": 1,
        "sales_total": "125.00", "stock_total": "17",
        "credit_total": "15.50", "latest_sale_at": "2026-11-03 09:00:00+00",
    }

class RestoreCheckTests(unittest.TestCase):
    def test_exact_match(self):
        self.assertEqual(m.compare(sample(), sample()), [])

    def test_detect_missing_sale(self):
        restored = sample()
        restored["sales"] = 2
        self.assertIn("sales:", m.compare(sample(), restored)[0])

    def test_decimal_normalization(self):
        restored = sample()
        restored["sales_total"] = "125.0"
        self.assertEqual(m.compare(sample(), restored), [])

    def test_detect_mismatched_credit(self):
        restored = sample()
        restored["credit_total"] = "16.00"
        self.assertEqual(len(m.compare(sample(), restored)), 1)

    def test_missing_metric_is_error(self):
        restored = sample()
        restored.pop("stores")
        with self.assertRaises(ValueError):
            m.compare(sample(), restored)

    def test_disallow_negative_counts(self):
        restored = sample()
        restored["sales"] = -1
        with self.assertRaises(ValueError):
            m.validate(restored)

    def test_no_nan_amounts(self):
        restored = sample()
        restored["sales_total"] = "NaN"
        with self.assertRaises(ValueError):
            m.validate(restored)

    def test_reject_bool_count(self):
        restored = sample()
        restored["sales"] = True
        with self.assertRaises(ValueError):
            m.validate(restored)

if __name__ == "__main__":
    unittest.main()
