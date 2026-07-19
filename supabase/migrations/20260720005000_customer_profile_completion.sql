alter table public.profiles add column if not exists phone text, add column if not exists onboarding_completed_at timestamptz;

create or replace function public.complete_customer_profile(p_full_name text, p_phone text)
returns public.profiles language plpgsql security definer set search_path=public as $$
declare result public.profiles;
begin
  update public.profiles set full_name=nullif(trim(p_full_name),''), phone=nullif(trim(p_phone),''), onboarding_completed_at=now(), updated_at=now()
  where id=auth.uid() and role='customer' returning * into result;
  if result.id is null then raise exception 'Customer profile not found'; end if;
  return result;
end; $$;
revoke all on function public.complete_customer_profile(text,text) from public;
grant execute on function public.complete_customer_profile(text,text) to authenticated;
