-- ERP profesional — núcleo transaccional y módulo financiero.
-- Migración ADITIVA: no borra ni reescribe tablas existentes.
-- Todas las tablas llevan tenant_id y RLS forzado. Un solo libro contable por tenant.

-- ── Configuración modular (complementos dentro de la misma suite) ─────────────
create table if not exists public.erp_module_settings (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_code text not null,
  active boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_code)
);

create table if not exists public.role_permissions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null,
  permission text not null,
  allowed boolean not null default true,
  primary key (tenant_id, role, permission)
);

-- ── Maestros canónicos ───────────────────────────────────────────────────────
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'customer', -- customer | supplier | both
  document_type text not null default 'NIT',
  document text,
  name text not null,
  trade_name text,
  email text,
  phone text,
  city text,
  address text,
  payment_terms_days integer not null default 0,
  credit_limit numeric(14,2) not null default 0,
  tax_regime text not null default 'responsable_iva',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, document_type, document)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  category text not null default 'General',
  brand text not null default 'General',
  uom text not null default 'und',
  sale_price numeric(14,2) not null default 0,
  cost_price numeric(14,2) not null default 0,
  tax_rate numeric(6,4) not null default 0.19,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.stock_balances (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  quantity integer not null default 0,
  reserved integer not null default 0,
  average_cost numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, warehouse_id, item_id)
);

-- ── Numeración atómica ───────────────────────────────────────────────────────
create table if not exists public.sequences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  doc_type text not null,
  prefix text not null,
  period text not null default '',
  next_value bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, doc_type, prefix, period)
);

-- ── Contabilidad (libro único) ───────────────────────────────────────────────
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null, -- asset | liability | equity | revenue | expense
  nature text not null, -- debit | credit
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.periods (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  status text not null default 'open', -- open | closed
  closed_at timestamptz,
  closed_by uuid,
  primary key (tenant_id, year, month)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number text not null,
  entry_date date not null default current_date,
  description text not null,
  source_type text, -- invoice | payment | receipt | manual
  source_id uuid,
  total_debit numeric(14,2) not null default 0,
  total_credit numeric(14,2) not null default 0,
  status text not null default 'posted', -- posted | reversed
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, number)
);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  partner_id uuid,
  ref_type text,
  ref_id uuid,
  line_order integer not null default 0,
  check (debit >= 0 and credit >= 0)
);

-- ── Pedidos del nuevo núcleo ────────────────────────────────────────────────
create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number text not null,
  partner_id uuid references public.partners(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  status text not null default 'draft', -- draft | confirmed | delivered | invoiced | cancelled
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  currency char(3) not null default 'COP',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, number)
);

create table if not exists public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  cost_unit numeric(14,2) not null default 0,
  line_order integer not null default 0
);

-- ── Facturación operativa (NO es public.invoices de la plataforma) ──────────
create table if not exists public.invoices_ops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number text not null,
  prefix text not null default 'FV',
  partner_id uuid references public.partners(id) on delete set null,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  currency char(3) not null default 'COP',
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  status text not null default 'draft', -- draft | issued | partial | paid | credited | void
  uuid_dian text,
  qr_payload text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, number)
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.invoices_ops(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  description text not null,
  quantity integer not null,
  unit_price numeric(14,2) not null,
  discount numeric(14,2) not null default 0,
  tax_rate numeric(6,4) not null default 0.19,
  tax_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  line_order integer not null default 0
);

-- ── Cartera y cobros ─────────────────────────────────────────────────────────
create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.invoices_ops(id) on delete cascade,
  partner_id uuid references public.partners(id) on delete set null,
  amount numeric(14,2) not null,
  balance numeric(14,2) not null,
  due_date date,
  status text not null default 'open', -- open | partial | paid | overdue
  created_at timestamptz not null default now(),
  unique (tenant_id, invoice_id)
);

