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


def test_admin_inspection_form_requires_customer_object_product_and_depth():
    content = read("portal-beheer.html")
    assert 'data-inspection-create-form' in content
    assert 'name="organization_id" required' in content
    assert 'name="property_id" required' in content
    assert 'name="inspection_product" required' in content
    assert 'name="inspection_depth" required' in content
    assert 'name="scope"' in content
    for product in ("quickscan", "object_report", "portfolio_scan"):
        assert f'value="{product}"' in content
    for depth in ("basis", "plus", "premium"):
        assert f'value="{depth}"' in content


def test_inspections_store_product_and_depth_separately():
    migration = read("supabase/migrations/20260722090000_inspection_product_and_depth.sql")
    assert "inspection_product" in migration
    assert "inspection_depth" in migration
    assert "quickscan" in migration
    assert "object_report" in migration
    assert "portfolio_scan" in migration


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
    for method in ("createFinding", "publishInspectionReport", "createQuote", "createTask", "updateInspection"):
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


def test_quote_workflow_opens_from_customer_and_global_action():
    portal = read("portal-beheer.html")
    script = read("assets/portal-admin.js")
    customer_create = read("assets/portal-customer-create.js")
    assert 'data-admin-action="create-offer"' in portal
    assert "quoteForm.hidden = false" in script
    assert 'openCustomerWorkflow("quote")' in script
    for loader in ("listOrganizationContacts", "listCustomerActivities", "listMaintenanceActions"):
        assert loader in script
    assert 'sessionStorage.setItem("roofsignal-open-customer-id"' in customer_create
    assert 'sessionStorage.getItem("roofsignal-open-customer-id")' in script


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


def test_inspection_completion_requires_the_accepted_quote_scope():
    portal = read("portal-beheer.html")
    script = read("assets/portal-admin.js")
    assert "data-inspection-checklist" in portal
    assert "entitledChecklistRows" in script
    assert "Geaccordeerde opdracht" in script
    assert "binnen de offertescope" in script
    assert "quote?.status !== \"accepted\"" in script
    assert "Rapport kan nog niet worden gepubliceerd" in script
    assert "data-media-upload-form" in portal


def test_report_publication_keeps_an_immutable_commercial_snapshot():
    migration = read("supabase/migrations/20260803101500_report_commercial_scope.sql")
    backend = read("assets/supabase-app.js")
    assert "publish_inspection_report" in migration
    assert "commercial_snapshot" in migration
    assert "v_quote.status<>'accepted'" in migration
    assert "scope_snapshot" in migration
    assert "publish_inspection_report" in backend


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


def test_customer_portal_requests_are_persisted_and_create_internal_work():
    portal = read("portal-klant.html")
    script = read("assets/portal-admin.js")
    backend = read("assets/supabase-app.js")
    migration = read("supabase/migrations/20260720010000_customer_portal_requests_and_secure_upgrades.sql")
    assert 'data-customer-request-form="inspection"' in portal
    assert 'data-customer-request-form="support"' in portal
    assert "createCustomerRequest" in backend and "listCustomerRequests" in backend
    assert "submitCustomerRequest" in script
    assert "create table if not exists public.customer_requests" in migration
    assert "create_task_for_customer_request" in migration


def test_upgrade_price_is_calculated_server_side():
    backend = read("assets/supabase-app.js")
    migration = read("supabase/migrations/20260720010000_customer_portal_requests_and_secure_upgrades.sql")
    assert 'rpc("request_inspection_upgrade"' in backend
    assert "p_requested_depth" in migration
    assert "target_price - current_price" in migration
    assert 'drop policy if exists "customers request own upgrades"' in migration


def test_customer_can_select_each_object_and_download_invoice_document():
    portal = read("portal-klant.html")
    script = read("assets/portal-admin.js")
    assert "data-customer-property-id" in script
    assert "selectCustomerProperty" in script
    assert "Download factuur" in script
    assert '<th>Actie</th>' in portal


