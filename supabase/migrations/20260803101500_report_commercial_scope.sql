-- A report is a deliverable of the accepted quote item, never a free-standing scope.

alter table public.reports
  add column if not exists quote_id uuid references public.quotes(id) on delete set null,
  add column if not exists quote_item_id uuid references public.quote_items(id) on delete set null,
  add column if not exists commercial_snapshot jsonb not null default '{}'::jsonb;

create index if not exists reports_quote_id_idx on public.reports(quote_id);
create index if not exists reports_quote_item_id_idx on public.reports(quote_item_id);

create or replace function public.publish_inspection_report(
  p_inspection_id uuid,
  p_title text,
  p_summary text default null
)
returns public.reports
language plpgsql
security definer
set search_path=public
as $$
declare
  v_inspection public.inspections%rowtype;
  v_quote public.quotes%rowtype;
  v_item public.quote_items%rowtype;
  v_report public.reports%rowtype;
  v_incomplete integer;
  v_snapshot jsonb;
begin
  if not public.is_internal_user() then raise exception 'Geen toestemming.'; end if;

  select * into v_inspection from public.inspections where id=p_inspection_id for update;
  if v_inspection.id is null then raise exception 'Inspectie niet gevonden.'; end if;
  if v_inspection.quote_id is null or v_inspection.quote_item_id is null then
    raise exception 'Deze inspectie is niet aan een geaccordeerde offerte gekoppeld.';
  end if;

  select * into v_quote from public.quotes where id=v_inspection.quote_id;
  select * into v_item from public.quote_items where id=v_inspection.quote_item_id;
  if v_quote.id is null or v_quote.status<>'accepted' then raise exception 'De gekoppelde offerte is niet geaccordeerd.'; end if;
  if v_item.id is null or v_item.quote_id<>v_quote.id or v_item.organization_id<>v_inspection.organization_id or v_item.property_id<>v_inspection.property_id then
    raise exception 'De objectregel van de offerte sluit niet aan op deze inspectie.';
  end if;

  select count(*) into v_incomplete
  from public.inspection_checklist_items c
  where c.inspection_id=p_inspection_id
    and case c.required_depth when 'basis' then 1 when 'plus' then 2 else 3 end
        <= case v_item.inspection_depth when 'basis' then 1 when 'plus' then 2 else 3 end
    and c.status in ('pending','blocked');
  if v_incomplete>0 then raise exception 'Rond eerst alle % relevante controlepunten uit de offertescope af.',v_incomplete; end if;

  v_snapshot=jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'accepted_at',v_quote.accepted_at,
    'accepted_by_name',v_quote.accepted_by_name,
    'quote_item_id',v_item.id,
    'property_id',v_item.property_id,
    'inspection_product',v_item.inspection_product,
    'inspection_depth',v_item.inspection_depth,
    'scope',v_item.scope,
    'scope_snapshot',v_item.scope_snapshot,
    'amount_ex_vat',v_item.amount,
    'captured_at',now()
  );

  select * into v_report from public.reports where inspection_id=p_inspection_id order by created_at desc limit 1 for update;
  if v_report.id is null then
    insert into public.reports(organization_id,property_id,inspection_id,quote_id,quote_item_id,title,summary,status,published_at,commercial_snapshot)
    values(v_inspection.organization_id,v_inspection.property_id,p_inspection_id,v_quote.id,v_item.id,trim(p_title),nullif(trim(p_summary),''),'published',now(),v_snapshot)
    returning * into v_report;
  else
    update public.reports set quote_id=v_quote.id,quote_item_id=v_item.id,title=trim(p_title),summary=nullif(trim(p_summary),''),status='published',published_at=now(),commercial_snapshot=v_snapshot,updated_at=now()
    where id=v_report.id returning * into v_report;
  end if;

  update public.findings set report_id=v_report.id
  where inspection_id=p_inspection_id
    and case required_depth when 'basis' then 1 when 'plus' then 2 else 3 end
        <= case v_item.inspection_depth when 'basis' then 1 when 'plus' then 2 else 3 end;
  update public.documents set customer_visible=true
  where inspection_id=p_inspection_id and document_type='inspection_report';
  update public.inspections set status='delivered',inspected_at=coalesce(inspected_at,now()),updated_at=now() where id=p_inspection_id;

  insert into public.audit_log(actor_id,action,table_name,record_id,metadata)
  values(auth.uid(),'report.published_from_accepted_scope','reports',v_report.id,v_snapshot);
  return v_report;
end $$;

grant execute on function public.publish_inspection_report(uuid,text,text) to authenticated;
