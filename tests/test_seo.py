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


def test_homepage_targets_property_intelligence_and_a_concrete_outcome():
    content = read("index.html")
    assert "Property Intelligence voor gebouwschil en onderhoud" in content
    assert "Van gebouwsignalen naar betere vastgoedbesluiten." in content
    assert "VvE beheerders" in content
    assert "onderhoudsprioriteiten" in content


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
    assert not any("/inspectie-" in url for url in locations)


def test_local_seo_pages_stay_consolidated_on_work_area():
    assert not list(ROOT.glob("inspectie-*.html"))
    redirects = read("_redirects")
    assert "/inspectie-* /werkgebied 301" in redirects
    assert "/inspectie-*.html /werkgebied 301" in redirects


def test_public_footers_end_with_knowledge_base_then_portal():
    pages = list(ROOT.glob("*.html")) + [ROOT / "de-parken" / "index.html"]
    for path in pages:
        content = path.read_text(encoding="utf-8")
        if '<footer class="footer"' not in content:
            continue
        footer = content.split('<footer class="footer"', 1)[1].split("</footer>", 1)[0]
        knowledge = footer.find(">Kennisbank</a>")
        portal = footer.find(">RoofSignal Portaal</a>")
        assert knowledge >= 0, path.name
        assert portal > knowledge, path.name
        assert 'footer-company-spacer' in footer[0:knowledge], path.name


def test_public_navigation_uses_one_approach_and_proposal_destination():
    pages = list(ROOT.glob("*.html")) + list((ROOT / "de-parken").glob("*.html"))
    for path in pages:
        content = path.read_text(encoding="utf-8")
        assert '<a href="/werkwijze">Werkwijze</a>' not in content, path.name
        assert '<a href="/tarieven">Tarieven</a>' not in content, path.name
    rates = read("tarieven.html")
    assert "Aanpak &amp; offerte" in rates
    assert 'id="aanpak"' in rates
    assert "Scope &amp; voorstel" in rates


def test_public_site_does_not_publish_catalog_prices():
    pages = ("index.html", "tarieven.html", "kennisbank-dakinspectie-kosten.html", "werkgebied.html", "de-parken/index.html")
    for path in pages:
        content = read(path)
        assert "Vanaf €" not in content, path
        assert '"priceCurrency"' not in content, path