def test_prioritized_portal_improvements_are_kept_consistent():
    customer = read("portal-klant.html")
    admin = read("portal-beheer.html")
    script = read("assets/portal-admin.js")
    backend = read("assets/supabase-app.js")
    nav = customer.split('<nav class="portal-nav">', 1)[1].split("</nav>", 1)[0]
    for label in ("Overzicht", "Mijn objecten", "Afspraken", "Documenten", "Aanvragen & contact", "Account"):
        assert label in nav
    for internal_label in ("Intelligence", "Media", ">AI<"):
        assert internal_label not in nav
    assert 'class="dossier-workflow"' not in admin
    for target in ("klanten", "inspecties", "support", "facturen", "offertes"):
        assert f'data-admin-view-link="{target}"' in admin
    assert "propertyAddress" in script
    assert "formatPortalDateTime" in script
    assert 'accepted: { label: "Akkoord"' in script
    assert "item.amount" in script
    assert "properties(name,address,postcode,city)" in backend


def test_portal_auth_mail_and_routing_are_role_aware():
    page = read("portal-login.html")
    login = read("assets/portal-login.js")
    auth_function = read("supabase/functions/send-portal-login-link/index.ts")
    backend = read("assets/supabase-app.js")
    assert "klanten en medewerkers" in page
    assert 'name="remember"' not in page
    assert "friendlyAuthError" in login
    assert 'type PortalAudience = "customer" | "employee"' in auth_function
    assert 'role")' in auth_function
    assert 'audience: PortalAudience' in auth_function
    assert "Beheerportaal" in auth_function and "Klantenportaal" in auth_function
    assert 'action: "password_reset"' in backend
    assert "updatePassword" in backend


def test_veilig_is_not_used_as_generic_portal_or_marketing_copy():
    generic_copy_files = [
        "index.html",
        "werkwijze.html",
        "drone-dakinspectie.html",
        "portal-login.html",
        "assets/lead-capture.js",
        "assets/portal-login.js",
        "assets/quote-acceptance.js",
        "supabase/functions/send-portal-login-link/index.ts",
    ]
    for path in generic_copy_files:
        assert "veilig" not in read(path).lower()


def test_customer_self_service_journeys_are_real_and_scoped():
    page = read("portal-klant.html")
    portal = read("assets/portal-admin.js")
    backend = read("assets/supabase-app.js")
    migration = read("supabase/migrations/20260801160000_customer_self_service.sql")
    for marker in ["add-customer-object", "accept-customer-quote", "appointment-response", "data-request-message-form", "portal-notification-list", "data-object-assistant-form"]:
        assert marker in page or marker in portal
    for method in ["saveCustomerProperty", "archiveCustomerProperty", "acceptCustomerQuote", "respondToAppointment", "createRequestMessage", "listPortalNotifications"]:
        assert method in backend
    assert "customer_save_property" in migration
    assert "customer_accept_quote" in migration
    assert "customer_respond_appointment" in migration
    assert "public.is_org_member" in migration
    assert "payment_url" in migration


def test_quote_issue_and_acceptance_create_verifiable_final_document():
    issue = read("supabase/functions/send-quote-email/index.ts")
    acceptance = read("supabase/functions/quote-acceptance/index.ts")
    backend = read("assets/supabase-app.js")
    migration = read("supabase/migrations/20260805193000_quote_digital_execution.sql")
    quote_tool = read("tools/create_roofsignal_quote.py")
    assert "stampExecutionRegistration" in issue
    assert "pdf.getPageCount() !== 2" in issue
    assert 'event_type: "issued"' in issue
    assert "issued_document_hash" in issue
    assert "addCustomerAcceptance" in acceptance
    assert "pdf.getPageCount() !== 2" in acceptance
    assert 'event_type: "accepted"' in acceptance
    assert "accepted_document_hash" in acceptance
    assert 'action: "acceptAuthenticated"' in backend
    assert "quote_execution_events" in migration
    assert "document_hash text not null" in migration
    assert "Digitale acceptatie nog niet ontvangen" in quote_tool


