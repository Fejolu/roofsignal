alter table public.organizations
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists address text,
  add column if not exists kvk_number text,
  add column if not exists bank_account text;
