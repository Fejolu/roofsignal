#!/usr/bin/env python3
"""Genereert inspectie-pagina's (12 provincies + alle gemeenten) uit data/gemeenten.csv.

Gebruik:
    python3 tools/gen-inspecties.py

- Schrijft inspectie-{provincie}.html en inspectie-{gemeente}.html
- Curated pagina's (inspectie-apeldoorn, ...) worden nooit overschreven
- Vernieuwt de provincie-grid in werkgebied.html
- Regeneert sitemap.xml (bestaande entries blijven behouden)
"""
import csv, json, re, unicodedata, glob, os, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, "data", "gemeenten.csv")
CSS = "assets/styles.css?v=20260811&brand=2"
BASE = "https://www.roofsignal.nl"

# Curated pagina's: nooit overschrijven door de generator
CURATED = {
    "apeldoorn", "deventer", "zwolle", "arnhem", "ede", "amersfoort", "veluwe",
}

PROVINCE_LABEL = {
    "Drenthe": "Drenthe", "Flevoland": "Flevoland", "Friesland": "Friesland",
    "Gelderland": "Gelderland", "Groningen": "Groningen", "Limburg": "Limburg",
    "Noord-Brabant": "Noord-Brabant", "Noord-Holland": "Noord-Holland",
    "Overijssel": "Overijssel", "Utrecht": "Utrecht", "Zeeland": "Zeeland",
    "Zuid-Holland": "Zuid-Holland",
}

def _current_layout():
    def block(doc, tag):
        start = doc.find(f"<{tag}")
        end = doc.find(f"</{tag}>")
        return doc[start:end + len(f"</{tag}>")]
    index = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    werk = open(os.path.join(ROOT, "werkgebied.html"), encoding="utf-8").read()
    return block(index, "header"), block(werk, "footer")


HEADER, FOOTER = _current_layout()


def slug(name):
    s = name.lower()
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def read_csv():
    rows = [(r["naam"], r["provincie"]) for r in csv.DictReader(open(CSV, encoding="utf-8"))]
    slugs = {}
    for naam, prov in rows:
        slugs.setdefault(slug(naam), []).append((naam, prov))
    out = {}
    for s, items in slugs.items():
        if len(items) == 1:
            out[s] = items[0]
        else:
            for naam, prov in items:
                out[f"{s}-{slug(prov)}"] = (naam, prov)
    # Botsing tussen gemeente en provincie: provincie houdt korte slug,
    # de gelijknamige stad krijgt een "-stad" suffix (Utrecht, Groningen).
    province_slugs = {slug(p) for _, p in rows}
    for s in list(out):
        if s in province_slugs:
            naam, prov = out.pop(s)
            out[f"{s}-stad"] = (naam, prov)
    return rows, out