def test_de_parken_booking_slot_check_qualifies_table_columns():
    base_migration = read("supabase/migrations/20260809173000_de_parken_pilot_bookings.sql")
    repair_migration = read("supabase/migrations/20260809201000_de_parken_unambiguous_slot_check.sql")
    for column in ["slot_date", "slot_time", "status"]:
        assert f"booking.{column}" in base_migration
    assert "booking.parken_bookings.slot_date" in repair_migration
    assert "booking.parken_bookings.slot_time" in repair_migration
    assert "from public.parken_bookings where slot_date=p_slot_date and slot_time=p_slot_time" in repair_migration
    assert "where slot_date=p_slot_date" not in base_migration


def test_de_parken_success_state_does_not_refocus_or_leave_pending_button():
    page = read("de-parken/index.html")
    booking = read("assets/de-parken-booking.js")
    assert 'checkPostcode({ focusFirstField: false })' in booking
    assert 'button.textContent = "Gereserveerd ✓"' in booking
    assert "de-parken-booking.js?v=5" in page
    assert "U betaalt na de inspectie" not in booking


def test_de_parken_booking_page_omits_payment_summary_block():
    page = read("de-parken/index.html")
    assert "booking-summary" not in page
    assert "vaste all-in pilotprijs" not in page
    assert "Geen vooruitbetaling" not in page


def test_de_parken_page_contains_no_internal_pilot_strategy_copy():
    page = read("de-parken/index.html")
    for internal_phrase in [
        "local-strategy",
        "rapportstructuur verder aanscherpen",
        "lokale referenties",
        "zakelijke vastgoedconnecties",
        "B2B-introducties",
        "zorgvuldig gevalideerd",
        "klantwaarde zorgvuldig te valideren",
    ]:
        assert internal_phrase not in page


def test_de_parken_sections_keep_alternating_background_after_strategy_removal():
    page = read("de-parken/index.html")
    independence = page.index('<section class="section split independence-band section-band-muted">')
    booking = page.index('<section class="section lead-section" id="aanvraag">')
    assert independence < booking
    assert ".section-band-muted" in page
    assert '<section class="section muted lead-section"' not in page


def test_de_parken_bookings_create_operational_backoffice_records():
    migration = read("supabase/migrations/20260809203000_sync_parken_bookings_to_backoffice.sql")
    for table in ["organizations", "properties", "appointments", "inspections"]:
        assert f"public.{table}" in migration
    assert "ferry@roofsignal.nl" in migration
    assert "inspector_id = v_inspector_id" in migration
    assert "at time zone 'Europe/Amsterdam'" in migration
    assert "parken_booking_backoffice_sync" in migration
    assert "for v_booking_id in select id from public.parken_bookings" in migration
    assert "set inspection_id = v_inspection_id" not in migration


def test_de_parken_confirmation_email_omits_payment_copy():
    confirmation = read("supabase/functions/send-parken-booking-confirmation/index.ts")
    assert "€356,95" not in confirmation
    assert "betaaltermijn" not in confirmation.lower()


def test_customer_portal_uses_one_control_and_alignment_system():
    styles = read("assets/styles.css")
    assert "--portal-control-height: 48px" in styles
    assert ".portal-body select" in styles
    assert "height: var(--portal-control-height)" in styles
    assert ".portal-layout > .portal-panel:only-child" in styles
    assert ".timeline-list .appointment-actions" in styles
    assert ".request-history-item .request-thread" in styles


def test_employee_roles_are_cumulative_and_include_inspector():
    admin = read("portal-beheer.html")
    employee = read("portal-medewerker.html")
    backend = read("assets/supabase-app.js")
    migration = read("supabase/migrations/20260802140001_multi_employee_roles.sql")
    assert "<option>Inspecteur</option>" in admin
    assert 'data-role-checkboxes' in employee
    assert "saveProfileRoles" in backend
    assert "profile_roles" in migration
    assert "role_definitions" in migration
    assert "current_user_has_role" in migration
    assert "('inspector','Inspecteur'" in migration
