alter table public.invoices
  add column if not exists bank_account text not null default 'NL35INGB0700762019',
  add column if not exists account_holder text not null default 'FJ Joosten',
  add column if not exists payment_term_days integer not null default 14
    check (payment_term_days between 0 and 365);

comment on column public.invoices.bank_account is 'IBAN shown in invoice payment instructions.';
comment on column public.invoices.account_holder is 'Account holder shown in invoice payment instructions.';
comment on column public.invoices.payment_term_days is 'Contractual payment term in calendar days.';
