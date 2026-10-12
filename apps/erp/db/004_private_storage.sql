-- Only the separately approved ERP test project. No public document links.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('erp-documents','erp-documents',false,10485760,array['application/pdf'])
  on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf'];

-- A restrictive policy prevents an unrelated permissive Storage policy from
-- accidentally making ERP documents readable or writable by end users.
-- There is deliberately no authenticated/anonymous allow-policy for this bucket.
-- Supabase's service_role bypasses RLS and stays exclusively in the server adapter.
do $$ declare existing record; begin
  select p.polpermissive,p.polcmd,p.polroles,pg_get_expr(p.polqual,p.polrelid) as qual,
    pg_get_expr(p.polwithcheck,p.polrelid) as checked into existing
    from pg_policy p where p.polrelid='storage.objects'::regclass and p.polname='roofsignal_erp_private_boundary';
  if found then
    if existing.polpermissive or existing.polcmd<>'*' or existing.polroles<>array[0::oid]
      or existing.qual is distinct from '(bucket_id <> ''erp-documents''::text)'
      or existing.checked is distinct from '(bucket_id <> ''erp-documents''::text)'
      then raise exception 'De bestaande ERP-opslaggrens wijkt af; controleer de inrichting'; end if;
  else
    create policy roofsignal_erp_private_boundary on storage.objects as restrictive for all to public
      using(bucket_id <> 'erp-documents') with check(bucket_id <> 'erp-documents');
  end if;
  if not exists(select 1 from storage.buckets where id='erp-documents' and not public
    and file_size_limit=10485760 and allowed_mime_types=array['application/pdf'])
    then raise exception 'ERP-documentopslag is niet afgeschermd'; end if;
end $$;
notify pgrst,'reload schema';
commit;
