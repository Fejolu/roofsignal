-- Released portal documents are stored under organization-id paths.
create policy "organization members read portal documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'portal-documents'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
  and exists (select 1 from public.documents d where d.storage_path=name and d.customer_visible)
);
