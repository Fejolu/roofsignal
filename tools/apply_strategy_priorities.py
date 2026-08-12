#!/usr/bin/env python3
"""Apply the August 2026 positioning and SEO priorities consistently."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

OLD_DESKTOP = '<div class="services-dropdown-group"><span class="services-dropdown-label">Pilot &amp; samenwerking</span><a href="/toepassingen#stormrespons">Stormschade &amp; objecttriage</a><a href="/toepassingen#verzekeraars">Verzekeraars &amp; schadepreventie</a><a href="/toepassingen#publiek-vastgoed">Publiek vastgoed</a><a href="/toepassingen#energie-infrastructuur">Energie-infrastructuur</a><a href="/toepassingen#natuurbeheer">Natuurbeheer &amp; wilddetectie</a><a href="/toepassingen#crisisrespons">Crisisrespons &amp; vermissingen</a></div>'
NEW_DESKTOP = '<div class="services-dropdown-group"><span class="services-dropdown-label">Pilot &amp; samenwerking</span><a href="/toepassingen#stormrespons">Stormschade &amp; objecttriage</a><a href="/toepassingen#publiek-vastgoed">Publiek vastgoed</a></div>'
OLD_MOBILE = '<span class="mobile-services-label">Pilot &amp; samenwerking</span><a href="/toepassingen#stormrespons">Stormschade &amp; objecttriage</a><a href="/toepassingen#verzekeraars">Verzekeraars</a><a href="/toepassingen#publiek-vastgoed">Publiek vastgoed</a><a href="/toepassingen#energie-infrastructuur">Energie-infrastructuur</a><a href="/toepassingen#natuurbeheer">Natuurbeheer</a><a href="/toepassingen#crisisrespons">Crisisrespons</a>'
NEW_MOBILE = '<span class="mobile-services-label">Pilot &amp; samenwerking</span><a href="/toepassingen#stormrespons">Stormschade &amp; objecttriage</a><a href="/toepassingen#publiek-vastgoed">Publiek vastgoed</a>'

for path in ROOT.rglob("*.html"):
    text = path.read_text(encoding="utf-8")
    updated = text.replace(OLD_DESKTOP, NEW_DESKTOP).replace(OLD_MOBILE, NEW_MOBILE)
    if updated != text:
        path.write_text(updated, encoding="utf-8")

# Keep generic municipality pages available to visitors, but out of the index
# until a page has genuine local evidence. Provinces and curated pages remain indexed.
province_slugs = {
    "drenthe", "flevoland", "friesland", "gelderland", "groningen", "limburg",
    "noord-brabant", "noord-holland", "overijssel", "utrecht", "zeeland", "zuid-holland",
}
curated = {"apeldoorn", "deventer", "zwolle", "arnhem", "ede", "amersfoort", "veluwe"}
for path in ROOT.glob("inspectie-*.html"):
    slug = path.stem.removeprefix("inspectie-")
    if slug in province_slugs or slug in curated:
        continue
    text = path.read_text(encoding="utf-8")
    text = text.replace('<meta name="robots" content="index,follow">', '<meta name="robots" content="noindex,follow">', 1)
    path.write_text(text, encoding="utf-8")

# Sitemap only advertises pages that are deliberately indexable.
sitemap = ROOT / "sitemap.xml"
text = sitemap.read_text(encoding="utf-8")
def keep(match):
    block = match.group(0)
    found = re.search(r"/inspectie-([^<]+)</loc>", block)
    if not found:
        return block
    slug = found.group(1).rstrip("/")
    return block if slug in province_slugs or slug in curated else ""
sitemap.write_text(re.sub(r"\s*<url>.*?</url>", keep, text, flags=re.S), encoding="utf-8")
