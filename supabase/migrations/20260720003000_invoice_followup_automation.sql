-- Idempotent invoice follow-up; safe to call daily from Supabase Cron.
create or replace function public.process_invoice_followups()
returns table(first_reminders integer, second_reminders integer)
language plpgsql security definer set search_path=public as $$
declare first_count integer := 0; second_count integer := 0;
begin
  update public.invoices set status='overdue', updated_at=now()
  where due_date < current_date and status in ('draft','sent','open');

  insert into public.invoice_events(invoice_id,organization_id,event_type,notes)
  select i.id,i.organization_id,'reminder_1','Automatische eerste betalingsherinnering'
  from public.invoices i
  where i.due_date < current_date and i.status='overdue'
    and not exists(select 1 from public.invoice_events e where e.invoice_id=i.id and e.event_type='reminder_1');
  get diagnostics first_count = row_count;

  insert into public.invoice_events(invoice_id,organization_id,event_type,notes)
  select i.id,i.organization_id,'reminder_2','Automatische tweede betalingsherinnering'
  from public.invoices i
  where i.due_date < current_date - 14 and i.status='overdue'
    and not exists(select 1 from public.invoice_events e where e.invoice_id=i.id and e.event_type='reminder_2');
  get diagnostics second_count = row_count;

  insert into public.tasks(organization_id,title,description,task_type,priority,status,due_at,assigned_role)
  select i.organization_id,'Bel klant over tweede betalingsherinnering',
    'Factuur '||coalesce(i.invoice_number,i.id::text)||' staat meer dan 14 dagen na vervaldatum open.',
    'finance','high','open',now() + interval '2 days','finance'::public.app_role
  from public.invoices i
  where i.due_date < current_date - 14 and i.status='overdue'
    and exists(select 1 from public.invoice_events e where e.invoice_id=i.id and e.event_type='reminder_2')
    and not exists(select 1 from public.tasks t where t.organization_id=i.organization_id and t.task_type='finance' and t.description like '%'||coalesce(i.invoice_number,i.id::text)||'%');

  return query select first_count, second_count;
end; $$;

revoke all on function public.process_invoice_followups() from public;
grant execute on function public.process_invoice_followups() to service_role;
