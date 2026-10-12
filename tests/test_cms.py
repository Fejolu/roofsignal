"""End-to-end build checks for editable content, publication and retained booking behavior."""
import copy
import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET

from bs4 import BeautifulSoup
import pytest
import yaml

from tools.build_site import ROOT, apply_page, build, image_path, link_url, safe_html


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    return build(output=tmp_path_factory.mktemp("cms") / "site")


def fields(entries):
    for entry in entries:
        if entry["type"] == "group":
            yield from fields(entry["items"])
        else:
            yield entry


def test_config_and_page_slots_are_complete():
    source = (ROOT / ".pages.yml").read_text()
    # Pages CMS uses npm 'yaml' with its default alias expansion limit. A large
    # generated field list with shared anchors can crash its server-side render.
    assert not any(isinstance(event, yaml.events.AliasEvent) for event in yaml.parse(source))
    config = yaml.safe_load(source)
    def check_fields(schema, data):
        for field in schema:
            if field.get("required") or field["type"] == "object":
                assert field["name"] in data
            if field["type"] == "object":
                check_fields(field["fields"], data[field["name"]])
    pages = json.loads((ROOT / "tools/cms-pages.json").read_text())
    for entry in fields(config["content"]):
        if entry["type"] != "file":
            continue
        data = json.loads((ROOT / entry["path"]).read_text())
        check_fields(entry["fields"], data)
        assert entry["name"] in pages
    configured = {entry["name"] for entry in fields(config["content"]) if entry["type"] == "file"}
    assert set(pages) == configured
    assert "thermografische-inspectie" in configured


def test_render_preserves_form_contracts(built):
    pages = json.loads((ROOT / "tools/cms-pages.json").read_text())
    for entry in pages.values():
        old = BeautifulSoup((ROOT / entry["template"]).read_text(), "html.parser")
        new = BeautifulSoup((built / entry["template"]).read_text(), "html.parser")
        for selector in ["form", "input", "select", "textarea", "button"]:
            assert [str(n) for n in old.select(selector)] == [str(n) for n in new.select(selector)], (entry, selector)
        assert not new.select("[data-cms], [data-cms-image], [data-cms-link]")
        assert len(new.select("h1")) == 1
        assert new.select_one('link[rel="canonical"]')
    for path in (ROOT / "inspectie-boeken").rglob("*"):
        if path.is_file():
            assert path.read_bytes() == (built / path.relative_to(ROOT)).read_bytes()
    assert (ROOT / "de-parken/index.html").read_bytes() == (built / "de-parken/index.html").read_bytes()


def test_cleared_optional_text_is_removed_but_headings_remain_required():
    source = (ROOT / "index.html").read_text()
    data = json.loads((ROOT / "content/pages/index.json").read_text())
    parsed = BeautifulSoup(source, "html.parser")
    paragraph = parsed.select_one('[data-cms-kind="text"]')
    section, key = paragraph["data-cms"].split(".")
    data[section].pop(key, None)
    output = BeautifulSoup(apply_page(source, data, ROOT), "html.parser")
    assert paragraph.get_text(strip=True) not in output.body.get_text()
    section, key = parsed.h1["data-cms"].split(".")
    del data[section][key]
    with pytest.raises(ValueError, match="CMS-veld ontbreekt"):
        apply_page(source, data, ROOT)


def test_cms_no_edit_save_preserves_text_and_link_attributes():
    # The real editor adds <p> wrappers and drops empty optional fields on Save.
    source = (ROOT / "index.html").read_text()
    data = json.loads((ROOT / "content/pages/index.json").read_text())
    parsed = BeautifulSoup(source, "html.parser")
    for node in parsed.select('[data-cms-kind="rich-text"]'):
        section, key = node["data-cms"].split(".")
        data[section][key] = f"<p>{node.decode_contents()}</p>"
    output = BeautifulSoup(apply_page(source, data, ROOT), "html.parser")
    assert output.body.get_text(" ", strip=True) == parsed.body.get_text(" ", strip=True)
    public_attrs = lambda node: {k: v for k, v in node.attrs.items() if not k.startswith("data-cms")}
    assert [public_attrs(a) for a in output.select("a")] == [public_attrs(a) for a in parsed.select("a")]


