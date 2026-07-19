from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_protected_portal_surfaces_have_auth_pending_guards():
    assert 'data-portal-surface="internal"' in read("portal-beheer.html")
    assert 'data-portal-surface="internal"' in read("portal-klant-aanmaken.html")
    assert 'data-portal-surface="customer"' in read("portal-klant.html")
    assert "requirePortalAccess" in read("assets/supabase-app.js")


def test_live_portal_pages_do_not_ship_known_demo_customers():
    content = read("portal-beheer.html") + read("portal-klant.html")
    for demo_name in ("VvE Parkzicht", "Ten Hag Vastgoedbeheer", "MVGM VvE Beheer", "Logistiek Centrum Noord"):
        assert demo_name not in content


def test_customer_navigation_excludes_internal_management_modules():
    content = read("portal-klant.html")
    nav = content.split('<nav class="portal-nav">', 1)[1].split("</nav>", 1)[0]
    assert "#management" not in nav
    assert "#finance-hub" not in nav
    assert "#accountant-export" not in nav


def test_inspections_are_object_and_customer_owned():
    migration = read("supabase/migrations/20260719214500_portal_core_inspections.sql")
    assert "organization_id uuid not null" in migration
    assert "property_id uuid not null" in migration
    assert "references public.properties(id) on delete cascade" in migration
    assert '"inspections visible by membership or internal"' in migration


def test_admin_inspection_form_requires_customer_object_and_scope():
    content = read("portal-beheer.html")
    assert 'data-inspection-create-form' in content
    assert 'name="organization_id" required' in content
    assert 'name="property_id" required' in content
    assert 'name="scope"' in content


def test_browser_storage_is_not_used_as_operational_system_of_record():
    admin_script = read("assets/portal-admin.js")
    create_script = read("assets/portal-customer-create.js")
    assert "localStorage.setItem(stateKey" not in admin_script
    assert "localStorage.setItem(stateKey" not in create_script
    assert "Browser storage is not a system of record" in admin_script
