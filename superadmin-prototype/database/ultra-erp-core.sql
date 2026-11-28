-- Ultra ERP — control plane aditivo. NO APLICADO AUTOMÁTICAMENTE.
-- Requiere: public.current_tenant_id(), public.is_superadmin(), public.erp_assert().
-- No contiene DELETE, TRUNCATE ni DROP TABLE. Solo CREATE IF NOT EXISTS,
-- ALTER ... ENABLE/FORCE RLS, DROP/CREATE POLICY y triggers.

create extension if not exists "pgcrypto";

-- ── Definiciones versionadas (equivalente a DocType, pero en BD) ──────────────
create table if not exists public.erp_metadata_definitions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  object_name text not null,
  version integer not null default 1,
  descriptor jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, object_name, version)
);

-- ── Jerarquía de entidades del holding ───────────────────────────────────────
create table if not exists public.erp_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  parent_id uuid,
  kind text not null check (kind in ('holding','company','branch','department','cost_center')),
  code text not null,
  name text not null,
  country char(2),
  currency char(3) not null default 'COP',
  attributes jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, id),
  constraint erp_entities_parent_fk
    foreign key (tenant_id, parent_id)
    references public.erp_entities (tenant_id, id)
    deferrable initially deferred
);

create index if not exists erp_entities_parent_idx on public.erp_entities (tenant_id, parent_id);
create index if not exists erp_entities_kind_idx on public.erp_entities (tenant_id, kind);

-- ── Políticas ABAC/RBAC ──────────────────────────────────────────────────────
create table if not exists public.erp_policies (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  object_type text not null,
  action text not null check (action in ('read','create','update','delete','approve','post')),
  role text not null,
  domain jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, object_type, action, role)
);

-- Evaluador central. role_permissions es la tabla existente del proyecto;
-- erp_policies añade dominios ABAC. Por ahora el dominio debe estar vacío;
-- la evaluación contextual se añadirá en la Fase 4.
create or replace function public.erp_has_permission(p_object text, p_action text)
returns boolean
language sql
stable
as $$
  select public.is_superadmin()
      or exists (
        select 1
        from public.role_permissions rp
        where rp.tenant_id = public.current_tenant_id()
          and rp.role = coalesce(nullif(current_setting('app.user_role', true), ''), 'viewer')
          and rp.permission = p_object || '.' || p_action
          and rp.allowed
      )
      or exists (
        select 1
        from public.erp_policies p
        where p.tenant_id = public.current_tenant_id()
          and p.object_type = p_object
          and p.action = p_action
          and p.role = coalesce(nullif(current_setting('app.user_role', true), ''), 'viewer')
          and p.enabled
          and (p.domain is null or p.domain = '{}'::jsonb)
      );
$$;

-- ── Workflows duraderos ──────────────────────────────────────────────────────
create table if not exists public.erp_workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  version integer not null default 1,
  definition jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, key, version)
);

create table if not exists public.erp_workflow_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  definition_key text not null,
  definition_version integer not null,
  entity_type text,
  entity_id uuid,
  state text not null,
  status text not null default 'active' check (status in ('active','retry','completed','cancelled')),
  context jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  attempts integer not null default 0,
  next_run_at timestamptz,
  error text,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists erp_workflow_instances_due_idx
  on public.erp_workflow_instances (tenant_id, next_run_at)
  where status = 'retry';

create table if not exists public.erp_workflow_effects (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  effect_id text not null,
  instance_id uuid not null references public.erp_workflow_instances(id) on delete cascade,
  status text not null check (status in ('done','failed')),
  result jsonb,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (tenant_id, effect_id)
);

-- ── Outbox / idempotencia / auditoría ────────────────────────────────────────
create table if not exists public.erp_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  event_type text not null,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processed','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);

create index if not exists erp_outbox_pending_idx
  on public.erp_outbox (tenant_id, available_at)
  where status = 'pending';

create table if not exists public.erp_idempotency_keys (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  scope text not null default 'workflow',
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (tenant_id, key)
);

create table if not exists public.erp_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid,
  actor_role text,
  action text not null,
  object_type text not null,
  object_id text not null,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists erp_audit_events_object_idx
  on public.erp_audit_events (tenant_id, object_type, object_id, occurred_at desc);

-- ── updated_at ───────────────────────────────────────────────────────────────
drop trigger if exists erp_entities_touch on public.erp_entities;
create trigger erp_entities_touch before update on public.erp_entities
  for each row execute function public.touch_updated_at();

drop trigger if exists erp_workflow_instances_touch on public.erp_workflow_instances;
create trigger erp_workflow_instances_touch before update on public.erp_workflow_instances
  for each row execute function public.touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- erp_policies y tablas de control usan solo aislamiento por tenant para
-- evitar recursión en erp_has_permission().

alter table public.erp_metadata_definitions enable row level security;
alter table public.erp_metadata_definitions force row level security;
drop policy if exists erp_metadata_definitions_tenant on public.erp_metadata_definitions;
create policy erp_metadata_definitions_tenant on public.erp_metadata_definitions
  for all to public
  using (public.is_superadmin() or tenant_id = public.current_tenant_id())
  with check (public.is_superadmin() or tenant_id = public.current_tenant_id());

alter table public.erp_policies enable row level security;
alter table public.erp_policies force row level security;
drop policy if exists erp_policies_tenant on public.erp_policies;
create policy erp_policies_tenant on public.erp_policies
  for all to public
  using (public.is_superadmin() or tenant_id = public.current_tenant_id())
  with check (public.is_superadmin() or tenant_id = public.current_tenant_id());

alter table public.erp_idempotency_keys enable row level security;
alter table public.erp_idempotency_keys force row level security;
drop policy if exists erp_idempotency_keys_tenant on public.erp_idempotency_keys;
create policy erp_idempotency_keys_tenant on public.erp_idempotency_keys
  for all to public
  using (public.is_superadmin() or tenant_id = public.current_tenant_id())
  with check (public.is_superadmin() or tenant_id = public.current_tenant_id());

-- Tablas de dominio: RLS por tenant + permiso lógico.
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('public.erp_entities', 'entity'),
      ('public.erp_workflow_definitions', 'workflowDefinition'),
      ('public.erp_workflow_instances', 'workflowInstance'),
      ('public.erp_workflow_effects', 'workflowInstance'),
      ('public.erp_outbox', 'outbox'),
      ('public.erp_audit_events', 'auditEvent')
    ) as t(table_name, object_name)
  loop
    execute format('alter table %s enable row level security', item.table_name);
    execute format('alter table %s force row level security', item.table_name);

    execute format('drop policy if exists %I on %s', 'erp_' || split_part(item.table_name, '.', 2) || '_tenant', item.table_name);
    execute format(
      'create policy %I on %s for all to public using (%s) with check (%s)',
      'erp_' || split_part(item.table_name, '.', 2) || '_tenant',
      item.table_name,
      format('public.is_superadmin() or (tenant_id = public.current_tenant_id() and public.erp_has_permission(%L, %L))', item.object_name, 'read'),
      format('public.is_superadmin() or (tenant_id = public.current_tenant_id() and public.erp_has_permission(%L, %L))', item.object_name, 'create')
    );
  end loop;
end $$;

-- Las declaraciones específicas por verbo se generan desde
-- lib/ultra/policies.js y se revisarán en la Fase 1 antes de aplicarlas.
