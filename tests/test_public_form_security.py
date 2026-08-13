import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_all_public_forms_load_security_layer():
    pages = [ROOT / "index.html", ROOT / "contact.html", ROOT / "portal-login.html", ROOT / "de-parken" / "index.html"]
    for page in pages:
        source = page.read_text(encoding="utf-8")
        assert "form-security.js" in source


def test_leads_and_parken_use_verified_edge_functions():
    lead = (ROOT / "assets" / "lead-capture.js").read_text(encoding="utf-8")
    parken = (ROOT / "assets" / "de-parken-booking.js").read_text(encoding="utf-8")
    assert "/functions/v1/submit-public-lead" in lead
    assert "backend.submitLead" not in lead
    assert "/functions/v1/submit-parken-booking" in parken
    assert "backend.submitParkenBooking" not in parken


def test_backend_enforces_turnstile_honeypot_and_rate_limit():
    for name in ("submit-public-lead", "submit-parken-booking"):
        source = (ROOT / "supabase" / "functions" / name / "index.ts").read_text(encoding="utf-8")
        assert "TURNSTILE_SECRET_KEY" in source
        assert "siteverify" in source
        assert "company_website" in source
        assert "public_form_attempts" in source


def test_release_requires_security_secrets_and_functions():
    manifest = json.loads((ROOT / "supabase" / "release-manifest.json").read_text(encoding="utf-8"))
    assert "submit-public-lead" in manifest["functions"]
    assert "submit-parken-booking" in manifest["functions"]
    assert "TURNSTILE_SECRET_KEY" in manifest["required_secrets"]
    assert "FORM_RATE_LIMIT_SALT" in manifest["required_secrets"]