def test_cms_edits_reach_html_and_seo_without_client_fetch():
    source = (ROOT / "index.html").read_text()
    data = json.loads((ROOT / "content/pages/index.json").read_text())
    h1 = BeautifulSoup(source, "html.parser").h1
    section, key = h1["data-cms"].split(".")
    data[section][key] = "Een nieuwe inspectietitel"
    data["seo"] = {"title": "Nieuwe zoekresultaattitel", "description": "Nieuwe omschrijving"}
    output = BeautifulSoup(apply_page(source, data, ROOT), "html.parser")
    assert output.h1.get_text() == "Een nieuwe inspectietitel"
    assert output.title.string == "Nieuwe zoekresultaattitel"
    assert output.find("meta", property="og:description")["content"] == "Nieuwe omschrijving"
    assert any(json.loads(s.string).get("name") == "Nieuwe zoekresultaattitel" for s in output.select('script[type="application/ld+json"]'))


def test_edited_rich_text_does_not_nest_paragraphs_or_allow_executable_markup():
    rendered = safe_html('<p>Hello <strong>world</strong></p><p><a href="javascript:alert(1)" onclick="evil()">test</a></p><script>evil()</script><iframe src="https://example.com"></iframe>', ROOT, inline=True)
    assert "<strong>world</strong>" in rendered
    assert "<p" not in rendered
    assert "javascript:" not in rendered
    assert "onclick" not in rendered
    assert "evil" not in rendered
    assert "iframe" not in rendered


@pytest.mark.parametrize("url", ["javascript:alert(1)", "data:text/html,bad", "//other.example", "https://example.com/\nattack", "\\evil"])
def test_unsafe_button_links_rejected(url):
    with pytest.raises(ValueError):
        link_url(url)


@pytest.mark.parametrize("url", ["https://tracker.example/a.png", "/assets/../docs/file.png", "/assets/%2e%2e/docs/file.png", "/missing.png", "/assets/missing.png"])
def test_unsafe_or_missing_images_rejected(url):
    with pytest.raises(ValueError):
        image_path(url, ROOT)


def test_only_public_files_are_deployed(built):
    for name in [".git", ".github", ".pages.yml", "content", "tools", "tests", "docs", "supabase", "output", "results", "work", "templates", "data"]:
        assert not (built / name).exists(), name
    assert (built / "_headers").is_file()
    assert (built / "downloads/RoofSignal-praktijkrapport-zutphen-geanonimiseerd.pdf").is_file()
    assert (built / "assets/supabase-config.js").is_file()


def test_article_publication_draft_and_unpublish(tmp_path):
    # A real build of an isolated repo copy exercises the CMS save → static site path.
    repo = tmp_path / "source"
    shutil.copytree(ROOT, repo, ignore=shutil.ignore_patterns(".git", "dist", "work", "output", "__pycache__", ".pytest_cache"))
    article = {"title": "Testartikel", "slug": "testartikel", "published": False, "date": "2026-10-11", "category": "Dakonderhoud", "description": "Nieuwe kennis uit een inspectie", "body": "<h2>Bevindingen</h2><p>Dit is de inhoud.</p>"}
    path = repo / "content/articles/testartikel.json"
    path.write_text(json.dumps(article))
    output = build(repo, tmp_path / "public")
    assert not (output / "kennisbank/testartikel/index.html").exists()
    assert "Testartikel" not in (output / "kennisbank.html").read_text()
    article["published"] = True
    path.write_text(json.dumps(article))
    build(repo, output)
    page = BeautifulSoup((output / "kennisbank/testartikel/index.html").read_text(), "html.parser")
    assert page.h1.string == "Testartikel"
    assert page.select_one('link[rel="canonical"]')["href"] == "https://www.roofsignal.nl/kennisbank/testartikel/"
    assert page.select_one('a[href="/inspectie-boeken/"]')
    assert 'href="/kennisbank/testartikel/"' in (output / "kennisbank.html").read_text()
    assert "https://www.roofsignal.nl/kennisbank/testartikel/" in (output / "sitemap.xml").read_text()
    ET.parse(output / "sitemap.xml")
    article["published"] = False
    path.write_text(json.dumps(article))
    build(repo, output)
    assert not (output / "kennisbank/testartikel/index.html").exists()
    assert "testartikel" not in (output / "sitemap.xml").read_text()


def test_build_refuses_existing_unowned_output_directory(tmp_path):
    (tmp_path / "important.txt").write_text("keep me")
    with pytest.raises(ValueError):
        build(output=tmp_path)
    assert (tmp_path / "important.txt").read_text() == "keep me"
