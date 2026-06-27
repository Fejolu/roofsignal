#!/usr/bin/env python3
"""Object-level RoofSignal lead enrichment.

This MVP turns candidate addresses into object-level inspection opportunities.
It uses public PDOK services where possible and keeps every inferred signal
explainable. It does not guess private ownership or scrape gated platforms.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LEADS_CSV = ROOT / "data" / "leads" / "roofsignal_leads.csv"
DEFAULT_CANDIDATES = ROOT / "data" / "leads" / "roofsignal_object_candidates.csv"
DEFAULT_REPORT = ROOT / "results" / "leads" / "latest_roofsignal_object_opportunities.md"
DEFAULT_JSON = ROOT / "results" / "leads" / "latest_roofsignal_object_opportunities.json"
DEFAULT_CSV = ROOT / "results" / "leads" / "latest_roofsignal_object_opportunities.csv"

LOCATIESERVER = "https://api.pdok.nl/bzk/locatieserver/search/v3_1"
BAG_OGC = "https://api.pdok.nl/kadaster/bag/ogc/v2"

CANDIDATE_FIELDS = [
    "manager_company",
    "object_name",
    "address",
    "city",
    "candidate_type",
    "source_url",
    "roof_type",
    "roof_year",
    "solar_installation",
    "visible_issues",
    "weather_signal",
    "permit_signal",
    "monument_status",
    "notes",
]

ADDRESS_RE = re.compile(
    r"(?P<street>[A-ZÀ-Ý][A-Za-zÀ-ÿ0-9 .'\-/]{2,70}?)\s+"
    r"(?P<number>\d{1,5}\s?[A-Za-z]?(?:-\d{1,5})?)\s*,?\s+"
    r"(?P<postcode>\d{4}\s?[A-Z]{2})\s+"
    r"(?P<city>[A-ZÀ-Ý][A-Za-zÀ-ÿ .'\-]{2,45})"
)

ADDRESS_STOPWORDS = {
    "postbus",
    "kvk",
    "btw",
    "iban",
    "tel",
    "telefoon",
    "mobiel",
}


class LinkAndTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.text_parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
        if tag == "a":
            for key, value in attrs:
                if key == "href" and value:
                    self.links.append(value)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = " ".join(data.split())
        if text:
            self.text_parts.append(text)


@dataclass
class ObjectScore:
    total: int = 0
    urgency: str = "Low"
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def norm(value: object) -> str:
    return str(value or "").strip()


def truthy(value: object) -> bool:
    return norm(value).lower() in {"1", "yes", "ja", "true", "y", "j", "x"}


def parse_int(value: object) -> int | None:
    text = norm(value)
    if not text:
        return None
    try:
        return int(float(text.replace(",", ".")))
    except ValueError:
        return None


def http_json(url: str, timeout: int = 15) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "RoofSignalLeadEngine/0.1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def http_text(url: str, timeout: int = 15) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "RoofSignalLeadEngine/0.1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get("Content-Type", "")
        charset = "utf-8"
        match = re.search(r"charset=([^;]+)", content_type)
        if match:
            charset = match.group(1)
        return response.read().decode(charset, errors="ignore")


def pdok_geocode(address: str, city: str) -> dict[str, Any] | None:
    query = " ".join(part for part in [address, city] if part)
    if not query:
        return None
    params = urllib.parse.urlencode({"q": query, "rows": 5})
    data = http_json(f"{LOCATIESERVER}/free?{params}")
    docs = data.get("response", {}).get("docs", [])
    address_docs = [doc for doc in docs if doc.get("type") == "adres"]
    if not address_docs:
        return docs[0] if docs else None
    return address_docs[0]


def parse_point(point: str) -> tuple[float, float] | None:
    match = re.match(r"POINT\(([-0-9.]+)\s+([-0-9.]+)\)", norm(point))
    if not match:
        return None
    return float(match.group(1)), float(match.group(2))


def bag_panden_near(lon: float, lat: float, radius: float = 0.00025) -> list[dict[str, Any]]:
    bbox = f"{lon - radius},{lat - radius},{lon + radius},{lat + radius}"
    params = urllib.parse.urlencode({"f": "json", "bbox": bbox, "limit": 10})
    data = http_json(f"{BAG_OGC}/collections/pand/items?{params}")
    return data.get("features", [])


def distance_to_feature(lon: float, lat: float, feature: dict[str, Any]) -> float:
    geometry = feature.get("geometry") or {}
    coords = geometry.get("coordinates")
    values: list[tuple[float, float]] = []

    def walk(node: Any) -> None:
        if isinstance(node, list) and len(node) >= 2 and all(isinstance(x, (int, float)) for x in node[:2]):
            values.append((float(node[0]), float(node[1])))
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(coords)
    if not values:
        return 999.0
    return min(math.hypot(lon - x, lat - y) for x, y in values)


def best_pand_for_point(lon: float, lat: float) -> dict[str, Any] | None:
    features = bag_panden_near(lon, lat)
    if not features:
        return None
    return min(features, key=lambda feature: distance_to_feature(lon, lat, feature))


def load_candidates(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [field for field in CANDIDATE_FIELDS if field not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"Candidate CSV missing columns: {', '.join(missing)}")
        return [{key: norm(value) for key, value in row.items()} for row in reader]


def load_leads(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return [{key: norm(value) for key, value in row.items()} for row in csv.DictReader(handle)]


def write_candidates(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    for row in rows:
        for field in CANDIDATE_FIELDS:
            row.setdefault(field, "")
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CANDIDATE_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def bootstrap_candidates_from_leads(leads_path: Path, out_path: Path) -> None:
    with leads_path.open(newline="", encoding="utf-8") as handle:
        leads = list(csv.DictReader(handle))

    rows = []
    for lead in leads:
        address = norm(lead.get("address"))
        city = norm(lead.get("city"))
        if not address or address.lower().startswith("postbus"):
            continue
        rows.append(
            {
                "manager_company": norm(lead.get("company")),
                "object_name": "Manager office / first known address",
                "address": address,
                "city": city,
                "candidate_type": "manager_office",
                "source_url": norm(lead.get("source_url")) or norm(lead.get("website")),
                "roof_type": "",
                "roof_year": "",
                "solar_installation": "",
                "visible_issues": "",
                "weather_signal": "",
                "permit_signal": "",
                "monument_status": "",
                "notes": "Bootstrapped from manager lead address. Treat as proof of enrichment pipeline, not as a managed object.",
            }
        )

    write_candidates(out_path, rows)


def base_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def normalize_url(url: str, href: str) -> str:
    if not href or href.startswith(("mailto:", "tel:", "#", "javascript:")):
        return ""
    return urllib.parse.urljoin(url, href.split("#", 1)[0])


def useful_link(url: str, candidate: str) -> bool:
    if not candidate.startswith(base_url(url)):
        return False
    lowered = candidate.lower()
    return any(
        token in lowered
        for token in [
            "contact",
            "vve",
            "vastgoed",
            "beheer",
            "portfolio",
            "project",
            "object",
            "over",
            "team",
        ]
    )


def extract_addresses(text: str) -> list[dict[str, str]]:
    cleaned = re.sub(r"\s+", " ", text)
    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for match in ADDRESS_RE.finditer(cleaned):
        street = " ".join(match.group("street").split())
        if any(stopword in street.lower() for stopword in ADDRESS_STOPWORDS):
            continue
        number = " ".join(match.group("number").split())
        postcode = match.group("postcode").replace(" ", "").upper()
        city = " ".join(match.group("city").split())
        key = f"{street}|{number}|{postcode}|{city}".lower()
        if key in seen:
            continue
        seen.add(key)
        found.append(
            {
                "address": f"{street} {number}",
                "city": city,
                "postcode": postcode,
            }
        )
    return found


def discover_candidates_from_web(
    leads_path: Path,
    out_path: Path,
    max_pages_per_site: int,
    sleep_seconds: float,
    merge_existing: bool,
) -> None:
    leads = load_leads(leads_path)
    existing = load_candidates(out_path) if merge_existing and out_path.exists() else []
    rows = list(existing)
    seen = {
        (
            row.get("manager_company", "").lower(),
            row.get("address", "").lower(),
            row.get("city", "").lower(),
            row.get("source_url", "").lower(),
        )
        for row in rows
    }

    for lead in leads:
        start = norm(lead.get("website")) or norm(lead.get("source_url"))
        if not start:
            continue
        queue = [start]
        visited: set[str] = set()
        pages_scanned = 0
        while queue and pages_scanned < max_pages_per_site:
            url = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)
            try:
                html = http_text(url)
            except Exception:
                continue
            pages_scanned += 1
            parser = LinkAndTextParser()
            parser.feed(html)
            page_text = " ".join(parser.text_parts)
            for address in extract_addresses(page_text):
                key = (
                    norm(lead.get("company")).lower(),
                    address["address"].lower(),
                    address["city"].lower(),
                    url.lower(),
                )
                if key in seen:
                    continue
                seen.add(key)
                rows.append(
                    {
                        "manager_company": norm(lead.get("company")),
                        "object_name": "Address discovered on public website",
                        "address": address["address"],
                        "city": address["city"],
                        "candidate_type": "website_address",
                        "source_url": url,
                        "roof_type": "",
                        "roof_year": "",
                        "solar_installation": "",
                        "visible_issues": "",
                        "weather_signal": "",
                        "permit_signal": "",
                        "monument_status": "",
                        "notes": f"Discovered postcode/address pattern {address['postcode']} on public website page.",
                    }
                )
            for href in parser.links:
                candidate = normalize_url(url, href)
                if candidate and candidate not in visited and useful_link(start, candidate) and candidate not in queue:
                    queue.append(candidate)
            time.sleep(sleep_seconds)

    write_candidates(out_path, rows)


def score_object(candidate: dict[str, str], geocode: dict[str, Any] | None, pand: dict[str, Any] | None) -> ObjectScore:
    score = ObjectScore()
    points = 0
    today = date.today()

    if geocode:
        points += 8
        score.reasons.append(f"Address resolved by PDOK: {geocode.get('weergavenaam')}")
    else:
        score.warnings.append("Address could not be resolved by PDOK.")

    props = (pand or {}).get("properties", {}) if pand else {}
    if props:
        points += 8
        score.reasons.append(f"BAG pand found: {props.get('identificatie')}")
    else:
        score.warnings.append("No BAG pand found near resolved address.")

    bouwjaar = parse_int(props.get("bouwjaar"))
    if bouwjaar:
        age = today.year - bouwjaar
        if age >= 50:
            points += 18
            score.reasons.append(f"High age signal: built in {bouwjaar} ({age} years)")
        elif age >= 30:
            points += 12
            score.reasons.append(f"Age signal: built in {bouwjaar} ({age} years)")
        elif age >= 20:
            points += 7
            score.reasons.append(f"Mature building: built in {bouwjaar} ({age} years)")

    verblijfsobjecten = parse_int(props.get("aantal_verblijfsobjecten"))
    if verblijfsobjecten:
        if verblijfsobjecten >= 20:
            points += 14
            score.reasons.append(f"Large multi-unit object: {verblijfsobjecten} verblijfsobjecten")
        elif verblijfsobjecten >= 5:
            points += 9
            score.reasons.append(f"Multi-unit object: {verblijfsobjecten} verblijfsobjecten")
        elif verblijfsobjecten >= 2:
            points += 4
            score.reasons.append(f"Small multi-unit object: {verblijfsobjecten} verblijfsobjecten")

    gebruiksdoel = norm(props.get("gebruiksdoel"))
    if gebruiksdoel:
        if "woonfunctie" in gebruiksdoel:
            points += 8
            score.reasons.append(f"Residential/VvE-compatible use: {gebruiksdoel}")
        elif any(term in gebruiksdoel for term in ["kantoor", "industrie", "bijeenkomst", "winkel"]):
            points += 6
            score.reasons.append(f"Commercial/managed-use signal: {gebruiksdoel}")

    if norm(candidate.get("candidate_type")) == "manager_office":
        points -= 10
        score.warnings.append("Candidate is a manager office address, not yet a confirmed managed object.")
    elif norm(candidate.get("candidate_type")) == "website_address":
        points -= 4
        score.warnings.append("Candidate is a website-discovered address; verify whether it is a managed object or office/contact address.")

    roof_type = norm(candidate.get("roof_type")).lower()
    if "plat" in roof_type or "flat" in roof_type:
        points += 12
        score.reasons.append("Flat roof signal from candidate data")

    roof_year = parse_int(candidate.get("roof_year"))
    if roof_year:
        roof_age = today.year - roof_year
        if roof_age >= 20:
            points += 16
            score.reasons.append(f"Roof age above 20 years: {roof_age} years")
        elif roof_age >= 12:
            points += 8
            score.reasons.append(f"Roof entering risk window: {roof_age} years")

    if truthy(candidate.get("solar_installation")):
        points += 7
        score.reasons.append("Solar installation signal")
    if norm(candidate.get("visible_issues")):
        points += 14
        score.reasons.append(f"Visible issue signal: {candidate.get('visible_issues')}")
    if norm(candidate.get("weather_signal")):
        points += 8
        score.reasons.append(f"Weather trigger: {candidate.get('weather_signal')}")
    if norm(candidate.get("permit_signal")):
        points += 8
        score.reasons.append(f"Permit/announcement trigger: {candidate.get('permit_signal')}")
    if truthy(candidate.get("monument_status")):
        points += 6
        score.reasons.append("Monument status/documentation value")

    score.total = max(0, min(100, points))
    if score.total >= 65 or norm(candidate.get("visible_issues")) or norm(candidate.get("permit_signal")):
        score.urgency = "High"
    elif score.total >= 40 or roof_year or norm(candidate.get("weather_signal")):
        score.urgency = "Medium"
    return score


def enrich_candidate(candidate: dict[str, str], sleep_seconds: float) -> dict[str, Any]:
    geocode = pdok_geocode(candidate.get("address", ""), candidate.get("city", ""))
    time.sleep(sleep_seconds)
    point = parse_point(geocode.get("centroide_ll", "")) if geocode else None
    pand = best_pand_for_point(*point) if point else None
    time.sleep(sleep_seconds)
    score = score_object(candidate, geocode, pand)
    props = (pand or {}).get("properties", {}) if pand else {}
    return {
        "score": score.total,
        "urgency": score.urgency,
        "manager_company": candidate.get("manager_company", ""),
        "object_name": candidate.get("object_name", ""),
        "candidate_type": candidate.get("candidate_type", ""),
        "input_address": candidate.get("address", ""),
        "input_city": candidate.get("city", ""),
        "resolved_address": geocode.get("weergavenaam", "") if geocode else "",
        "resolved_city": geocode.get("woonplaatsnaam", "") if geocode else "",
        "pdok_id": geocode.get("id", "") if geocode else "",
        "lonlat": geocode.get("centroide_ll", "") if geocode else "",
        "bag_pand_id": props.get("identificatie", ""),
        "bouwjaar": props.get("bouwjaar", ""),
        "gebruiksdoel": props.get("gebruiksdoel", ""),
        "aantal_verblijfsobjecten": props.get("aantal_verblijfsobjecten", ""),
        "status": props.get("status", ""),
        "source_url": candidate.get("source_url", ""),
        "reasons": score.reasons,
        "warnings": score.warnings,
        "notes": candidate.get("notes", ""),
    }


def write_outputs(rows: list[dict[str, Any]], report: Path, json_path: Path, csv_path: Path) -> None:
    deduped: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in rows:
        key = (
            norm(row.get("manager_company")).lower(),
            norm(row.get("bag_pand_id") or row.get("resolved_address") or row.get("input_address")).lower(),
            norm(row.get("candidate_type")).lower(),
        )
        current = deduped.get(key)
        if current is None or int(row["score"]) > int(current["score"]):
            row["duplicate_count"] = 1 if current is None else current.get("duplicate_count", 1) + 1
            deduped[key] = row
        elif current is not None:
            current["duplicate_count"] = current.get("duplicate_count", 1) + 1

    ranked = sorted(deduped.values(), key=lambda row: (-int(row["score"]), row["manager_company"], row["input_address"]))
    report.parent.mkdir(parents=True, exist_ok=True)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    json_path.write_text(json.dumps(ranked, indent=2, ensure_ascii=False), encoding="utf-8")

    csv_fields = [
        "score",
        "urgency",
        "manager_company",
        "object_name",
        "candidate_type",
        "input_address",
        "input_city",
        "resolved_address",
        "resolved_city",
        "bag_pand_id",
        "bouwjaar",
        "gebruiksdoel",
        "aantal_verblijfsobjecten",
        "status",
        "source_url",
        "duplicate_count",
        "reasons",
        "warnings",
    ]
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=csv_fields)
        writer.writeheader()
        for row in ranked:
            writer.writerow({field: " | ".join(row[field]) if isinstance(row.get(field), list) else row.get(field, "") for field in csv_fields})

    generated = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M %Z")
    lines = [
        "# RoofSignal Object Opportunity Report",
        "",
        f"Generated: {generated}",
        "",
        "Scores are object-level heuristics. Verify source data before outreach.",
        "",
        "## Top Object Opportunities",
        "",
    ]
    for index, row in enumerate(ranked, start=1):
        lines.extend(
            [
                f"### {index}. {row['manager_company']} - {row['resolved_address'] or row['input_address']}",
                "",
                f"- Score: {row['score']}/100",
                f"- Urgency: {row['urgency']}",
                f"- Candidate type: {row['candidate_type']}",
                f"- City: {row.get('resolved_city') or row.get('input_city') or '-'}",
                f"- BAG pand: {row['bag_pand_id'] or '-'}",
                f"- Bouwjaar: {row['bouwjaar'] or '-'}",
                f"- Gebruik: {row['gebruiksdoel'] or '-'}",
                f"- Verblijfsobjecten: {row['aantal_verblijfsobjecten'] or '-'}",
                f"- Source: {row['source_url'] or '-'}",
                f"- Duplicate sightings merged: {row.get('duplicate_count', 1)}",
                "",
                "Reasons:",
            ]
        )
        lines.extend([f"- {reason}" for reason in row["reasons"]] or ["- No strong object signal."])
        if row["warnings"]:
            lines.extend(["", "Warnings:"])
            lines.extend([f"- {warning}" for warning in row["warnings"]])
        lines.append("")

    report.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich RoofSignal object candidates with public PDOK/BAG signals.")
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--bootstrap-from-leads", action="store_true", help="Create candidates from lead office addresses first.")
    parser.add_argument("--discover-from-web", action="store_true", help="Scan public lead websites for Dutch address/postcode patterns.")
    parser.add_argument("--max-pages-per-site", type=int, default=4)
    parser.add_argument("--merge-existing", action="store_true", help="Keep existing candidates when discovering from web.")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--sleep", type=float, default=0.1, help="Delay between public API calls.")
    parser.add_argument(
        "--cities",
        default="",
        help="Optional comma-separated resolved-city filter, e.g. Apeldoorn,Deventer,Zutphen.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.bootstrap_from_leads or not args.candidates.exists():
        bootstrap_candidates_from_leads(LEADS_CSV, args.candidates)
        print(f"Bootstrapped candidates: {args.candidates}")
    if args.discover_from_web:
        discover_candidates_from_web(
            LEADS_CSV,
            args.candidates,
            args.max_pages_per_site,
            args.sleep,
            merge_existing=True if args.merge_existing or args.candidates.exists() else False,
        )
        print(f"Discovered website candidates: {args.candidates}")
    candidates = load_candidates(args.candidates)
    enriched = [enrich_candidate(candidate, args.sleep) for candidate in candidates]
    if args.cities.strip():
        wanted = {city.strip().lower() for city in args.cities.split(",") if city.strip()}
        enriched = [
            row
            for row in enriched
            if norm(row.get("resolved_city") or row.get("input_city")).lower() in wanted
        ]
    write_outputs(enriched, args.report, args.json, args.csv)
    print(f"Enriched {len(enriched)} object candidates")
    print(f"Report: {args.report}")
    print(f"JSON: {args.json}")
    print(f"CSV: {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
