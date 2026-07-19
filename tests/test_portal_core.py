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
    assert portal.count(' workflow-form"') == 4
    assert "closeWorkflowForms" in script


def test_quotes_support_multiple_objects_and_three_products():
    portal = read("portal-beheer.html")
    script = read("assets/portal-admin.js")
    migration = read("supabase/migrations/20260719233000_customer_order_lifecycle.sql")
    assert "data-quote-object-list" in portal
    for product in ("quickscan", "object_report", "portfolio_scan"):
        assert product in script
        assert product in migration
    assert "create table if not exists public.quote_items" in migration
    assert "quote_item_id" in migration


def test_quote_items_store_inspection_depth_and_scope_snapshot():
    script = read("assets/portal-admin.js")
    migration = read("supabase/migrations/20260719234500_quote_inspection_depth.sql")
    for depth, price in (("basis", "395"), ("plus", "595"), ("premium", "995")):
        assert f'{depth}:' in script
        assert f"price: {price}" in script
        assert depth in migration
    assert "scope_snapshot jsonb" in migration
    assert "depthSnapshot" in script


def test_premium_capture_is_filtered_by_purchased_entitlement():
    migration = read("supabase/migrations/20260719235500_premium_capture_entitlements.sql")
    script = read("assets/portal-admin.js")
    assert "capture_depth text not null default 'premium'" in migration
    assert "required_depth text not null default 'basis'" in migration
    assert '"findings visible within purchased depth"' in migration
    assert "qi.inspection_depth" in migration
    assert "renderCustomerEntitlements" in script
    assert "createUpgradeRequest" in read("assets/supabase-app.js")
    assert "activateUpgradeRequest" in read("assets/supabase-app.js")


def test_operational_backbone_covers_missing_core_domains():
    migration = read("supabase/migrations/20260720001000_operational_backbone.sql")
    for table in ("organization_contacts", "customer_activities", "product_catalog", "quote_versions", "order_confirmations", "inspection_checklist_items", "media_assets", "documents", "maintenance_actions", "invoice_lines", "invoice_events"):
        assert f"create table if not exists public.{table}" in migration
    assert "inspection-media" in migration
    assert "portal-documents" in migration


def test_inspection_completion_requires_premium_checklist():
    portal = read("portal-beheer.html")
    script = read("assets/portal-admin.js")
    assert "data-inspection-checklist" in portal
    assert "premiumChecklistRows" in script
    assert "Rapport kan nog niet worden gepubliceerd" in script
    assert "data-media-upload-form" in portal


def test_invoice_followup_is_idempotent_and_creates_call_task():
    migration = read("supabase/migrations/20260720003000_invoice_followup_automation.sql")
    assert "process_invoice_followups" in migration
    assert "reminder_1" in migration and "reminder_2" in migration
    assert "Bel klant over tweede betalingsherinnering" in migration
    assert "not exists" in migration.lower()


def test_selected_customer_opens_complete_dossier():
    portal = read("portal-beheer.html")
    script = read("assets/portal-admin.js")
    assert "data-customer-dossier-overview" in portal
    for section in ("Objecten", "Offertes", "Inspecties & rapporten", "Planning", "Facturen", "Open acties"):
        assert f'dossierItems("{section}"' in script
