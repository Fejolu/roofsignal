-- Add facade-only products without changing any historical offer or payment.
begin;
alter table public.consumer_quotes drop constraint consumer_quotes_inspection_type_check;
alter table public.consumer_quotes add constraint consumer_quotes_inspection_type_check check(inspection_type in('building_envelope','thermal','facade','facade_thermal'));
alter table public.consumer_quotes drop constraint consumer_quotes_pricing_version_check;
alter table public.consumer_quotes add constraint consumer_quotes_pricing_version_check check(pricing_version in('2026-10-11-thermal-legacy','2026-10-11-equal-standalone','2026-11-23-facade'));
alter table public.consumer_quotes add constraint consumer_quote_facade_version_check check(inspection_type not in('facade','facade_thermal') or pricing_version='2026-11-23-facade');
alter table public.consumer_quotes drop constraint consumer_quote_product_thermal_check;
alter table public.consumer_quotes add constraint consumer_quote_product_thermal_check check(inspection_type not in('thermal','facade_thermal') or thermal);
alter table public.consumer_quotes drop constraint consumer_quote_product_total_check;
alter table public.consumer_quotes add constraint consumer_quote_product_total_check check(total_cents=(case when inspection_type in('thermal','facade_thermal') then case when pricing_version='2026-10-11-thermal-legacy' then 30250 else 36179 end else 36179+case when thermal then 30250 else 0 end end)+travel_cents);
commit;
