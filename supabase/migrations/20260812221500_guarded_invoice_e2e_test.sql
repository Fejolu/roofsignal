-- Keep internal invoice regression tests physically separated from customer mail.
alter table public.invoices
  add column if not exists is_test boolean not null default false,
  add column if not exists test_recipient text;

alter table public.invoices drop constraint if exists invoices_test_recipient_guard;
alter table public.invoices add constraint invoices_test_recipient_guard check (
  (not is_test and test_recipient is null)
  or (is_test and lower(test_recipient) ~ '^[^@[:space:]]+@roofsignal[.]nl$')
);

comment on column public.invoices.is_test is 'Internal E2E invoice; may never use a customer recipient.';
comment on column public.invoices.test_recipient is 'Required @roofsignal.nl recipient for internal E2E invoices.';
