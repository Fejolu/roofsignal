-- Existing quotes remain visual inspections with their original prices/terms.
-- New thermal-only quotes must never include the visual base charge.
alter table public.consumer_quotes
 add column inspection_type text not null default 'building_envelope'
 check (inspection_type in ('building_envelope', 'thermal'));

alter table public.consumer_quotes drop constraint consumer_quotes_check;
alter table public.consumer_quotes
 add constraint consumer_quote_product_thermal_check
 check (inspection_type <> 'thermal' or thermal),
 add constraint consumer_quote_product_total_check
 check (total_cents = (case when inspection_type = 'building_envelope' then 36179 else 0 end)
  + (case when thermal then 30250 else 0 end) + travel_cents);

-- RLS and the existing explicit service-role grants remain in force.