def breadcrumb(path):
    items = [{"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + "/"}]
    url = BASE
    for i, (name, part) in enumerate(path, start=2):
        url += "/" + part
        items.append({"@type": "ListItem", "position": i, "name": name, "item": url})
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}


def json_like(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def page(title, description, canonical, schemas, body):
    bc, service, webpage = schemas
    head = f'''<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="assets/favicon.svg?v=2" type="image/svg+xml">
  <title>{html.escape(title)}</title>
  <meta name="description" content="{html.escape(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="{canonical}">
  <script type="application/ld+json">{json_like(bc)}</script>
  <meta property="og:locale" content="nl_NL">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="RoofSignal">
  <meta property="og:title" content="{html.escape(title)}">
  <meta property="og:description" content="{html.escape(description)}">
  <meta property="og:url" content="{canonical}">
  <meta property="og:image" content="{BASE}/assets/heroes/de-parken-woningscan.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html.escape(title)}">
  <meta name="twitter:description" content="{html.escape(description)}">
  <meta name="twitter:image" content="{BASE}/assets/heroes/de-parken-woningscan.jpg">
  <link rel="stylesheet" href="{CSS}">
  <script type="application/ld+json">{json_like(service)}</script>
  <script type="application/ld+json">{json_like(webpage)}</script>
  <script src="assets/analytics-config.js"></script>
  <script src="assets/analytics.js"></script>
</head>
<body>
{HEADER}
<main>
{body}
</main>
{FOOTER}
</body>
</html>
'''
    return head


def gemeente_page(naam, prov, s):
    pslug = slug(prov)
    title = f"Inspectie {naam} | Gebouwschilrapportage | RoofSignal"
    desc = (f"RoofSignal doet onafhankelijke gebouwschilinspecties in {naam} ({prov}): "
            f"dakinspectie, woningscan, MJOP-input en portefeuillescan \u2014 \u00e9\u00e9n onafhankelijk rapport.")
    canonical = f"{BASE}/inspectie-{s}"
    bc = breadcrumb([("Werkgebied", "werkgebied"), (prov, f"inspectie-{pslug}"), (naam, f"inspectie-{s}")])
    service = {"@context": "https://schema.org", "@type": "Service",
               "@id": f"{canonical}#service",
               "name": f"Gebouwschilinspectie in {naam}", "url": canonical,
               "provider": {"@id": BASE + "/#organization"},
               "areaServed": [{"@type": "Place", "name": naam}, {"@type": "Country", "name": "Nederland"}],
               "serviceType": "Dakinspectie, woningscan, VvE/MJOP-input en portefeuillescan",
               "inLanguage": "nl-NL"}
    webpage = {"@context": "https://schema.org", "@type": "WebPage", "@id": f"{canonical}#webpage",
               "url": canonical, "name": title, "description": desc,
               "isPartOf": {"@id": BASE + "/#website"}, "about": {"@id": BASE + "/#organization"},
               "inLanguage": "nl-NL"}
    body = f'''<section class="page-hero page-hero-vve"><p class="eyebrow">Werkgebied</p><h1>Inspectie in {html.escape(naam)}.</h1><p>RoofSignal doet onafhankelijke gebouwschilinspecties in {html.escape(naam)}, provincie {html.escape(prov)}. Dakinspectie, woningscan, MJOP-input of portefeuillescan \u2014 \u00e9\u00e9n inspectieprotocol, \u00e9\u00e9n rapportage-aanpak.</p></section>
<section class="section"><p class="eyebrow orange center">Diensten</p><h2 class="centered-title">Wat we in {html.escape(naam)} doen.</h2><div class="cards four service-cards"><article><h3>Dakinspectie</h3><p>Dak, dakranden, goten, loodwerk en zichtbare risico\u2019s, onafhankelijk gerapporteerd.</p></article><article><h3>Woningscan</h3><p>De gebouwschil van \u00e9\u00e9n woning, met prioriteiten en een helder vervolgadvies.</p></article><article><h3>VvE &amp; MJOP-input</h3><p>Actuele bevindingen per bouwdeel als input voor bestuur, ALV en meerjarenonderhoudsplanning.</p></article><article><h3>Portefeuillescan</h3><p>Objecten vergelijkbaar maken: waar zitten risico\u2019s, prioriteiten en rapportagebehoefte?</p></article></div></section>
<section class="section split"><div><p class="eyebrow orange">Hoe het werkt</p><h2>Bewijs boven reistijd.</h2><p>We kiezen per object de passende opnamewijze: vanaf maaiveld, vanaf bestaande toegang, met een hoogwerker of met gerichte dronebeelden. Uw dak hoeft niet begaanbaar te zijn.</p></div><div class="trust-list"><div><strong>Onafhankelijk</strong><span>RoofSignal verdient niet aan de herstelopdracht.</span></div><div><strong>Heldere prioriteiten</strong><span>Wat nu, wat later, wat monitoren \u2014 direct bruikbaar.</span></div><div><strong>Eerlijke reiskosten</strong><span>Reisafstand staat duidelijk in de offerte.</span></div><div><strong>Heel Nederland</strong><span>We werken door het hele land en bundelen opdrachten per regio.</span></div></div></section>
<section class="cta"><h2>Heeft u een onderhoudsvraag in {html.escape(naam)}?</h2><a class="btn" href="contact">Vraag een offerte aan</a><a class="btn ghost" href="inspectie-{pslug}">Meer over {html.escape(prov)}</a></section>'''
    return page(title, desc, canonical, (bc, service, webpage), body)


def provincie_page(prov, gemeenten):
    pslug = slug(prov)
    title = f"Inspectie in {prov} | RoofSignal"
    desc = (f"RoofSignal werkt in {prov}: dakinspectie, woningscan, MJOP-input en portefeuillescan "
            f"in {len(gemeenten)} gemeenten \u2014 \u00e9\u00e9n onafhankelijk protocol.")
    canonical = f"{BASE}/inspectie-{pslug}"
    bc = breadcrumb([("Werkgebied", "werkgebied"), (prov, f"inspectie-{pslug}")])
    service = {"@context": "https://schema.org", "@type": "Service",
               "@id": f"{canonical}#service",
               "name": f"Gebouwschilinspectie in {prov}", "url": canonical,
               "provider": {"@id": BASE + "/#organization"},
               "areaServed": [{"@type": "State", "name": prov}, {"@type": "Country", "name": "Nederland"}],
               "serviceType": "Dakinspectie, woningscan, VvE/MJOP-input en portefeuillescan",
               "inLanguage": "nl-NL"}
    webpage = {"@context": "https://schema.org", "@type": "WebPage", "@id": f"{canonical}#webpage",
               "url": canonical, "name": title, "description": desc,
               "isPartOf": {"@id": BASE + "/#website"}, "about": {"@id": BASE + "/#organization"},
               "inLanguage": "nl-NL"}
    cards = "".join(
        f'<article><h3>{html.escape(naam)}</h3><a href="inspectie-{s}">Inspectie {html.escape(naam)}</a></article>'
        for s, (naam, _) in sorted(gemeenten.items(), key=lambda kv: kv[1][0])
    )
    body = f'''<section class="page-hero page-hero-vve"><p class="eyebrow">Werkgebied</p><h1>Inspectie in {html.escape(prov)}.</h1><p>RoofSignal werkt in {html.escape(prov)} met \u00e9\u00e9n onafhankelijk protocol: dakinspectie, woningscan, MJOP-input en portefeuillescan \u2014 van \u00e9\u00e9n woning tot een hele portefeuille.</p></section>
<section class="section muted"><p class="eyebrow orange center">{html.escape(prov)}</p><h2 class="centered-title">Gemeenten in {html.escape(prov)}.</h2><div class="cards four audience-cards">{cards}</div></section>
<section class="cta"><h2>Heeft u een onderhoudsvraag in {html.escape(prov)}?</h2><a class="btn" href="contact">Vraag een offerte aan</a><a class="btn ghost" href="werkgebied">Bekijk heel Nederland</a></section>'''
    return page(title, desc, canonical, (bc, service, webpage), body)


def main():
    rows, slugs = read_csv()
    # provincie -> gemeenten (slug, naam)
    by_prov = {}
    for s, (naam, prov) in slugs.items():
        by_prov.setdefault(prov, {})[s] = (naam, prov)

    written = []
    for prov, gemeenten in sorted(by_prov.items()):
        pslug = slug(prov)
        out = os.path.join(ROOT, f"inspectie-{pslug}.html")
        open(out, "w", encoding="utf-8").write(provincie_page(prov, gemeenten))
        written.append(out)

    for s, (naam, prov) in slugs.items():
        if s in CURATED:
            continue
        out = os.path.join(ROOT, f"inspectie-{s}.html")
        open(out, "w", encoding="utf-8").write(gemeente_page(naam, prov, s))
        written.append(out)

    update_werkgebied(by_prov)
    regenerate_sitemap()
    print(f"pagina's geschreven: {len(written)}")


def update_werkgebied(by_prov):
    f = os.path.join(ROOT, "werkgebied.html")
    doc = open(f, encoding="utf-8").read()
    prov_cards = "".join(
        f'<article><h3>{html.escape(prov)}</h3><p>{len(gemeenten)} gemeenten, \u00e9\u00e9n onafhankelijk protocol.</p><a href="inspectie-{slug(prov)}">Bekijk {html.escape(prov)}</a></article>'
        for prov, gemeenten in sorted(by_prov.items())
    )
    curated_links = "".join(
        f'<div><a href="inspectie-{c}">Inspectie {c.capitalize()}</a></div>' for c in sorted(CURATED)
    )
    main_content = (
        '<section class="page-hero page-hero-vve"><p class="eyebrow">Werkgebied</p>'
        '<h1>Gebouwschilrapportage door heel Nederland.</h1>'
        '<p>RoofSignal is gevestigd in Apeldoorn, maar werkt door het hele land. '
        'Dakinspectie, woningscan, VvE/MJOP-input of portefeuillescan \u2014 '
        '\u00e9\u00e9n inspectieprotocol, \u00e9\u00e9n rapportage-aanpak, onafhankelijk van waar uw object staat.</p></section>\n'
        '<section class="section muted"><p class="eyebrow orange center">Door heel Nederland</p>'
        f'<h2 class="centered-title">Werken per provincie.</h2><div class="cards four audience-cards">{prov_cards}</div></section>\n'
        '<section class="section"><p class="eyebrow orange center">Voorbeeldplaatsen</p>'
        f'<h2 class="centered-title">We komen naar uw object toe.</h2><div class="check-grid">{curated_links}</div></section>\n'
        '<section class="section split"><div><p class="eyebrow orange">Hoe het werkt</p>'
        '<h2>Bewijs boven reistijd.</h2>'
        '<p>We kiezen per object de passende opnamewijze: vanaf maaiveld, vanaf bestaande toegang, '
        'met een hoogwerker of met gerichte dronebeelden. Uw dak hoeft niet begaanbaar te zijn. '
        'We plannen opdrachten landelijk en bundelen objecten in dezelfde regio om de reiskosten zo laag mogelijk te houden.</p></div>'
        '<div class="trust-list">'
        '<div><strong>Gevestigd in Apeldoorn</strong><span>Midden op de Veluwe, maar actief in heel Nederland.</span></div>'
        '<div><strong>Passende opnamewijze</strong><span>Maaiveld, hoogwerker of gerichte dronebeelden \u2014 afhankelijk van de onderhoudsvraag.</span></div>'
        '<div><strong>Eerlijke reiskosten</strong><span>Reisafstand staat duidelijk in de offerte, zonder verrassingen achteraf.</span></div>'
        '<div><strong>Landelijke planning</strong><span>We bundelen opdrachten per regio en houden kosten zo laag mogelijk.</span></div>'
        '</div></section>\n'
        '<section class="cta"><h2>Heeft u een onderhoudsvraag, waar in Nederland dan ook?</h2>'
        '<a class="btn" href="contact">Vraag een offerte aan</a></section>'
    )
    start = doc.find("<main>")
    end = doc.find("</main>")
    assert start != -1 and end != -1 and end > start
    doc = doc[: start + len("<main>") + 1] + main_content + "\n" + doc[end:]
    open(f, "w", encoding="utf-8").write(doc)
    print("werkgebied.html: provincie-grid bijgewerkt")


def regenerate_sitemap():
    sf = os.path.join(ROOT, "sitemap.xml")
    old = open(sf, encoding="utf-8").read()
    existing = set(re.findall(r"<loc>(https://www\.roofsignal\.nl/[^<]*)</loc>", old))
    today = "2026-08-11"
    entries = []
    # behoud bestaande entries
    for m in re.finditer(r"<url>(.*?)</url>", old, re.S):
        block = m.group(1)
        loc = re.search(r"<loc>([^<]*)</loc>", block).group(1)
        entries.append((loc, block))
    # voeg nieuwe generieke pagina's toe
    new_locs = []
    for p in sorted(glob.glob(os.path.join(ROOT, "inspectie-*.html"))):
        slug_name = os.path.basename(p)[:-5]
        loc = f"{BASE}/{slug_name}"
        if loc not in existing and loc + "/" not in existing:
            new_locs.append((loc, "0.7"))
    for loc, prio in new_locs:
        entries.append((loc, f"<url><loc>{loc}</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>{prio}</priority></url>"))
    # sorteer stabiel (volgorde van de oude sitemap behouden, nieuwe alfabetisch achteraan is prima)
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, block in entries:
        if block.startswith("<url>"):
            lines.append("  " + block)
        else:
            lines.append("  <url>")
            for l in block.strip().split("\n"):
                lines.append("    " + l.strip())
            lines.append("  </url>")
    lines.append("</urlset>")
    open(sf, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"sitemap.xml: {len(new_locs)} nieuwe URL's toegevoegd")


if __name__ == "__main__":
    main()
