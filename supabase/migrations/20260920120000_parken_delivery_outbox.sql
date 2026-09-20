-- Every new booking gets one durable internal notification / Odoo handoff.
-- Existing bookings are deliberately not mailed retroactively.
create table public.parken_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique references public.parken_bookings(id) on delete cascade,
  reference text not null unique,
  is_test boolean not null default false,
  booking_snapshot jsonb,
  mail_payload jsonb,
  status text not null default 'pending' check (status in ('pending','processing','accepted','review')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  locked_at timestamptz,
  lock_token uuid,
  next_attempt_at timestamptz not null default now(),
  accepted_at timestamptz,
  message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  check ((is_test and booking_id is null and booking_snapshot is not null) or (not is_test and booking_id is not null))
);
alter table public.parken_delivery_outbox enable row level security;
revoke all on public.parken_delivery_outbox from anon, authenticated;
grant select on public.parken_delivery_outbox to authenticated;
grant all on public.parken_delivery_outbox to service_role;
create policy "internal users read delivery status" on public.parken_delivery_outbox
  for select to authenticated using (public.is_internal_user());
create index parken_delivery_due_idx on public.parken_delivery_outbox(next_attempt_at)
  where status in ('pending','processing');

create function public.enqueue_parken_delivery() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.parken_delivery_outbox(booking_id,reference) values(new.id,new.reference)
    on conflict(booking_id) do nothing;
  return new;
end;
$$;
revoke all on function public.enqueue_parken_delivery() from public, anon, authenticated;
create trigger parken_delivery_enqueue after insert on public.parken_bookings
  for each row execute function public.enqueue_parken_delivery();

-- Claim atomically, and freeze the final server-calculated booking including options.
-- Stop ambiguous retries well inside Brevo's idempotency TTL, rather than risk duplicates.
create function public.claim_parken_deliveries(p_reference text default null, p_test boolean default false)
returns setof public.parken_delivery_outbox
language plpgsql security definer set search_path=public as $$
begin
  update public.parken_delivery_outbox set status='pending',lock_token=null
    where status='processing' and locked_at < now()-interval '2 minutes'
      and is_test=p_test and (p_reference is null or reference=p_reference);
  update public.parken_delivery_outbox set status='review',last_error='RETRY_WINDOW_EXPIRED_CHECK_PROVIDER_LOGS'
    where status='pending' and first_attempt_at < now()-interval '12 minutes'
      and is_test=p_test and (p_reference is null or reference=p_reference);
  return query
    with due as (
      select q.id from public.parken_delivery_outbox q
      where q.status='pending' and q.next_attempt_at<=now() and q.is_test=p_test
        and (p_reference is null or q.reference=p_reference)
      order by q.created_at limit 5 for update skip locked
    )
    update public.parken_delivery_outbox q
    set status='processing',attempts=q.attempts+1,locked_at=now(),lock_token=gen_random_uuid(),
        first_attempt_at=coalesce(q.first_attempt_at,now()),
        booking_snapshot=coalesce(q.booking_snapshot,(select to_jsonb(b) from public.parken_bookings b where b.id=q.booking_id))
    from due where q.id=due.id returning q.*;
end;
$$;
revoke all on function public.claim_parken_deliveries(text,boolean) from public, anon, authenticated;
grant execute on function public.claim_parken_deliveries(text,boolean) to service_role;
