#!/usr/bin/env python3
"""Signal-based RoofSignal lead engine.

This tool ranks inspection opportunities from structured lead rows. It does not
scrape gated platforms; feed it public/open/manual observations and it produces
explainable lead cards.
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "leads" / "roofsignal_leads.csv"
DEFAULT_REPORT = ROOT / "results" / "leads" / "latest_roofsignal_leads.md"
DEFAULT_JSON = ROOT / "results" / "leads" / "latest_roofsignal_leads.json"
DEFAULT_CSV = ROOT / "results" / "leads" / "latest_roofsignal_leads.csv"

CSV_FIELDS = [
    "company",
    "decision_maker",
    "role",
    "email",
    "phone",
    "website",
    "address",
    "city",
    "segment",
    "building_type",
    "managed_buildings",
    "construction_year",
    "roof_type",
    "roof_year",
    "solar_installation",
    "visible_issues",
    "weather_signal",
    "municipality_signal",
    "permit_signal",
    "procurement_signal",
    "monument_status",
    "source_url",
    "notes",
]

SEGMENT_SCORES = {
    "vve beheer": 22,
    "vve-beheer": 22,
    "vve": 20,
    "vastgoedbeheer": 22,
    "property management": 22,
    "asset management": 20,
    "woningcorporatie": 18,
    "bedrijfspand": 16,
    "logistiek": 16,
    "zorg": 14,
    "school": 14,
    "gemeente": 12,
}

BUILDING_TYPE_SCORES = {
    "appartement": 10,
    "flat": 10,
    "complex": 10,
    "bedrijfspand": 8,
    "kantoor": 8,
    "logistiek": 8,
    "loods": 8,
    "winkelcentrum": 8,
    "school": 7,
    "zorg": 7,
}

VISIBLE_ISSUE_SCORES = {
    "mos": 5,
    "vegetatie": 6,
    "groen": 4,
    "verstopte goot": 6,
    "goot": 4,
    "scheur": 5,
    "lekkage": 8,
    "stormschade": 7,
    "zonnepanelen": 3,
    "houtrot": 5,
    "voegwerk": 4,
    "dakrand": 4,
}

MANAGER_SIGNAL_SCORES = {
    "technisch beheer": 7,
    "mjop": 7,
    "onderhoud": 5,
    "verduurzaming": 5,
    "portefeuille": 6,
    "vastgoedbeheer": 5,
    "vve beheer": 5,
    "twinq": 3,
    "24/7": 3,
    "calamiteiten": 4,
    "technische": 4,
}

MAX_SCORE = 158


@dataclass
class Score:
    portfolio_fit: int = 0
    building_risk: int = 0
    event_urgency: int = 0
    visible_evidence: int = 0
    budget_likelihood: int = 0
    decision_access: int = 0
    repeat_potential: int = 0
    data_value: int = 0
    conversion_probability: int = 0
    confidence: int = 0
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        raw = (
            self.portfolio_fit
            + self.building_risk
            + self.event_urgency
            + self.visible_evidence
            + self.budget_likelihood
            + self.decision_access
            + self.repeat_potential
            + self.data_value
            + self.conversion_probability
            + self.confidence
        )
        return max(0, min(100, round((raw / MAX_SCORE) * 100)))


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


def contains_any(text: str, scores: dict[str, int]) -> tuple[int, list[str]]:
    value = text.lower()
    points = 0
    matches: list[str] = []
    for keyword, score in scores.items():
        if keyword in value:
            points += score
            matches.append(keyword)
    return points, matches


def score_lead(row: dict[str, str], today: date) -> Score:
    score = Score()

    company = norm(row.get("company"))
    segment = lower(row.get("segment"))
    building_type = lower(row.get("building_type"))
    managed_buildings = parse_int(row.get("managed_buildings")) or 0
    construction_year = parse_int(row.get("construction_year"))
    roof_year = parse_int(row.get("roof_year"))
    roof_type = lower(row.get("roof_type"))
    visible_issues = lower(row.get("visible_issues"))
    notes = lower(row.get("notes"))

    if company:
        score.confidence += 4
    else:
        score.warnings.append("Missing company name.")

    segment_points, segment_matches = contains_any(segment, SEGMENT_SCORES)
    if segment_points:
        score.portfolio_fit += min(24, segment_points)
        score.budget_likelihood += 7
        score.reasons.append("Strong target segment: " + ", ".join(segment_matches))

    if managed_buildings >= 50:
        score.portfolio_fit += 18
        score.repeat_potential += 12
        score.data_value += 10
        score.reasons.append(f"Large managed portfolio: {managed_buildings} buildings")
    elif managed_buildings >= 10:
        score.portfolio_fit += 12
        score.repeat_potential += 8
        score.data_value += 7
        score.reasons.append(f"Multi-building portfolio: {managed_buildings} buildings")
    elif managed_buildings >= 3:
        score.portfolio_fit += 7
        score.repeat_potential += 4
        score.reasons.append(f"Small portfolio: {managed_buildings} buildings")

    type_points, type_matches = contains_any(building_type, BUILDING_TYPE_SCORES)
    if type_points:
        score.portfolio_fit += min(10, type_points)
        score.reasons.append("Relevant building type: " + ", ".join(type_matches))

    if "plat" in roof_type or "flat" in roof_type:
        score.building_risk += 14
        score.reasons.append("Flat roof signal")
    elif roof_type:
        score.building_risk += 4

    current_year = today.year
    if construction_year and 1800 <= construction_year <= current_year:
        age = current_year - construction_year
        if age >= 40:
            score.building_risk += 10
            score.data_value += 4
            score.reasons.append(f"Older building: {age} years")
        elif age >= 20:
            score.building_risk += 6
            score.reasons.append(f"Mature building: {age} years")
    elif norm(row.get("construction_year")):
        score.warnings.append("Construction year could not be parsed.")

    if roof_year and 1800 <= roof_year <= current_year:
        roof_age = current_year - roof_year
        if roof_age >= 20:
            score.building_risk += 16
            score.reasons.append(f"Roof age above 20 years: {roof_age} years")
        elif roof_age >= 12:
            score.building_risk += 8
            score.reasons.append(f"Roof entering risk window: {roof_age} years")
    elif norm(row.get("roof_year")):
        score.warnings.append("Roof year could not be parsed.")

    issue_points, issue_matches = contains_any(visible_issues, VISIBLE_ISSUE_SCORES)
    if issue_points:
        score.visible_evidence += min(18, issue_points)
        score.conversion_probability += 5
        score.reasons.append("Visible issue signals: " + ", ".join(issue_matches))

    manager_points, manager_matches = contains_any(notes, MANAGER_SIGNAL_SCORES)
    if manager_points:
        score.budget_likelihood += min(8, manager_points)
        score.conversion_probability += min(6, manager_points // 2)
        score.confidence += 3
        score.reasons.append("Manager/service signals: " + ", ".join(manager_matches[:4]))

    if truthy(row.get("solar_installation")):
        score.building_risk += 4
        score.data_value += 5
        score.reasons.append("Solar installation creates inspection/reporting angle")

    for field_name, label, points in [
        ("weather_signal", "Recent weather exposure", 8),
        ("municipality_signal", "Municipal maintenance or policy signal", 6),
        ("permit_signal", "Permit activity", 6),
        ("procurement_signal", "Procurement/tender signal", 8),
    ]:
        value = norm(row.get(field_name))
        if value:
            score.event_urgency += points
            score.confidence += 3
            score.reasons.append(f"{label}: {value}")

    if truthy(row.get("monument_status")):
        score.budget_likelihood += 5
        score.data_value += 5
        score.reasons.append("Monument status increases documentation value")

    if norm(row.get("decision_maker")):
        score.decision_access += 8
        score.conversion_probability += 5
    if norm(row.get("email")):
        score.decision_access += 6
        score.conversion_probability += 3
    if norm(row.get("phone")):
        score.decision_access += 4
    if norm(row.get("website")):
        score.confidence += 3
    if norm(row.get("source_url")):
        score.confidence += 5
    else:
        score.warnings.append("Missing source URL; verify before outreach.")

    if score.visible_evidence == 0 and score.event_urgency == 0:
        score.warnings.append("No urgency/evidence signal; may be a generic prospect.")

    score.portfolio_fit = min(score.portfolio_fit, 25)
    score.building_risk = min(score.building_risk, 22)
    score.event_urgency = min(score.event_urgency, 18)
    score.visible_evidence = min(score.visible_evidence, 18)
    score.budget_likelihood = min(score.budget_likelihood, 12)
    score.decision_access = min(score.decision_access, 15)
    score.repeat_potential = min(score.repeat_potential, 12)
    score.data_value = min(score.data_value, 12)
    score.conversion_probability = min(score.conversion_probability, 12)
    score.confidence = min(score.confidence, 12)

    return score


def estimated_value(row: dict[str, str], score: Score) -> str:
    managed = parse_int(row.get("managed_buildings")) or 0
    if managed >= 10:
        return "High: portfolio scan can unlock multiple inspections"
    if score.total >= 70:
        return "Medium-high: strong single or small-portfolio opportunity"
    if score.total >= 50:
        return "Medium: qualify before outreach"
    return "Low/unclear: research further"


def urgency_label(score: Score) -> str:
    if score.event_urgency >= 12 or score.visible_evidence >= 12:
        return "High"
    if score.event_urgency >= 6 or score.visible_evidence >= 6 or score.building_risk >= 18:
        return "Medium"
    return "Low"


def outreach(row: dict[str, str], score: Score) -> str:
    segment = norm(row.get("segment")) or "uw organisatie"
    address = norm(row.get("address")) or "een van uw objecten"
    hook = next(
        (
            reason
            for reason in score.reasons
            if not reason.startswith("Strong target segment")
            and not reason.startswith("Relevant building type")
        ),
        score.reasons[0] if score.reasons else "mogelijk onderhoudsrisico",
    )
    return (
        f"Benader {segment} met een korte portefeuillescan-insteek: "
        f"'{address}' lijkt relevant vanwege {hook}. Vraag of zij 2-3 objecten willen laten "
        "prioriteren op dak/gevel/goten-risico met foto-evidence en MJOP-bruikbare samenvatting."
    )


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [field for field in CSV_FIELDS if field not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"Input CSV missing columns: {', '.join(missing)}")
        return [{key: norm(value) for key, value in row.items()} for row in reader]


def rank_rows(rows: Iterable[dict[str, str]], today: date) -> list[dict[str, object]]:
    ranked = []
    for row in rows:
        if not any(norm(row.get(field)) for field in CSV_FIELDS):
            continue
        score = score_lead(row, today)
        enriched = {
            "score": score.total,
            "urgency": urgency_label(score),
            "estimated_value": estimated_value(row, score),
            "reasons": score.reasons[:8],
            "warnings": score.warnings,
            "outreach": outreach(row, score),
            "dimensions": {
                "portfolio_fit": score.portfolio_fit,
                "building_risk": score.building_risk,
                "event_urgency": score.event_urgency,
                "visible_evidence": score.visible_evidence,
                "budget_likelihood": score.budget_likelihood,
                "decision_access": score.decision_access,
                "repeat_potential": score.repeat_potential,
                "data_value": score.data_value,
                "conversion_probability": score.conversion_probability,
                "confidence": score.confidence,
            },
            "lead": row,
        }
        ranked.append(enriched)
    return sorted(ranked, key=lambda item: (-int(item["score"]), lower(item["lead"].get("company"))))


def write_report(path: Path, ranked: list[dict[str, object]], top: int, input_path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M %Z")
    lines = [
        "# RoofSignal Lead Engine Report",
        "",
        f"Generated: {generated_at}",
        f"Input: `{input_path}`",
        "",
        "Scores are explainable heuristics, not objective truth. Verify every lead before outreach.",
        "",
        f"## Top {min(top, len(ranked))} Leads",
        "",
    ]

    for index, item in enumerate(ranked[:top], start=1):
        lead = item["lead"]
        assert isinstance(lead, dict)
        reasons = item["reasons"]
        warnings = item["warnings"]
        lines.extend(
            [
                f"### {index}. {lead.get('company') or 'Unnamed lead'}",
                "",
                f"- Score: {item['score']}/100",
                f"- Urgency: {item['urgency']}",
                f"- Estimated inspection value: {item['estimated_value']}",
                f"- Segment: {lead.get('segment') or '-'}",
                f"- Building/address: {lead.get('building_type') or '-'} | {lead.get('address') or '-'} | {lead.get('city') or '-'}",
                f"- Decision maker: {lead.get('decision_maker') or '-'} {('(' + lead.get('role', '') + ')') if lead.get('role') else ''}",
                f"- Contact: {lead.get('email') or '-'} | {lead.get('phone') or '-'}",
                f"- Source: {lead.get('source_url') or '-'}",
                "",
                "Reasons:",
            ]
        )
        lines.extend([f"- {reason}" for reason in reasons] or ["- No strong signal captured."])
        if warnings:
            lines.append("")
            lines.append("Warnings:")
            lines.extend([f"- {warning}" for warning in warnings])
        lines.extend(["", "Outreach angle:", "", str(item["outreach"]), ""])

    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_json(path: Path, ranked: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ranked, indent=2, ensure_ascii=False), encoding="utf-8")


def write_csv(path: Path, ranked: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    output_fields = [
        "score",
        "urgency",
        "estimated_value",
        "company",
        "decision_maker",
        "role",
        "email",
        "phone",
        "website",
        "address",
        "city",
        "segment",
        "building_type",
        "source_url",
        "top_reasons",
        "warnings",
        "outreach",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=output_fields)
        writer.writeheader()
        for item in ranked:
            lead = item["lead"]
            assert isinstance(lead, dict)
            writer.writerow(
                {
                    "score": item["score"],
                    "urgency": item["urgency"],
                    "estimated_value": item["estimated_value"],
                    "company": lead.get("company", ""),
                    "decision_maker": lead.get("decision_maker", ""),
                    "role": lead.get("role", ""),
                    "email": lead.get("email", ""),
                    "phone": lead.get("phone", ""),
                    "website": lead.get("website", ""),
                    "address": lead.get("address", ""),
                    "city": lead.get("city", ""),
                    "segment": lead.get("segment", ""),
                    "building_type": lead.get("building_type", ""),
                    "source_url": lead.get("source_url", ""),
                    "top_reasons": " | ".join(item["reasons"]),
                    "warnings": " | ".join(item["warnings"]),
                    "outreach": item["outreach"],
                }
            )


def write_template(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rank RoofSignal inspection leads from signal CSV input.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="CSV input path.")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT, help="Markdown report output path.")
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON, help="JSON output path.")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="Ranked CSV output path.")
    parser.add_argument("--top", type=int, default=20, help="Number of leads to include in markdown report.")
    parser.add_argument("--write-template", type=Path, help="Write an empty input template and exit.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.write_template:
        write_template(args.write_template)
        print(f"Wrote template: {args.write_template}")
        return 0

    input_path = args.input
    if not input_path.exists():
        raise SystemExit(
            f"Input not found: {input_path}\n"
            "Create it from the template with:\n"
            f"  python3 tools/roofsignal_lead_engine.py --write-template {input_path}"
        )

    ranked = rank_rows(load_rows(input_path), date.today())
    write_report(args.report, ranked, args.top, input_path)
    write_json(args.json, ranked)
    write_csv(args.csv, ranked)
    print(f"Ranked {len(ranked)} leads")
    print(f"Report: {args.report}")
    print(f"JSON: {args.json}")
    print(f"CSV: {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
