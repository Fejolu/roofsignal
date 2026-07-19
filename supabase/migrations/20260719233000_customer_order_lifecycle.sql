-- Connect the commercial and operational lifecycle to one customer order.

alter table public.appointments
  add column if not exists quote_id uuid references public.quotes(id) on delete set null;

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  inspection_product text not null check (inspection_product in ('quickscan', 'object_report', 'portfolio_scan')),
  scope text,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, property_id)
);

alter table public.quote_items enable row level security;

create policy "quote items visible by membership or internal"
on public.quote_items for select to authenticated
using (public.is_internal_user() or public.is_org_member(organization_id));

create policy "quote items managed by internal"
on public.quote_items for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

alter table public.inspections
  add column if not exists quote_id uuid references public.quotes(id) on delete set null,
  add column if not exists quote_item_id uuid references public.quote_items(id) on delete set null,
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null;

alter table public.appointments
  add column if not exists quote_item_id uuid references public.quote_items(id) on delete set null;

alter table public.invoices
  add column if not exists property_id uuid references public.properties(id) on delete set null,
  add column if not exists inspection_id uuid references public.inspections(id) on delete set null;

create index if not exists appointments_quote_id_idx on public.appointments(quote_id);
create index if not exists appointments_quote_item_id_idx on public.appointments(quote_item_id);
create index if not exists quote_items_quote_id_idx on public.quote_items(quote_id);
create index if not exists quote_items_property_id_idx on public.quote_items(property_id);
create index if not exists inspections_quote_id_idx on public.inspections(quote_id);
create index if not exists inspections_quote_item_id_idx on public.inspections(quote_item_id);
create index if not exists inspections_appointment_id_idx on public.inspections(appointment_id);
create index if not exists invoices_property_id_idx on public.invoices(property_id);
create index if not exists invoices_inspection_id_idx on public.invoices(inspection_id);

drop trigger if exists quote_items_set_updated_at on public.quote_items;
create trigger quote_items_set_updated_at before update on public.quote_items
for each row execute function public.set_updated_at();
