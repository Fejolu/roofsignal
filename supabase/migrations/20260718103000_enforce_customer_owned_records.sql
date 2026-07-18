-- Backoffice integrity: commercial and planning records must belong to a customer.
-- Orphan records are removed before the foreign keys are tightened.

delete from public.quotes where organization_id is null;
delete from public.invoices where organization_id is null;
delete from public.appointments where organization_id is null;

alter table public.quotes
  alter column organization_id set not null;

alter table public.invoices
  alter column organization_id set not null;

alter table public.appointments
  alter column organization_id set not null;

alter table public.quotes
  drop constraint if exists quotes_organization_id_fkey,
  add constraint quotes_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete cascade;

alter table public.invoices
  drop constraint if exists invoices_organization_id_fkey,
  add constraint invoices_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete cascade;

alter table public.appointments
  drop constraint if exists appointments_organization_id_fkey,
  add constraint appointments_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete cascade;
