#!/usr/bin/env python3
"""RoofSignal Pricing Engine v1.

Converts object characteristics into a consistent inspection quotation. The
model prices expertise, analysis and reporting effort; not flight time or photo
count.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "pricing" / "roofsignal_pricing_examples.csv"
DEFAULT_REPORT = ROOT / "results" / "pricing" / "latest_roofsignal_pricing.md"
DEFAULT_JSON = ROOT / "results" / "pricing" / "latest_roofsignal_pricing.json"
DEFAULT_CSV = ROOT / "results" / "pricing" / "latest_roofsignal_pricing.csv"

BASE_RATE = 250
PRICE_MULTIPLIER = 1
MINIMUM_QUOTATION = 500
ROUNDING_UNIT = 50

WEIGHTS = {
    "complexity": 0.40,
    "accessibility": 0.20,
    "scope": 0.40,
}

CSV_FIELDS = [
    "object_name",
    "client_type",
    "building_type",
    "city",
    "region_type",
    "building_size_m2",
    "roof_area_m2",
    "facade_area_m2",
    "building_height_m",
    "roof_planes",
    "technical_details",
    "roof_structures",
    "separate_buildings",
    "solar_installation",
    "accessibility_notes",
    "inspection_scope",
    "thermography",
    "mjop_indication",
    "maintenance_prioritisation",
    "cost_estimation",
    "portfolio_comparison",
    "assumptions",
]


@dataclass
class DimensionScore:
    score: int
    explanation: str
    signals: list[str] = field(default_factory=list)


@dataclass
class PricingResult:
    object_name: str
    client_type: str
    complexity: DimensionScore
    accessibility: DimensionScore
    scope: DimensionScore
    weighted_score: float
    suggested_quotation: int
    confidence: str
    assumptions: list[str]


def norm(value: object) -> str:
    return str(value or "").strip()


def lower(value: object) -> str:
    return norm(value).lower()


def parse_int(value: object) -> int | None:
    text = norm(value)
    if not text:
        return None
    try:
        return int(float(text.replace(",", ".")))
    except ValueError:
        return None


def truthy(value: object) -> bool:
    return lower(value) in {"1", "yes", "ja", "true", "y", "j", "x"}


def clamp_score(value: int) -> int:
    return max(1, min(5, value))


def round_to_nearest(value: float, unit: int) -> int:
    return int(math.floor((value + unit / 2) / unit) * unit)


def score_complexity(row: dict[str, str]) -> DimensionScore:
    score = 1
    signals: list[str] = []

    building_type = lower(row.get("building_type"))
    if any(keyword in building_type for keyword in ["vrijstaand", "detached", "woning"]):
        score = max(score, 1)
        signals.append("detached-house scale")
    if any(keyword in building_type for keyword in ["kleine vve", "small apartment", "klein appartement"]):
        score = max(score, 2)
        signals.append("small apartment/VvE scale")
    if any(keyword in building_type for keyword in ["school", "kantoor", "commercial", "bedrijfspand", "agrarisch"]):
        score = max(score, 3)
        signals.append("managed commercial or institutional object")
    if any(keyword in building_type for keyword in ["grote vve", "large apartment", "complex"]):
        score = max(score, 4)
        signals.append("large apartment complex")
    if any(keyword in building_type for keyword in ["logistiek", "logistics", "industrie", "solar park", "zonnepark"]):
        score = max(score, 5)
        signals.append("industrial, logistics or solar-site scale")

    building_size = parse_int(row.get("building_size_m2"))
    roof_area = parse_int(row.get("roof_area_m2"))
    facade_area = parse_int(row.get("facade_area_m2"))
    height = parse_int(row.get("building_height_m"))
    roof_planes = parse_int(row.get("roof_planes")) or 0
    details = parse_int(row.get("technical_details")) or 0
    structures = parse_int(row.get("roof_structures")) or 0
    buildings = parse_int(row.get("separate_buildings")) or 1

    if building_size:
        if building_size >= 12000:
            score = max(score, 5)
            signals.append(f"large gross size: {building_size} m2")
        elif building_size >= 5000:
            score = max(score, 4)
            signals.append(f"substantial gross size: {building_size} m2")
        elif building_size >= 1500:
            score = max(score, 3)
            signals.append(f"medium gross size: {building_size} m2")
        elif building_size >= 400:
            score = max(score, 2)
            signals.append(f"small multi-unit size: {building_size} m2")

    if roof_area:
        if roof_area >= 8000:
            score = max(score, 5)
            signals.append(f"very large roof area: {roof_area} m2")
        elif roof_area >= 2500:
            score = max(score, 4)
            signals.append(f"large roof area: {roof_area} m2")
        elif roof_area >= 800:
            score = max(score, 3)
            signals.append(f"medium roof area: {roof_area} m2")
        elif roof_area >= 250:
            score = max(score, 2)
            signals.append(f"small managed roof area: {roof_area} m2")

    if facade_area and facade_area >= 2500:
        score = max(score, 4)
        signals.append(f"large facade area: {facade_area} m2")
    elif facade_area and facade_area >= 800:
        score = max(score, 3)
        signals.append(f"facade review adds effort: {facade_area} m2")

    if height and height >= 18:
        score = max(score, 4)
        signals.append(f"height requires more planning: {height} m")
    elif height and height >= 10:
        score = max(score, 3)
        signals.append(f"moderate height: {height} m")

    if roof_planes >= 8 or details >= 16 or structures >= 8 or buildings >= 4:
        score = max(score, 5)
        signals.append("many roof planes, details, structures or buildings")
    elif roof_planes >= 5 or details >= 8 or structures >= 4 or buildings >= 2:
        score = max(score, 4)
        signals.append("multiple roof planes, details, structures or buildings")
    elif roof_planes >= 3 or details >= 4 or structures >= 2:
        score = max(score, 3)
        signals.append("several details or roof elements")

    if truthy(row.get("solar_installation")):
        score = max(score, 3)
        signals.append("solar installation adds reporting complexity")

    if not signals:
        signals.append("limited object data; defaulting to low complexity")

    return DimensionScore(
        score=clamp_score(score),
        explanation=f"Complexity is scored {clamp_score(score)}/5 based on object scale, roof/facade effort and technical details.",
        signals=signals,
    )


def score_accessibility(row: dict[str, str]) -> DimensionScore:
    score = 1
    signals: list[str] = []
    region = lower(row.get("region_type"))
    city = lower(row.get("city"))
    notes = lower(row.get("accessibility_notes"))
    buildings = parse_int(row.get("separate_buildings")) or 1

    if "apeldoorn" in region or city == "apeldoorn":
        score = max(score, 1)
        signals.append("local Apeldoorn object")
    elif any(keyword in region for keyword in ["stedendriehoek", "deventer", "zutphen", "veluwe"]):
        score = max(score, 2)
        signals.append("Stedendriehoek/Veluwe travel distance")
    elif "randstad" in region:
        score = max(score, 3)
        signals.append("Randstad travel and urban planning")
    elif any(keyword in region for keyword in ["remote", "landelijk", "rural", "buitengebied"]):
        score = max(score, 4)
        signals.append("remote or rural access")
    elif any(keyword in region for keyword in ["eiland", "island", "restricted", "beperkt"]):
        score = max(score, 5)
        signals.append("island or restricted area")

    if any(keyword in notes for keyword in ["centrum", "urban", "dense", "druk", "parkeer"]):
        score = max(score, min(5, score + 1))
        signals.append("parking or dense urban setting")
    if any(keyword in notes for keyword in ["permission", "toestemming", "vergunning", "restrictie", "no-fly"]):
        score = max(score, 4)
        signals.append("permissions or flight restriction expected")
    if any(keyword in notes for keyword in ["eiland", "island", "haven", "airspace", "luchtruim"]):
        score = max(score, 5)
        signals.append("special access or airspace constraint")
    if buildings >= 2:
        score = max(score, min(5, score + 1))
        signals.append(f"multiple locations/buildings: {buildings}")

    if not signals:
        signals.append("no access complication captured")

    return DimensionScore(
        score=clamp_score(score),
        explanation=f"Accessibility is scored {clamp_score(score)}/5 based on travel, site access and permission complexity.",
        signals=signals,
    )


def score_scope(row: dict[str, str]) -> DimensionScore:
    scope = lower(row.get("inspection_scope"))
    signals: list[str] = []
    score = 1

    if any(keyword in scope for keyword in ["roof only", "dak alleen", "dak"]):
        score = max(score, 1)
        signals.append("roof inspection")
    if any(keyword in scope for keyword in ["gutter", "goot", "goten"]):
        score = max(score, 2)
        signals.append("gutters included")
    if any(keyword in scope for keyword in ["facade", "gevel", "schil", "envelope"]):
        score = max(score, 3)
        signals.append("building envelope included")
    if any(keyword in scope for keyword in ["report", "rapport", "gebouwenvelop", "building envelope"]):
        score = max(score, 4)
        signals.append("structured reporting required")
    if any(keyword in scope for keyword in ["full", "intelligence", "planning", "portfolio", "volledig"]):
        score = max(score, 5)
        signals.append("full intelligence/planning scope")

    if truthy(row.get("thermography")):
        score = max(score, 5)
        signals.append("thermography included")
    if truthy(row.get("mjop_indication")):
        score = max(score, 4)
        signals.append("MJOP indication included")
    if truthy(row.get("maintenance_prioritisation")):
        score = max(score, 4)
        signals.append("maintenance prioritisation included")
    if truthy(row.get("cost_estimation")):
        score = max(score, 5)
        signals.append("cost estimation included")
    if truthy(row.get("portfolio_comparison")):
        score = max(score, 5)
        signals.append("portfolio comparison included")
    if truthy(row.get("solar_installation")) and "solar" in scope:
        score = max(score, 4)
        signals.append("solar installation reporting included")

    if not signals:
        signals.append("scope not fully specified; assuming roof-only inspection")

    return DimensionScore(
        score=clamp_score(score),
        explanation=f"Scope is scored {clamp_score(score)}/5 based on inspection depth and reporting/intelligence deliverables.",
        signals=signals,
    )


def confidence(row: dict[str, str], assumptions: list[str]) -> str:
    known_fields = [
        "building_type",
        "city",
        "region_type",
        "roof_area_m2",
        "building_size_m2",
        "building_height_m",
        "roof_planes",
        "technical_details",
        "separate_buildings",
        "inspection_scope",
    ]
    known_count = sum(1 for field_name in known_fields if norm(row.get(field_name)))
    if len(assumptions) >= 4 or known_count <= 4:
        return "Low"
    if len(assumptions) >= 2 or known_count <= 7:
        return "Medium"
    return "High"


def collect_assumptions(row: dict[str, str]) -> list[str]:
    assumptions = [part.strip() for part in norm(row.get("assumptions")).split("|") if part.strip()]
    if not norm(row.get("roof_area_m2")) and not norm(row.get("building_size_m2")):
        assumptions.append("Object size or roof area not supplied; score relies on building type.")
    if not norm(row.get("inspection_scope")):
        assumptions.append("Inspection scope not supplied; roof-only scope assumed.")
    if not norm(row.get("region_type")) and not norm(row.get("city")):
        assumptions.append("Location not supplied; local accessibility assumed.")
    if not norm(row.get("accessibility_notes")):
        assumptions.append("No access restrictions supplied.")
    return assumptions


def price_from_weighted_score(weighted_score: float) -> int:
    raw_price = BASE_RATE * weighted_score * PRICE_MULTIPLIER
    return max(MINIMUM_QUOTATION, round_to_nearest(raw_price, ROUNDING_UNIT))


def calculate(row: dict[str, str]) -> PricingResult:
    assumptions = collect_assumptions(row)
    complexity = score_complexity(row)
    accessibility = score_accessibility(row)
    scope = score_scope(row)
    weighted_score = (
        complexity.score * WEIGHTS["complexity"]
        + accessibility.score * WEIGHTS["accessibility"]
        + scope.score * WEIGHTS["scope"]
    )
    return PricingResult(
        object_name=norm(row.get("object_name")) or "Unnamed object",
        client_type=norm(row.get("client_type")) or "-",
        complexity=complexity,
        accessibility=accessibility,
        scope=scope,
        weighted_score=round(weighted_score, 2),
        suggested_quotation=price_from_weighted_score(weighted_score),
        confidence=confidence(row, assumptions),
        assumptions=assumptions,
    )


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [field for field in CSV_FIELDS if field not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"Input CSV missing columns: {', '.join(missing)}")
        return [{key: norm(value) for key, value in row.items()} for row in reader]


def result_to_dict(result: PricingResult) -> dict[str, object]:
    return {
        "object_name": result.object_name,
        "client_type": result.client_type,
        "complexity": {
            "score": result.complexity.score,
            "explanation": result.complexity.explanation,
            "signals": result.complexity.signals,
            "weight": WEIGHTS["complexity"],
        },
        "accessibility": {
            "score": result.accessibility.score,
            "explanation": result.accessibility.explanation,
            "signals": result.accessibility.signals,
            "weight": WEIGHTS["accessibility"],
        },
        "scope": {
            "score": result.scope.score,
            "explanation": result.scope.explanation,
            "signals": result.scope.signals,
            "weight": WEIGHTS["scope"],
        },
        "weighted_score": result.weighted_score,
        "suggested_quotation": result.suggested_quotation,
        "confidence": result.confidence,
        "assumptions": result.assumptions,
    }


def write_report(path: Path, results: list[PricingResult], input_path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M %Z")
    lines = [
        "# RoofSignal Pricing Engine v1",
        "",
        f"Generated: {generated_at}",
        f"Input: `{input_path}`",
        "",
        "Formula: `250 x weighted score`, rounded to nearest EUR 50, with a EUR 500 minimum quotation.",
        "Weights: complexity 40%, accessibility/location 20%, inspection scope 40%.",
        "",
    ]
    for index, result in enumerate(results, start=1):
        lines.extend(
            [
                f"## {index}. {result.object_name}",
                "",
                f"- Client type: {result.client_type}",
                f"- Object complexity: {result.complexity.score}/5 - {result.complexity.explanation}",
                f"- Accessibility & location: {result.accessibility.score}/5 - {result.accessibility.explanation}",
                f"- Inspection scope: {result.scope.score}/5 - {result.scope.explanation}",
                f"- Weighted score: {result.weighted_score:.2f}",
                f"- Suggested quotation: EUR {result.suggested_quotation}",
                f"- Confidence: {result.confidence}",
                "",
                "Signals:",
            ]
        )
        for label, dimension in [
            ("Complexity", result.complexity),
            ("Accessibility", result.accessibility),
            ("Scope", result.scope),
        ]:
            lines.append(f"- {label}: " + "; ".join(dimension.signals))
        lines.append("")
        lines.append("Assumptions:")
        lines.extend([f"- {assumption}" for assumption in result.assumptions] or ["- No material assumptions."])
        lines.append("")

    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_json(path: Path, results: list[PricingResult]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([result_to_dict(result) for result in results], indent=2, ensure_ascii=False), encoding="utf-8")


def write_csv(path: Path, results: list[PricingResult]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "object_name",
        "client_type",
        "complexity_score",
        "accessibility_score",
        "scope_score",
        "weighted_score",
        "suggested_quotation",
        "confidence",
        "complexity_signals",
        "accessibility_signals",
        "scope_signals",
        "assumptions",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for result in results:
            writer.writerow(
                {
                    "object_name": result.object_name,
                    "client_type": result.client_type,
                    "complexity_score": result.complexity.score,
                    "accessibility_score": result.accessibility.score,
                    "scope_score": result.scope.score,
                    "weighted_score": f"{result.weighted_score:.2f}",
                    "suggested_quotation": result.suggested_quotation,
                    "confidence": result.confidence,
                    "complexity_signals": " | ".join(result.complexity.signals),
                    "accessibility_signals": " | ".join(result.accessibility.signals),
                    "scope_signals": " | ".join(result.scope.signals),
                    "assumptions": " | ".join(result.assumptions),
                }
            )


def write_template(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Calculate consistent RoofSignal inspection quotations.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="CSV input path.")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT, help="Markdown report output path.")
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON, help="JSON output path.")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="CSV output path.")
    parser.add_argument("--write-template", type=Path, help="Write an empty pricing input template and exit.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.write_template:
        write_template(args.write_template)
        print(f"Wrote template: {args.write_template}")
        return 0

    rows = load_rows(args.input)
    results = [calculate(row) for row in rows if any(norm(row.get(field)) for field in CSV_FIELDS)]
    write_report(args.report, results, args.input)
    write_json(args.json, results)
    write_csv(args.csv, results)
    print(f"Calculated {len(results)} quotations")
    print(f"Report: {args.report}")
    print(f"JSON: {args.json}")
    print(f"CSV: {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
