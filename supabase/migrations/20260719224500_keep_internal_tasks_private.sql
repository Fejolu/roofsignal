-- Internal operational tasks must never be exposed to customer accounts.

drop policy if exists "tasks visible by membership or internal" on public.tasks;

create policy "tasks visible by internal users"
on public.tasks for select to authenticated
using (public.is_internal_user());
