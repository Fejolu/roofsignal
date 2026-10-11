-- Existing quotes and payments retain their offered price. The legacy default
-- also allows the previous backend to finish requests during deployment.
alter table public.consumer_quotes
 add column pricing_version text not null default '2026-10-11-thermal-legacy'
 check (pricing_version in ('2026-10-11-thermal-legacy', '2026-10-11-equal-standalone'));

alter table public.consumer_quotes drop constraint consumer_quote_product_total_check;
alter table public.consumer_quotes
 add constraint consumer_quote_product_total_check
 check (total_cents =
  (case when inspection_type = 'thermal'
    then case when pricing_version = '2026-10-11-thermal-legacy' then 30250 else 36179 end
    else 36179 + (case when thermal then 30250 else 0 end)
   end) + travel_cents);

-- No quote, payment attempt or accepted terms are repriced. Existing RLS and
-- explicit service-role grants continue to protect these records.
