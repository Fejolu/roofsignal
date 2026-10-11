#!/usr/bin/env python3
"""Render Pages CMS content to static HTML; never publish source files or drafts.

Existing HTML is the layout/fallback; content/pages is the editorial source.
No client-side content fetch, access token or CMS dependency reaches the visitor.
"""
from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
import re
import shutil
import xml.etree.ElementTree as ET
from datetime import date
from urllib.parse import urlsplit, unquote

import bleach
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://www.roofsignal.nl"
INLINE_TAGS = {"a", "strong", "b", "em", "i", "u", "s", "br", "span", "small", "sub", "sup"}
BODY_TAGS = INLINE_TAGS | {"p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "hr", "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td"}
PUBLIC_DIRS = {"assets", "de-parken", "inspectie-boeken", "downloads", "legal"}
PUBLIC_FILES = {"_headers", "_redirects", "robots.txt", "sitemap.xml", "site.webmanifest"}
PUBLIC_SUFFIXES = {".html", ".js", ".mjs", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2", ".pdf", ".txt", ".webmanifest"}


def text(value, name, *, required=False, limit=200_000):
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(f"{name}: ongeldige tekst")
    if required and not value.strip():
        raise ValueError(f"{name}: vul dit veld in")
    return value


def image_path(value, root):
    value = text(value, "Afbeelding", required=True, limit=1000)
    parsed = urlsplit(value)
    path = unquote(parsed.path)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or not path.startswith("/assets/") or ".." in Path(path).parts or "\\" in path:
        raise ValueError("Afbeelding moet een lokaal bestand in /assets/ zijn")
    asset = (root / path.lstrip("/")).resolve()
    if not asset.is_relative_to((root / "assets").resolve()) or not asset.is_file() or asset.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".svg"}:
        raise ValueError(f"Afbeelding ontbreekt of heeft een ongeldig formaat: {path}")
    return value


def safe_html(value, root, *, inline=False):
    """Allow editorial formatting, never scripts, embeds, forms or inline CSS."""
    value = text(value, "Opgemaakte tekst")
    fragment = BeautifulSoup(value, "html.parser")
    for node in fragment.select("script, style, iframe, object, embed, form, input, button, textarea, select, svg, math"):
        node.decompose()
    if inline:
        # The WYSIWYG wraps inline paragraphs in <p>. Keep line breaks but not nested paragraphs.
        for p in fragment.find_all("p"):
            if p.find_next_sibling("p"):
                p.append(fragment.new_tag("br"))
                p.append(fragment.new_tag("br"))
            p.unwrap()
    attrs = {"a": ["href", "title"], "img": ["src", "alt", "title"], "ol": ["start"], "td": ["colspan", "rowspan"], "th": ["colspan", "rowspan"]}
    cleaned = bleach.clean(str(fragment), tags=INLINE_TAGS if inline else BODY_TAGS, attributes=attrs,
                           protocols={"https", "http", "mailto", "tel"}, strip=True, strip_comments=True)
    result = BeautifulSoup(cleaned, "html.parser")
    for img in result.find_all("img"):
        img["src"] = image_path(img.get("src", ""), root)
        img["loading"] = "lazy"
        img["decoding"] = "async"
    return result.decode_contents()


def get_field(data, path):
    value = data
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            raise ValueError(f"CMS-veld ontbreekt: {path}")
        value = value[part]
    return value


def link_url(value):
    value = text(value, "Bestemming", required=True, limit=2000)
    if any(ord(c) < 32 for c in value) or "\\" in value or value.startswith("//"):
        raise ValueError("Ongeldige link")
    scheme = urlsplit(value).scheme
    if scheme and scheme not in {"https", "http", "mailto", "tel"}:
        raise ValueError("Alleen web-, e-mail- en telefoonlinks zijn toegestaan")
    return value


def json_script(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def apply_page(source, data, root):
    soup = BeautifulSoup(source, "html.parser")
    # When a field still equals the fallback, retain the original fragment and attributes exactly.
    replacements = {}
    for node in soup.select("[data-cms]"):
        value = text(get_field(data, node["data-cms"]), node["data-cms"])
        old_text = node.get_text(" ", strip=True)
        kind = node.get("data-cms-kind")
        old = node.decode_contents()
        baseline = old if kind == "rich-text" else old_text
        if value != baseline:
            new = safe_html(value, root, inline=True) if kind == "rich-text" else html.escape(value).replace("\n", "<br>")
            node.clear()
            for child in list(BeautifulSoup(new, "html.parser").contents):
                node.append(child)
        replacements[old_text] = node.get_text(" ", strip=True)
    for node in soup.select("[data-cms-image]"):
        value = get_field(data, node["data-cms-image"])
        attr = "srcset" if node.name == "source" else "src"
        old_src = node.get(attr)
        node[attr] = image_path(value.get("src"), root)
        if node.name == "img":
            node["alt"] = text(value.get("alt", ""), "Beschrijving foto")
        # Update preloads/social images only when they pointed to this same picture.
        if old_src != node[attr]:
            for link in soup.select('link[rel="preload"][as="image"]'):
                if link.get("href") == old_src:
                    link["href"] = node[attr]
            for meta in soup.select('meta[property="og:image"], meta[name="twitter:image"]'):
                if meta.get("content") in {old_src, ORIGIN + old_src}:
                    meta["content"] = ORIGIN + node[attr]
    for node in soup.select("[data-cms-link]"):
        value = get_field(data, node["data-cms-link"])
        label = text(value.get("label"), "Linktekst", required=True, limit=500)
        destination = link_url(value.get("href"))
        if node.get_text(" ", strip=True) != label:
            node.string = label
        if node.get("href") != destination:
            # A changed destination is no longer the original tracked PDF download.
            node.attrs.pop("download", None)
            node.attrs.pop("data-report-download", None)
        node["href"] = destination
    title = text(data["seo"]["title"], "Paginatitel", required=True, limit=250)
    description = text(data["seo"]["description"], "Omschrijving", required=True, limit=1000)
    old_title = soup.title.get_text()
    desc_node = soup.find("meta", attrs={"name": "description"})
    old_description = desc_node.get("content", "") if desc_node else ""
    soup.title.string = title
    for meta in soup.select('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]'):
        meta["content"] = description
    for meta in soup.select('meta[property="og:title"],meta[name="twitter:title"]'):
        meta["content"] = title
    replacements[old_title] = title
    replacements[old_description] = description
    def update_schema(value):
        if isinstance(value, str):
            return replacements.get(value, value)
        if isinstance(value, list):
            return [update_schema(v) for v in value]
        if isinstance(value, dict):
            return {k: update_schema(v) for k, v in value.items()}
        return value
    for script in soup.select('script[type="application/ld+json"]'):
        script.string = json_script(update_schema(json.loads(script.string)))
    for node in soup.select("[data-cms], [data-cms-image], [data-cms-link]"):
        for attr in ["data-cms", "data-cms-kind", "data-cms-image", "data-cms-link"]:
            node.attrs.pop(attr, None)
    return str(soup)


def article_html(article, root, header, footer):
    title = text(article.get("title"), "Artikeltitel", required=True, limit=250)
    description = text(article.get("description"), "Omschrijving", required=True, limit=1000)
    category = text(article.get("category"), "Onderwerp", required=True, limit=100)
    body = safe_html(article.get("body"), root)
    if not BeautifulSoup(body, "html.parser").get_text(strip=True):
        raise ValueError("Een gepubliceerd artikel moet inhoud bevatten")
    published_date = date.fromisoformat(article["date"][:10]).isoformat()
    url = ORIGIN + "/kennisbank/" + article["slug"] + "/"
    image = image_path(article["image"], root) if article.get("image") else None
    alt = text(article.get("image_alt", ""), "Fotobeschrijving")
    if image and not alt.strip():
        raise ValueError("Vul een beschrijving bij de hoofdfoto in")
    e = html.escape
    schema = {"@context": "https://schema.org", "@type": "Article", "headline": title, "description": description,
              "datePublished": published_date, "mainEntityOfPage": url, "inLanguage": "nl-NL",
              "author": {"@type": "Organization", "name": "RoofSignal", "url": ORIGIN + "/over-ons"},
              "publisher": {"@type": "Organization", "name": "RoofSignal", "url": ORIGIN + "/"}}
    image_meta = ""
    photo = ""
    if image:
        schema["image"] = [ORIGIN + image]
        image_meta = f'<meta property="og:image" content="{e(ORIGIN + image)}"><meta name="twitter:image" content="{e(ORIGIN + image)}">'
        photo = f'<figure><img src="{e(image)}" alt="{e(alt)}" decoding="async"></figure>'
    # Shared navigation contains a few legacy relative paths; nested articles need root paths.
    def absolute(fragment):
        soup = BeautifulSoup(fragment, "html.parser")
        for a in soup.select("[href]"):
            href = a["href"]
            if not urlsplit(href).scheme and not href.startswith(("/", "#")):
                a["href"] = "/" + href
        return str(soup)
    return f'''<!doctype html><html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)} | RoofSignal</title><meta name="description" content="{e(description)}">
<link rel="canonical" href="{e(url)}"><meta name="robots" content="index,follow">
<link rel="icon" href="/assets/favicon.svg?v=3" type="image/svg+xml">
<meta property="og:type" content="article"><meta property="og:site_name" content="RoofSignal"><meta property="og:url" content="{e(url)}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(description)}">{image_meta}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{e(title)}"><meta name="twitter:description" content="{e(description)}">
<link rel="stylesheet" href="/assets/public.css?v=20260924-navigation"><link rel="stylesheet" href="/assets/site-public.css?v=20261011-booking-cta">
<link rel="stylesheet" href="/assets/knowledge-article.css?v=20260917">
<script type="application/ld+json">{json_script(schema)}</script>
<script src="/assets/analytics-config.js?v=20260921-privacy" defer></script><script src="/assets/analytics.js?v=20260921-privacy" defer></script>
</head><body class="rs-public"><a class="rs-skip" href="#main-content">Naar de inhoud</a>{absolute(header)}
<main id="main-content"><section class="rs-intro"><div class="rs-wrap"><p class="eyebrow orange"><a href="/kennisbank">Kennisbank</a> · {e(category)}</p>
<h1>{e(title)}</h1><p class="lead">{e(description)}</p></div></section>
<article class="rs-section"><div class="rs-wrap rs-knowledge-article"><p class="article-meta">Door RoofSignal · <time datetime="{published_date}">{date.fromisoformat(published_date).strftime('%d-%m-%Y')}</time></p>{photo}{body}</div></article>
</main>{absolute(footer)}</body></html>'''


def build(root=ROOT, output=None):
    root = Path(root).resolve()
    output = Path(output or root / "dist").resolve()
    # Never allow a typo in --output to erase source or another folder.
    if output == root or output in root.parents or output.exists() and not (output / ".roofsignal-build").is_file():
        raise ValueError("Outputmap moet nieuw zijn of een eerdere RoofSignal-build bevatten")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    (output / ".roofsignal-build").write_text("generated\n")
    # Explicit public allowlist: excludes repository internals, content sources, invoices and drafts.
    for path in root.iterdir():
        if path.is_file() and (path.suffix == ".html" or path.name in PUBLIC_FILES):
            shutil.copy2(path, output / path.name)
    for directory in sorted(PUBLIC_DIRS):
        for path in (root / directory).rglob("*"):
            if path.is_file() and not path.is_symlink() and path.suffix.lower() in PUBLIC_SUFFIXES and not any(p.startswith(".") for p in path.relative_to(root).parts):
                dest = output / path.relative_to(root)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, dest)
    manifest = json.loads((root / "tools/cms-pages.json").read_text())
    for slug, entry in manifest.items():
        data = json.loads((root / "content/pages" / f"{slug}.json").read_text())
        source = root / entry["template"]
        (output / entry["template"]).write_text(apply_page(source.read_text(), data, root))
    homepage = BeautifulSoup((output / "index.html").read_text(), "html.parser")
    header, footer = str(homepage.header), str(homepage.footer)
    articles = []
    for path in sorted((root / "content/articles").glob("*.json")):
        article = json.loads(path.read_text())
        if type(article.get("published", False)) is not bool:
            raise ValueError(f"{path.name}: Publiceren moet aan of uit zijn")
        if not article.get("published", False):
            continue
        slug = article.get("slug", "")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or slug != path.stem or len(slug) > 100:
            raise ValueError(f"{path.name}: ongeldig webadres of gewijzigde bestandsnaam")
        dest = output / "kennisbank" / slug / "index.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(article_html(article, root, header, footer))
        articles.append(article)
    if articles:
        articles.sort(key=lambda a: (a["date"], a["title"]), reverse=True)
        index = BeautifulSoup((output / "kennisbank.html").read_text(), "html.parser")
        section = index.new_tag("section", attrs={"class": "knowledge-library", "aria-label": "Nieuwe kennisartikelen"})
        cards = index.new_tag("div", attrs={"class": "knowledge-grid"})
        section.append(cards)
        for a in articles:
            card = index.new_tag("article", attrs={"class": "knowledge-card"})
            for tag, value, attrs in [("span", a["category"], {"class": "article-meta"}), ("h2", a["title"], {}), ("p", a["description"], {}), ("a", "Lees het artikel →", {"href": f'/kennisbank/{a["slug"]}/'})]:
                node = index.new_tag(tag, attrs=attrs); node.string = value; card.append(node)
            cards.append(card)
        index.main.find("section").insert_after(section)
        (output / "kennisbank.html").write_text(str(index))
        ns = "http://www.sitemaps.org/schemas/sitemap/0.9"
        ET.register_namespace("", ns)
        tree = ET.parse(output / "sitemap.xml")
        for a in articles:
            node = ET.SubElement(tree.getroot(), f"{{{ns}}}url")
            ET.SubElement(node, f"{{{ns}}}loc").text = f'{ORIGIN}/kennisbank/{a["slug"]}/'
            ET.SubElement(node, f"{{{ns}}}lastmod").text = a["date"][:10]
        tree.write(output / "sitemap.xml", encoding="utf-8", xml_declaration=True)
    print(f"Website gereed: {len(manifest)} CMS-pagina’s, {len(articles)} nieuwe gepubliceerde artikelen → {output}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    build(output=args.output)
