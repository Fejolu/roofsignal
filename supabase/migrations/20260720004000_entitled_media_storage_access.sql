-- Allow customers to sign only media files within their purchased data depth.
create policy "customers read entitled inspection media"
on storage.objects for select to authenticated
using (
  bucket_id='inspection-media' and exists (
    select 1 from public.media_assets m
    join public.inspections i on i.id=m.inspection_id
    left join public.quote_items qi on qi.id=i.quote_item_id
    where m.storage_path=name and public.is_org_member(m.organization_id)
      and case m.required_depth when 'basis' then 1 when 'plus' then 2 else 3 end
        <= case coalesce(qi.inspection_depth,'basis') when 'basis' then 1 when 'plus' then 2 else 3 end
  )
);
