import re
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_cloudflare_has_a_real_not_found_page():
    content = read("404.html")
    assert '<meta name="robots" content="noindex,follow">' in content
    assert content.count("<h1>") == 1


def test_homepage_targets_the_primary_service_and_audience():
    content = read("index.html")
    assert "Gebouwschilinspectie voor VvE en vastgoed" in content
    assert "Inspectie van de gebouwschil voor al uw vastgoed." in content
    assert "Onafhankelijk onderhoud prioriteren" in content


def test_indexable_pages_have_one_h1_and_a_canonical():
    for path in ROOT.glob("*.html"):
        content = path.read_text(encoding="utf-8")
        if 'content="noindex' in content:
            continue
        assert content.count("<h1>") == 1, path.name
        assert content.count('rel="canonical"') == 1, path.name


def test_sitemap_contains_unique_public_urls_only():
    root = ET.parse(ROOT / "sitemap.xml").getroot()
    namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locations = [node.text for node in root.findall("s:url/s:loc", namespace)]
    assert len(locations) == len(set(locations))
    assert all(url.startswith("https://www.roofsignal.nl/") for url in locations)
    assert not any(re.search(r"/portal-|/404(?:$|/)", url) for url in locations)
