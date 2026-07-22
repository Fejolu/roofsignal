-- Store the commercial product and reporting depth separately from optional scope notes.

alter table public.inspections
  add column if not exists inspection_product text not null default 'object_report'
    check (inspection_product in ('quickscan', 'object_report', 'portfolio_scan')),
  add column if not exists inspection_depth text not null default 'basis'
    check (inspection_depth in ('basis', 'plus', 'premium'));

create index if not exists inspections_product_depth_idx
  on public.inspections(inspection_product, inspection_depth);
