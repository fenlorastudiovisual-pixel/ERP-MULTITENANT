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
  spec jsonb not null default '{}'::jsonb,
  status text not null check (status in ('pending','done','failed')),
  result jsonb,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (tenant_id, effect_id)
);

-- Migraciones parciales anteriores pudieron dejar el constraint v1.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'erp_workflow_effects_status_check'
      and conrelid = 'public.erp_workflow_effects'::regclass
  ) then
    alter table public.erp_workflow_effects
      drop constraint erp_workflow_effects_status_check;
  end if;
end $$;

alter table public.erp_workflow_effects
  add column if not exists spec jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_workflow_effects_status_v2'
      and conrelid = 'public.erp_workflow_effects'::regclass
  ) then
    alter table public.erp_workflow_effects
      add constraint erp_workflow_effects_status_v2
      check (status in ('pending','done','failed'));
  end if;
end $$;

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

-- ── Libros paralelos y derivación contable ───────────────────────────────────
create table if not exists public.erp_ledgers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid references public.erp_entities(id) on delete cascade,
  code text not null,
  kind text not null check (kind in ('operational','group','statutory','fiscal','budget')),
  currency char(3) not null default 'COP',
  is_base boolean not null default false,
  fiscal_year_start date,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create unique index if not exists erp_ledgers_one_base_idx
  on public.erp_ledgers (tenant_id) where is_base;

create table if not exists public.erp_posting_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  source_type text not null,
  ledger_id uuid not null references public.erp_ledgers(id) on delete cascade,
  account_map jsonb not null default '{}'::jsonb,
  dimension_map jsonb not null default '{}'::jsonb,
  rounding_account text not null default 'rounding_difference',
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code, ledger_id, source_type)
);

create table if not exists public.erp_derived_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  ledger_id uuid not null references public.erp_ledgers(id) on delete cascade,
  entity_id uuid references public.erp_entities(id) on delete set null,
  rule_id uuid references public.erp_posting_rules(id) on delete set null,
  entry_date date not null,
  currency char(3) not null,
  rate numeric(20,8) not null default 1,
  rate_type text not null default 'closing' check (rate_type in ('spot','closing','average','historical')),
  lines jsonb not null,
  total_debit numeric(18,2) not null,
  total_credit numeric(18,2) not null,
  status text not null default 'draft' check (status in ('draft','posted','reversed')),
  created_at timestamptz not null default now(),
  unique (tenant_id, source_type, source_id, ledger_id)
);

create index if not exists erp_derived_entries_source_idx
  on public.erp_derived_entries (tenant_id, source_type, source_id);

-- ── Tipos de cambio ──────────────────────────────────────────────────────────
create table if not exists public.erp_currency_rates (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rate_date date not null,
  from_currency char(3) not null,
  to_currency char(3) not null,
  rate_type text not null check (rate_type in ('spot','closing','average','historical')),
  rate numeric(20,8) not null check (rate > 0),
  source text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, rate_date, from_currency, to_currency, rate_type)
);

-- ── Consolidación de grupo ───────────────────────────────────────────────────
create table if not exists public.erp_consolidation_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  parent_group_id uuid,
  reporting_currency char(3) not null default 'COP',
  method text not null default 'full' check (method in ('full','equity','proportional','majority','minority')),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, id),
  constraint erp_consolidation_groups_parent_fk
    foreign key (tenant_id, parent_group_id)
    references public.erp_consolidation_groups (tenant_id, id)
    deferrable initially deferred
);

create table if not exists public.erp_consolidation_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  group_id uuid not null references public.erp_consolidation_groups(id) on delete cascade,
  entity_id uuid not null references public.erp_entities(id) on delete cascade,
  ownership numeric(7,4) not null check (ownership >= 0 and ownership <= 1),
  effective_from date not null,
  effective_to date,
  method text not null default 'full' check (method in ('full','equity','proportional','majority','minority')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, group_id, entity_id, effective_from),
  constraint erp_consolidation_members_dates check (effective_to is null or effective_to >= effective_from)
);

create index if not exists erp_consolidation_members_group_idx
  on public.erp_consolidation_members (tenant_id, group_id, effective_from, effective_to);

-- ── Intercompañía y eliminaciones ────────────────────────────────────────────
create table if not exists public.erp_intercompany_pairs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_a uuid not null references public.erp_entities(id) on delete cascade,
  entity_b uuid not null references public.erp_entities(id) on delete cascade,
  tolerance_minor bigint not null default 0,
  settlement_days integer not null default 30,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, entity_a, entity_b),
  constraint erp_intercompany_pairs_distinct check (entity_a <> entity_b)
);

