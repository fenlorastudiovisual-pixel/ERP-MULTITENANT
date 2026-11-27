-- ERP profesional — Fase 3: inventario multi-almacén, compras y proveedores.
-- Migración ADITIVA: no borra ni reescribe datos. Todas las tablas nuevas llevan
-- tenant_id y RLS forzado. El libro contable sigue siendo único por tenant.

-- Validaciones dentro de una transacción: lanza error real y revierte todo.
create or replace function public.erp_assert(condition boolean, message text default 'Validación ERP fallida')
returns boolean language plpgsql immutable as $$
begin
  if condition is not true then
    raise exception using message = message, errcode = '23514';
  end if;
  return true;
end $$;

alter table public.warehouses add column if not exists cost_center text;
alter table public.warehouses add column if not exists address text;
alter table public.stock_balances add column if not exists last_cost numeric(14,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_balances_quantity_nonnegative' and conrelid = 'public.stock_balances'::regclass
  ) then
    alter table public.stock_balances
      add constraint stock_balances_quantity_nonnegative check (quantity >= 0 and reserved >= 0);
  end if;
end $$;

-- ── Movimientos de inventario ────────────────────────────────────────────────
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number text not null,
  movement_type text not null, -- opening | transfer_out | transfer_in | adjustment | purchase_in | count
  item_id uuid not null references public.items(id) on delete cascade,
  from_warehouse_id uuid references public.warehouses(id),
  to_warehouse_id uuid references public.warehouses(id),
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null default 0,
  total_cost numeric(14,2) not null default 0,
  balance_after numeric(14,3) not null default 0,
  reason text,
  reference_type text,
  reference_id uuid,
  source_line_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid,
  unique (tenant_id, number)
);

-- Capas FIFO: entrada pendiente de consumir. También sirve como auditoría de costo.
create table if not exists public.inventory_cost_layers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  movement_id uuid references public.inventory_movements(id) on delete set null,
  quantity numeric(14,3) not null,
  remaining_qty numeric(14,3) not null,
  consumed_qty numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (remaining_qty >= 0 and consumed_qty >= 0)
);
alter table public.inventory_cost_layers add column if not exists updated_at timestamptz not null default now();

-- ── Conteos físicos ──────────────────────────────────────────────────────────
create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number text not null,
  warehouse_id uuid not null references public.warehouses(id),
  counted_at timestamptz not null default now(),
  status text not null default 'posted',
  reason text,
  notes text,
  difference_total numeric(14,2) not null default 0,
  journal_number text,
  created_by uuid,
  unique (tenant_id, number)
);

create table if not exists public.inventory_count_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  count_id uuid not null references public.inventory_counts(id) on delete cascade,
  item_id uuid not null references public.items(id),
  expected_qty numeric(14,3) not null,
  counted_qty numeric(14,3) not null,
  difference numeric(14,3) not null,
  unit_cost numeric(14,2) not null default 0,
  difference_cost numeric(14,2) not null default 0,
  line_order integer not null default 0
);

-- ── Compras: pedidos, recepciones y proveedores (maestro partners) ──────────
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number text not null,
  supplier_id uuid references public.partners(id),
  warehouse_id uuid references public.warehouses(id),
  status text not null default 'draft', -- draft | approved | partially_received | received | cancelled
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  received_total numeric(14,2) not null default 0,
  expected_date date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, number)
);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.purchase_orders(id) on delete cascade,
  item_id uuid not null references public.items(id),
  quantity numeric(14,3) not null,
  received_qty numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null,
  tax_rate numeric(6,4) not null default 0.19,
  tax_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  line_order integer not null default 0
);

create table if not exists public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number text not null,
  purchase_order_id uuid not null references public.purchase_orders(id),
  supplier_id uuid references public.partners(id),
  warehouse_id uuid not null references public.warehouses(id),
  receipt_date date not null default current_date,
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status text not null default 'posted',
  journal_number text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, number)
);

create table if not exists public.purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  receipt_id uuid not null references public.purchase_receipts(id) on delete cascade,
  order_line_id uuid references public.purchase_order_lines(id),
  item_id uuid not null references public.items(id),
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null,
  tax_rate numeric(6,4) not null default 0.19,
  tax_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  line_order integer not null default 0
);

-- Valoración: vista de consulta con costo promedio y costo FIFO por almacén.
create or replace view public.inventory_valuation as
select
  sb.tenant_id,
  sb.warehouse_id,
  sb.item_id,
  sb.quantity,
  sb.reserved,
  sb.average_cost,
  sb.last_cost,
  round(sb.quantity * sb.average_cost, 2) as average_value,
  coalesce((
    select round(sum(l.remaining_qty * l.unit_cost), 2)
    from public.inventory_cost_layers l
    where l.tenant_id = sb.tenant_id and l.item_id = sb.item_id and l.warehouse_id = sb.warehouse_id
  ), 0) as fifo_value
from public.stock_balances sb;

-- ── Índices ──────────────────────────────────────────────────────────────────
create index if not exists inventory_movements_tenant_idx on public.inventory_movements(tenant_id, occurred_at desc);
create index if not exists inventory_movements_item_idx on public.inventory_movements(tenant_id, item_id);
create index if not exists inventory_layers_lookup_idx on public.inventory_cost_layers(tenant_id, warehouse_id, item_id, received_at);
create index if not exists inventory_counts_tenant_idx on public.inventory_counts(tenant_id, counted_at desc);
create index if not exists inventory_count_lines_count_idx on public.inventory_count_lines(count_id, line_order);
create index if not exists purchase_orders_tenant_idx on public.purchase_orders(tenant_id, created_at desc, status);
create index if not exists purchase_order_lines_order_idx on public.purchase_order_lines(order_id, line_order);
create index if not exists purchase_receipts_tenant_idx on public.purchase_receipts(tenant_id, receipt_date desc);
create index if not exists purchase_receipt_lines_receipt_idx on public.purchase_receipt_lines(receipt_id, line_order);

-- ── RLS: mismo modelo que el núcleo ─────────────────────────────────────────
alter table public.inventory_movements enable row level security;
alter table public.inventory_cost_layers enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_lines enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_lines enable row level security;

drop policy if exists tenant_scoped on public.inventory_movements;
create policy tenant_scoped on public.inventory_movements for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.inventory_cost_layers;
create policy tenant_scoped on public.inventory_cost_layers for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.inventory_counts;
create policy tenant_scoped on public.inventory_counts for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.inventory_count_lines;
create policy tenant_scoped on public.inventory_count_lines for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.purchase_orders;
create policy tenant_scoped on public.purchase_orders for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.purchase_order_lines;
create policy tenant_scoped on public.purchase_order_lines for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.purchase_receipts;
create policy tenant_scoped on public.purchase_receipts for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.purchase_receipt_lines;
create policy tenant_scoped on public.purchase_receipt_lines for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

alter table public.inventory_movements force row level security;
alter table public.inventory_cost_layers force row level security;
alter table public.inventory_counts force row level security;
alter table public.inventory_count_lines force row level security;
alter table public.purchase_orders force row level security;
alter table public.purchase_order_lines force row level security;
alter table public.purchase_receipts force row level security;
alter table public.purchase_receipt_lines force row level security;
