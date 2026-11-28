-- Sincronización controlada de precios del piloto Samjuro hacia Supabase.
-- Solo crea structure en la base del ERP (Neon). Nunca toca la Supabase de Samjuro.

create table if not exists public.samjuro_item_map (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null,
  source_table text, -- presentaciones | productos | null (SKU huérfano histórico)
  source_row_id uuid,
  source_sku text,
  column_name text, -- precio | precio_referencia
  primary key (tenant_id, item_id)
);

create table if not exists public.samjuro_price_sync (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null,
  sku text not null,
  source_table text not null,
  source_row_id uuid not null,
  column_name text not null,
  old_price numeric(14, 2) not null,
  new_price numeric(14, 2) not null,
  status text not null default 'pending', -- pending | synced | failed
  attempts integer not null default 0,
  last_error text,
  requested_by uuid,
  created_at timestamptz not null default now(),
  synced_at timestamptz,
  unique (tenant_id, item_id, source_row_id)
);

create index if not exists samjuro_price_sync_status_idx
  on public.samjuro_price_sync (tenant_id, status, created_at);
create index if not exists samjuro_item_map_sku_idx
  on public.samjuro_item_map (tenant_id, source_sku);

alter table public.samjuro_item_map enable row level security;
alter table public.samjuro_price_sync enable row level security;

drop policy if exists tenant_scoped on public.samjuro_item_map;
create policy tenant_scoped on public.samjuro_item_map for all to public
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists tenant_scoped on public.samjuro_price_sync;
create policy tenant_scoped on public.samjuro_price_sync for all to public
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- Un mismo ítem solo puede tener un cambio pendiente a la vez; al editarlo de nuevo se reemplaza.
