import csv
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import roofsignal_pricing_engine as pricing  # noqa: E402


class PricingEngineTest(unittest.TestCase):
    def test_price_formula_matches_v1_examples(self) -> None:
        self.assertEqual(pricing.price_from_weighted_score(2.0), 500)
        self.assertEqual(pricing.price_from_weighted_score(3.0), 750)
        self.assertEqual(pricing.price_from_weighted_score(4.0), 1000)
        self.assertEqual(pricing.price_from_weighted_score(5.0), 1250)

    def test_minimum_quote_keeps_small_objects_viable(self) -> None:
        self.assertEqual(pricing.price_from_weighted_score(1.0), 500)

    def test_validation_examples_cover_expected_building_types(self) -> None:
        with (ROOT / "data" / "pricing" / "roofsignal_pricing_examples.csv").open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        names = {row["object_name"] for row in rows}
        self.assertEqual(
            names,
            {
                "Detached house",
                "Small VvE",
                "Large VvE",
                "School",
                "Logistics centre",
                "Agricultural property",
                "Solar park",
            },
        )

    def test_solar_park_hits_upper_bound(self) -> None:
        with (ROOT / "data" / "pricing" / "roofsignal_pricing_examples.csv").open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        solar_park = next(row for row in rows if row["object_name"] == "Solar park")
        result = pricing.calculate(solar_park)
        self.assertEqual(result.weighted_score, 5.0)
        self.assertEqual(result.suggested_quotation, 1250)


if __name__ == "__main__":
    unittest.main()
