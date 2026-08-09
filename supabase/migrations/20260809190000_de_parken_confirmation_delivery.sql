-- Track customer confirmations without exposing booking records to the public site.

alter table public.parken_bookings
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists confirmation_message_id text;

create index if not exists parken_bookings_confirmation_pending_idx
on public.parken_bookings (created_at)
where confirmation_sent_at is null and status = 'confirmation_pending';
