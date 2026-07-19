-- Preserve the selected commercial depth and included scope per quote object.

alter table public.quote_items
  add column if not exists inspection_depth text not null default 'basis'
    check (inspection_depth in ('basis', 'plus', 'premium')),
  add column if not exists scope_snapshot jsonb not null default '{}'::jsonb;

create index if not exists quote_items_inspection_depth_idx
  on public.quote_items(inspection_depth);
