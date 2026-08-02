create or replace function public.is_internal_user()
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_user_role() in ('support','planning','finance','reportage','hr','owner_admin') or public.is_roofsignal_user();
$$;

create or replace function public.is_hr_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_user_role() in ('hr','owner_admin');
$$;