create table if not exists public.erp_ic_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pair_id uuid references public.erp_intercompany_pairs(id) on delete set null,
  source_type text not null,
  source_id text not null,
  entity_id uuid not null references public.erp_entities(id) on delete cascade,
  counterparty_id uuid not null references public.erp_entities(id) on delete cascade,
  direction text not null check (direction in ('receivable','payable')),
  amount numeric(18,2) not null check (amount > 0),
  currency char(3) not null default 'COP',
  tax_amount numeric(18,2) not null default 0,
  transaction_date date not null,
  match_key text not null default '',
  status text not null default 'open' check (status in ('open','matched','eliminated','break')),
  created_at timestamptz not null default now(),
  unique (tenant_id, source_type, source_id)
);

create index if not exists erp_ic_transactions_match_idx
  on public.erp_ic_transactions (tenant_id, match_key, currency, transaction_date);

create table if not exists public.erp_elimination_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  group_id uuid not null references public.erp_consolidation_groups(id) on delete cascade,
  code text not null,
  kind text not null check (kind in ('revenue_expense','receivable_payable','inventory_profit','equity_nci')),
  rule jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, group_id, code)
);

create table if not exists public.erp_elimination_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  group_id uuid not null references public.erp_consolidation_groups(id) on delete cascade,
  period date not null,
  rule_id uuid references public.erp_elimination_rules(id) on delete set null,
  match_key text not null,
  currency char(3) not null default 'COP',
  lines jsonb not null,
  total_debit numeric(18,2) not null,
  total_credit numeric(18,2) not null,
  status text not null default 'draft' check (status in ('draft','posted')),
  created_at timestamptz not null default now(),
  unique (tenant_id, group_id, period, match_key, rule_id)
);

-- ── Event envelope / entregas / dead letters ─────────────────────────────────
create table if not exists public.erp_event_envelope (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  aggregate_type text,
  aggregate_id text,
  correlation_id text,
  causation_id text,
  schema_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (tenant_id, event_id)
);

create index if not exists erp_event_envelope_type_idx
  on public.erp_event_envelope (tenant_id, event_type, occurred_at desc);

create table if not exists public.erp_event_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  envelope_id uuid not null references public.erp_event_envelope(id) on delete cascade,
  subscription_id text not null,
  endpoint text not null,
  status text not null default 'pending' check (status in ('pending','delivered','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, envelope_id, subscription_id)
);

create table if not exists public.erp_dead_letters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  delivery_id uuid not null references public.erp_event_deliveries(id) on delete cascade,
  envelope_id uuid not null references public.erp_event_envelope(id) on delete cascade,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  failed_at timestamptz not null default now(),
  unique (tenant_id, delivery_id)
);

-- ── Feature flags / release train ────────────────────────────────────────────
create table if not exists public.erp_feature_flags (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  flag text not null,
  scope text not null default 'global',
  entity_id uuid,
  enabled boolean not null default false,
  rollout integer not null default 0 check (rollout >= 0 and rollout <= 100),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (tenant_id, flag, scope)
);

-- ── Agentes gobernados ───────────────────────────────────────────────────────
create table if not exists public.erp_agent_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  version integer not null default 1,
  name text not null,
  role text not null default 'tenant_user',
  autonomy text not null default 'propose' check (autonomy in ('propose','approve','execute')),
  approval_required boolean not null default true,
  tools jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, key, version)
);

create table if not exists public.erp_tool_allowlists (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_id uuid not null references public.erp_agent_definitions(id) on delete cascade,
  tool text not null,
  scopes jsonb not null default '[]'::jsonb,
  max_calls integer not null default 10,
  primary key (tenant_id, agent_id, tool)
);

create table if not exists public.erp_agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_id uuid references public.erp_agent_definitions(id) on delete set null,
  agent_key text,
  agent_version integer,
  entity_type text,
  entity_id text,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','executed','failed')),
  approval_required boolean not null default true,
  proposed jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  result jsonb,
  approval jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_agent_runs_status_idx
  on public.erp_agent_runs (tenant_id, status, created_at desc);

create table if not exists public.erp_approval_gates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid not null references public.erp_agent_runs(id) on delete cascade,
  gate_type text not null default 'human_approval',
  required_role text not null default 'admin',
  status text not null check (status in ('pending','approved','rejected')),
  decided_by uuid,
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (tenant_id, run_id, gate_type)
);

create table if not exists public.erp_agent_traces (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid not null references public.erp_agent_runs(id) on delete cascade,
  step integer not null,
  tool text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  duration_ms integer not null default 0,
  occurred_at timestamptz not null default now(),
  unique (tenant_id, run_id, step)
);

