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


def test_operational_workflows_are_database_backed():
    admin = read("portal-beheer.html")
    script = read("assets/portal-admin.js")
    backend = read("assets/supabase-app.js")
    migration = read("supabase/migrations/20260719223000_portal_operational_workflows.sql")
    for marker in ("data-inspection-status-form", "data-finding-create-form", "data-report-create-form", "data-quote-create-form", "data-task-create-form"):
        assert marker in admin
    for method in ("createFinding", "createReport", "createQuote", "createTask", "updateInspection"):
        assert method in backend
        assert method in script
    assert "create table if not exists public.tasks" in migration
    assert "add column if not exists inspection_id" in migration


def test_customer_portal_renders_building_data_and_published_reports():
    script = read("assets/portal-admin.js")
    assert "building.gross_floor_area" in script
    assert "report.inspection_id" in script
    assert "renderCustomerFindings" in script


def test_customer_portal_uses_customer_focused_dashboard_and_copy():
    portal = read("portal-klant.html")
    assert "interne bedrijfssturing" not in portal
    assert "Platform v2" not in portal
    assert "Nieuw object toevoegen" not in portal
    for label in ("Objecten", "Inspecties", "Rapporten", "Bevindingen"):
        assert f"<span>{label}</span>" in portal


def test_internal_workflows_start_from_a_selected_customer():
    portal = read("portal-beheer.html")
    script = read("assets/portal-admin.js")
    assert "data-customer-workspace" in portal
    assert 'data-admin-action="manage-customer"' in script
    for action in ("customer-objects", "customer-inspection", "customer-quote", "customer-task"):
        assert f'data-admin-action="{action}"' in portal
    assert portal.count(' workflow-form"') == 3
    assert "closeWorkflowForms" in script
