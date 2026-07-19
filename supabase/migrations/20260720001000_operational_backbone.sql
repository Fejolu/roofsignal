-- Operational backbone for the customer-first RoofSignal lifecycle.

create table if not exists public.organization_contacts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null, last_name text, email text, phone text, job_title text,
  is_primary boolean not null default false, is_billing boolean not null default false, is_operational boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.customer_activities (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.organization_contacts(id) on delete set null,
  activity_type text not null check (activity_type in ('note','email','call','meeting','system')),
  subject text not null, body text, occurred_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(), code text not null, version integer not null default 1,
  name text not null, variant text not null, depth text not null check (depth in ('basis','plus','premium')),
  price_ex_vat numeric(12,2) not null, currency text not null default 'EUR', coverage jsonb not null default '{}'::jsonb,
  active_from date not null default current_date, active_until date, is_active boolean not null default true,
  created_at timestamptz not null default now(), unique(code, version)
);

create table if not exists public.quote_versions (
  id uuid primary key default gen_random_uuid(), quote_id uuid not null references public.quotes(id) on delete cascade,
  version integer not null, snapshot jsonb not null, status text not null default 'draft',
  sent_at timestamptz, accepted_at timestamptz, accepted_by_name text, accepted_by_email text,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), unique(quote_id, version)
);

