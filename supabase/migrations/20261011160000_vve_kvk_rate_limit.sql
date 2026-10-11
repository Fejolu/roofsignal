-- Shared budget across all function instances, including concurrent requests.
-- KVK calls are optional and must never affect the public-lead submission limit.
create or replace function public.consume_vve_kvk_lookup(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;
  perform pg_advisory_xact_lock(726641109);
  if (select count(*) from public.public_form_attempts
      where form_type = 'vve_kvk' and created_at >= now() - interval '24 hours') >= 100
    or (select count(*) from public.public_form_attempts
      where form_type = 'vve_kvk' and ip_hash = p_ip_hash
      and created_at >= now() - interval '1 hour') >= 10 then
    return false;
  end if;
  insert into public.public_form_attempts (ip_hash, form_type) values (p_ip_hash, 'vve_kvk');
  return true;
end;
$$;
revoke all on function public.consume_vve_kvk_lookup(text) from public, anon, authenticated;
grant execute on function public.consume_vve_kvk_lookup(text) to service_role;
create index if not exists public_form_attempts_type_time_idx
  on public.public_form_attempts (form_type, created_at desc);