-- ── Auditoría inmutable con hash-chain ───────────────────────────────────────
create sequence if not exists public.erp_audit_events_seq;

alter table public.erp_audit_events add column if not exists reason text;
alter table public.erp_audit_events add column if not exists evidence_uri text;
alter table public.erp_audit_events add column if not exists hash_prev text;
alter table public.erp_audit_events add column if not exists hash text;
alter table public.erp_audit_events add column if not exists sequence_no bigint;

alter table public.erp_audit_events
  alter column sequence_no set default nextval('public.erp_audit_events_seq');

create or replace function public.erp_audit_hash(p_prev text, p_payload jsonb)
returns text language plpgsql immutable as $$
begin
  return encode(digest(coalesce(p_prev, '') || p_payload::text, 'sha256'), 'hex');
end $$;

create or replace function public.erp_audit_events_hash()
returns trigger language plpgsql as $$
declare
  prev_hash text;
begin
  select hash into prev_hash
  from public.erp_audit_events
  where tenant_id = new.tenant_id
  order by sequence_no desc nulls last, occurred_at desc, id desc
  limit 1;

  new.hash_prev := prev_hash;
  new.hash := public.erp_audit_hash(prev_hash, jsonb_build_object(
    'sequence_no', new.sequence_no,
    'tenant_id', new.tenant_id,
    'actor_id', new.actor_id,
    'actor_role', new.actor_role,
    'action', new.action,
    'object_type', new.object_type,
    'object_id', new.object_id,
    'before', new.before,
    'after', new.after,
    'metadata', new.metadata,
    'occurred_at', new.occurred_at
  ));
  return new;
end $$;

drop trigger if exists erp_audit_events_hash on public.erp_audit_events;
create trigger erp_audit_events_hash
  before insert on public.erp_audit_events
  for each row execute function public.erp_audit_events_hash();

create or replace function public.erp_audit_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception using
    message = 'erp_audit_events es append-only',
    errcode = '23514';
end $$;

drop trigger if exists erp_audit_events_no_update on public.erp_audit_events;
create trigger erp_audit_events_no_update
  before update on public.erp_audit_events
  for each row execute function public.erp_audit_events_immutable();

drop trigger if exists erp_audit_events_no_delete on public.erp_audit_events;
create trigger erp_audit_events_no_delete
  before delete on public.erp_audit_events
  for each row execute function public.erp_audit_events_immutable();

-- ── updated_at ───────────────────────────────────────────────────────────────
drop trigger if exists erp_entities_touch on public.erp_entities;
create trigger erp_entities_touch before update on public.erp_entities
  for each row execute function public.touch_updated_at();

drop trigger if exists erp_workflow_instances_touch on public.erp_workflow_instances;
create trigger erp_workflow_instances_touch before update on public.erp_workflow_instances
  for each row execute function public.touch_updated_at();

drop trigger if exists erp_ledgers_touch on public.erp_ledgers;
create trigger erp_ledgers_touch before update on public.erp_ledgers
  for each row execute function public.touch_updated_at();

drop trigger if exists erp_consolidation_groups_touch on public.erp_consolidation_groups;
create trigger erp_consolidation_groups_touch before update on public.erp_consolidation_groups
  for each row execute function public.touch_updated_at();

drop trigger if exists erp_agent_runs_touch on public.erp_agent_runs;
create trigger erp_agent_runs_touch before update on public.erp_agent_runs
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
      ('public.erp_audit_events', 'auditEvent'),
      ('public.erp_ledgers', 'ledger'),
      ('public.erp_posting_rules', 'postingRule'),
      ('public.erp_derived_entries', 'derivedEntry'),
      ('public.erp_currency_rates', 'currencyRate'),
      ('public.erp_consolidation_groups', 'consolidationGroup'),
      ('public.erp_consolidation_members', 'consolidationMember'),
      ('public.erp_intercompany_pairs', 'intercompanyPair'),
      ('public.erp_ic_transactions', 'intercompanyTransaction'),
      ('public.erp_elimination_rules', 'eliminationRule'),
      ('public.erp_elimination_entries', 'eliminationEntry'),
      ('public.erp_event_envelope', 'eventEnvelope'),
      ('public.erp_event_deliveries', 'eventDelivery'),
      ('public.erp_dead_letters', 'deadLetter'),
      ('public.erp_feature_flags', 'featureFlag'),
      ('public.erp_agent_definitions', 'agentDefinition'),
      ('public.erp_tool_allowlists', 'toolAllowlist'),
      ('public.erp_agent_runs', 'agentRun'),
      ('public.erp_approval_gates', 'approvalGate'),
      ('public.erp_agent_traces', 'agentTrace')
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