create table if not exists public.order_confirmations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete restrict, quote_version_id uuid references public.quote_versions(id) on delete set null,
  confirmation_number text unique, status text not null default 'draft' check (status in ('draft','sent','confirmed','cancelled')),
  document_url text, sent_at timestamptz, confirmed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.inspection_checklist_items (
  id uuid primary key default gen_random_uuid(), inspection_id uuid not null references public.inspections(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade, property_id uuid not null references public.properties(id) on delete cascade,
  building_element text not null, checkpoint text not null, required_depth text not null default 'basis' check (required_depth in ('basis','plus','premium')),
  status text not null default 'pending' check (status in ('pending','observed','not_observed','not_applicable','blocked')),
  notes text, evidence_required boolean not null default true, completed_at timestamptz, completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade, inspection_id uuid references public.inspections(id) on delete cascade,
  finding_id uuid references public.findings(id) on delete set null, checklist_item_id uuid references public.inspection_checklist_items(id) on delete set null,
  media_type text not null check (media_type in ('photo','thermal','video','three_d','other')),
  storage_path text not null unique, file_name text not null, mime_type text, byte_size bigint, captured_at timestamptz,
  required_depth text not null default 'basis' check (required_depth in ('basis','plus','premium')),
  metadata jsonb not null default '{}'::jsonb, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade, inspection_id uuid references public.inspections(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null, invoice_id uuid references public.invoices(id) on delete set null,
  document_type text not null, title text not null, storage_path text not null unique, version integer not null default 1,
  customer_visible boolean not null default false, required_depth text not null default 'basis' check (required_depth in ('basis','plus','premium')),
  metadata jsonb not null default '{}'::jsonb, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);

create table if not exists public.maintenance_actions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade, finding_id uuid references public.findings(id) on delete set null,
  inspection_id uuid references public.inspections(id) on delete set null, title text not null, description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','planned','in_progress','completed','verified','cancelled')),
  responsible_party text, due_date date, cost_min numeric(12,2), cost_max numeric(12,2), completed_at timestamptz,
  verification_inspection_id uuid references public.inspections(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null, quantity numeric(12,2) not null default 1, unit_price numeric(12,2) not null,
  vat_rate numeric(5,2) not null default 21, line_total numeric(12,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_events (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in ('created','sent','viewed','payment','reminder_1','reminder_2','credited','status_change')),
  amount numeric(12,2), notes text, occurred_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);

alter table public.invoices add column if not exists subtotal numeric(12,2), add column if not exists vat_amount numeric(12,2),
  add column if not exists total_amount numeric(12,2), add column if not exists sent_at timestamptz,
  add column if not exists paid_at timestamptz, add column if not exists credited_invoice_id uuid references public.invoices(id) on delete set null;

create sequence if not exists public.invoice_number_seq start 1000;
create or replace function public.assign_invoice_number() returns trigger language plpgsql as $$
begin if new.invoice_number is null then new.invoice_number := 'RS-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text,5,'0'); end if; return new; end; $$;
drop trigger if exists invoices_assign_number on public.invoices;
create trigger invoices_assign_number before insert on public.invoices for each row execute function public.assign_invoice_number();

do $$ declare t text; begin
  foreach t in array array['organization_contacts','customer_activities','product_catalog','quote_versions','order_confirmations','inspection_checklist_items','media_assets','documents','maintenance_actions','invoice_lines','invoice_events'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Organization-scoped records: customers may read their own data; internal users manage it.
do $$ declare t text; begin
  foreach t in array array['organization_contacts','customer_activities','order_confirmations','inspection_checklist_items','media_assets','documents','maintenance_actions','invoice_events'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_internal_user() or public.is_org_member(organization_id))', t || ' visible by membership', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user())', t || ' managed internally', t);
  end loop;
end $$;

create policy "product catalog readable" on public.product_catalog for select to authenticated using (true);
create policy "product catalog managed internally" on public.product_catalog for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy "quote versions visible through quote" on public.quote_versions for select to authenticated using (public.is_internal_user() or exists(select 1 from public.quotes q where q.id=quote_id and public.is_org_member(q.organization_id)));
create policy "quote versions managed internally" on public.quote_versions for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy "invoice lines visible through invoice" on public.invoice_lines for select to authenticated using (public.is_internal_user() or exists(select 1 from public.invoices i where i.id=invoice_id and public.is_org_member(i.organization_id)));
create policy "invoice lines managed internally" on public.invoice_lines for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());

-- Customers only see released documents/media and never data above the purchased entitlement.
drop policy if exists "media_assets visible by membership" on public.media_assets;
create policy "media visible within entitlement" on public.media_assets for select to authenticated using (
  public.is_internal_user() or (
    public.is_org_member(organization_id) and exists (
      select 1 from public.inspections i left join public.quote_items qi on qi.id=i.quote_item_id
      where i.id=media_assets.inspection_id and case media_assets.required_depth when 'basis' then 1 when 'plus' then 2 else 3 end <= case coalesce(qi.inspection_depth,'basis') when 'basis' then 1 when 'plus' then 2 else 3 end
    )
  )
);
drop policy if exists "documents visible by membership" on public.documents;
create policy "released documents visible" on public.documents for select to authenticated using (public.is_internal_user() or (customer_visible and public.is_org_member(organization_id)));

insert into storage.buckets (id,name,public) values ('inspection-media','inspection-media',false),('portal-documents','portal-documents',false) on conflict (id) do nothing;
create policy "internal uploads inspection media" on storage.objects for insert to authenticated with check (bucket_id='inspection-media' and public.is_internal_user());
create policy "internal manages inspection media" on storage.objects for all to authenticated using (bucket_id='inspection-media' and public.is_internal_user()) with check (bucket_id='inspection-media' and public.is_internal_user());
create policy "internal manages portal documents" on storage.objects for all to authenticated using (bucket_id='portal-documents' and public.is_internal_user()) with check (bucket_id='portal-documents' and public.is_internal_user());

do $$ declare t text; begin
  foreach t in array array['organization_contacts','order_confirmations','inspection_checklist_items','maintenance_actions'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

insert into public.product_catalog(code,version,name,variant,depth,price_ex_vat,coverage) values
('quickscan-basis',1,'Quickscan Basis','quickscan','basis',395,'{}'),
('quickscan-plus',1,'Quickscan Plus','quickscan','plus',595,'{}'),
('quickscan-premium',1,'Quickscan Premium','quickscan','premium',995,'{}'),
('object-report-basis',1,'Objectrapportage Basis','object_report','basis',395,'{}'),
('object-report-plus',1,'Objectrapportage Plus','object_report','plus',595,'{}'),
('object-report-premium',1,'Objectrapportage Premium','object_report','premium',995,'{}'),
('portfolio-scan-basis',1,'Portefeuillescan Basis','portfolio_scan','basis',395,'{}'),
('portfolio-scan-plus',1,'Portefeuillescan Plus','portfolio_scan','plus',595,'{}'),
('portfolio-scan-premium',1,'Portefeuillescan Premium','portfolio_scan','premium',995,'{}')
on conflict(code,version) do nothing;