create table if not exists public.payments_in (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number text not null,
  partner_id uuid references public.partners(id) on delete set null,
  payment_date date not null default current_date,
  method text not null default 'transfer', -- cash | bank | transfer | card | pse
  amount numeric(14,2) not null,
  unapplied numeric(14,2) not null default 0,
  reference text,
  status text not null default 'registered',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, number)
);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_id uuid not null references public.payments_in(id) on delete cascade,
  receivable_id uuid not null references public.receivables(id) on delete cascade,
  amount numeric(14,2) not null,
  created_at timestamptz not null default now()
);

-- ── Índices ──────────────────────────────────────────────────────────────────
create index if not exists partners_tenant_idx on public.partners(tenant_id, name);
create index if not exists items_tenant_idx on public.items(tenant_id, active, name);
create index if not exists stock_balances_item_idx on public.stock_balances(tenant_id, item_id);
create index if not exists journal_entries_tenant_idx on public.journal_entries(tenant_id, entry_date desc);
create index if not exists journal_lines_entry_idx on public.journal_lines(entry_id, line_order);
create index if not exists sales_orders_tenant_idx on public.sales_orders(tenant_id, status, created_at desc);
create index if not exists sales_order_lines_order_idx on public.sales_order_lines(order_id, line_order);
create index if not exists invoices_ops_tenant_idx on public.invoices_ops(tenant_id, issue_date desc, status);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines(invoice_id, line_order);
create index if not exists receivables_tenant_idx on public.receivables(tenant_id, status, due_date);
create index if not exists payments_in_tenant_idx on public.payments_in(tenant_id, payment_date desc);
create index if not exists payment_allocations_payment_idx on public.payment_allocations(payment_id);
create index if not exists role_permissions_lookup_idx on public.role_permissions(tenant_id, role, allowed);

-- ── RLS: mismo modelo que el resto de la plataforma ─────────────────────────
alter table public.erp_module_settings enable row level security;
alter table public.role_permissions enable row level security;
alter table public.partners enable row level security;
alter table public.items enable row level security;
alter table public.warehouses enable row level security;
alter table public.stock_balances enable row level security;
alter table public.sequences enable row level security;
alter table public.accounts enable row level security;
alter table public.periods enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;
alter table public.invoices_ops enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.receivables enable row level security;
alter table public.payments_in enable row level security;
alter table public.payment_allocations enable row level security;

drop policy if exists tenant_scoped on public.erp_module_settings;
create policy tenant_scoped on public.erp_module_settings for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.role_permissions;
create policy tenant_scoped on public.role_permissions for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.partners;
create policy tenant_scoped on public.partners for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.items;
create policy tenant_scoped on public.items for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.warehouses;
create policy tenant_scoped on public.warehouses for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.stock_balances;
create policy tenant_scoped on public.stock_balances for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.sequences;
create policy tenant_scoped on public.sequences for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.accounts;
create policy tenant_scoped on public.accounts for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.periods;
create policy tenant_scoped on public.periods for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.journal_entries;
create policy tenant_scoped on public.journal_entries for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.journal_lines;
create policy tenant_scoped on public.journal_lines for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.sales_orders;
create policy tenant_scoped on public.sales_orders for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.sales_order_lines;
create policy tenant_scoped on public.sales_order_lines for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.invoices_ops;
create policy tenant_scoped on public.invoices_ops for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.invoice_lines;
create policy tenant_scoped on public.invoice_lines for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.receivables;
create policy tenant_scoped on public.receivables for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.payments_in;
create policy tenant_scoped on public.payments_in for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
drop policy if exists tenant_scoped on public.payment_allocations;
create policy tenant_scoped on public.payment_allocations for all to public
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

alter table public.erp_module_settings force row level security;
alter table public.role_permissions force row level security;
alter table public.partners force row level security;
alter table public.items force row level security;
alter table public.warehouses force row level security;
alter table public.stock_balances force row level security;
alter table public.sequences force row level security;
alter table public.accounts force row level security;
alter table public.periods force row level security;
alter table public.journal_entries force row level security;
alter table public.journal_lines force row level security;
alter table public.sales_orders force row level security;
alter table public.sales_order_lines force row level security;
alter table public.invoices_ops force row level security;
alter table public.invoice_lines force row level security;
alter table public.receivables force row level security;
alter table public.payments_in force row level security;
alter table public.payment_allocations force row level security;
