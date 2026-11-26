-- ERP Multitenant — esquema inicial de Postgres / Neon / Supabase
-- Modelo: Pool (compartido con tenant_id) con soporte para Bridge y Silo (esquema/BD propia).
-- La app fija app.tenant_id / app.user_role dentro de cada transacción (ver lib/db.js).
-- Las policies usan TO PUBLIC para funcionar igual en Neon y en Supabase.

create extension if not exists "pgcrypto";

-- Neon no trae auth.users; Supabase sí. Crear un equivalente mínimo si no existe.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

-- Login del Super Admin: hash PBKDF2 y control de intentos fallidos.
alter table auth.users add column if not exists password_hash text;
alter table auth.users add column if not exists active boolean not null default true;
alter table auth.users add column if not exists failed_attempts integer not null default 0;
alter table auth.users add column if not exists locked_until timestamptz;
alter table auth.users add column if not exists last_login_at timestamptz;
create unique index if not exists auth_users_email_lower_uidx on auth.users (lower(email));

-- ── Funciones de contexto de sesión ─────────────────────────────────────────
-- La aplicación establece: SET LOCAL app.tenant_id = '<uuid>'; al abrir la transacción del tenant.
create or replace function public.current_tenant_id()
returns uuid
language sql stable
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid;
$$;

-- Los roles globales se guardan en app.user_role; por defecto nadie es super admin.
create or replace function public.is_superadmin()
returns boolean
language sql stable
as $$
  select coalesce(current_setting('app.user_role', true), '') = 'super_admin';
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ── Planes y catálogo ────────────────────────────────────────────────────────
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  price_monthly numeric(14,2) not null default 0,
  currency char(3) not null default 'COP',
  badge text,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text not null,
  category text not null default 'core', -- core | extended | industry
  version text not null default '1.0.0',
  active boolean not null default true
);

create table if not exists public.plan_modules (
  plan_id uuid not null references public.plans(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  access text not null default 'included', -- included | addon | off
  primary key (plan_id, module_id)
);

create table if not exists public.plan_limits (
  plan_id uuid primary key references public.plans(id) on delete cascade,
  max_users integer not null default 5,
  max_sites integer not null default 1,
  max_products integer not null default 500,
  max_invoices_month integer not null default 100,
  storage_gb integer not null default 1,
  api_calls_month bigint not null default 10000,
  max_languages integer not null default 1,
  max_currencies integer not null default 1,
  audit_retention_days integer not null default 30,
  support_level text not null default 'community'
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text not null,
  description text,
  enabled boolean not null default false
);

create table if not exists public.plan_flags (
  plan_id uuid not null references public.plans(id) on delete cascade,
  flag_id uuid not null references public.feature_flags(id) on delete cascade,
  enabled boolean not null default false,
  primary key (plan_id, flag_id)
);

-- ── Tenants ──────────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  niche text,
  plan_id uuid references public.plans(id),
  country char(2),
  city text,
  status text not null default 'trial', -- trial | active | suspended | archived
  isolation_mode text not null default 'pool', -- pool | bridge | silo
  region text not null default 'america',
  owner_email text,
  health_score smallint,
  brand jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists tenants_touch on public.tenants;
create trigger tenants_touch before update on public.tenants for each row execute function public.touch_updated_at();
create index if not exists tenants_plan_idx on public.tenants(plan_id);
create index if not exists tenants_status_idx on public.tenants(status);

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain text unique not null,
  ssl_active boolean not null default false,
  white_label boolean not null default false
);

create table if not exists public.tenant_modules (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  enabled boolean not null default true,
  installed_at timestamptz not null default now(),
  primary key (tenant_id, module_id)
);

create table if not exists public.tenant_flags (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  flag_id uuid not null references public.feature_flags(id) on delete cascade,
  enabled boolean not null,
  note text,
  primary key (tenant_id, flag_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  starts_at timestamptz not null default now(),
  renews_at timestamptz,
  cancelled_at timestamptz,
  trial_until timestamptz,
  status text not null default 'active'
);
create index if not exists subscriptions_tenant_idx on public.subscriptions(tenant_id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number text not null,
  amount numeric(14,2) not null,
  currency char(3) not null default 'COP',
  status text not null default 'pending', -- pending | paid | failed | credited
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (tenant_id, number)
);
create index if not exists invoices_tenant_idx on public.invoices(tenant_id);

-- ── Identidad ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  global_role text, -- super_admin | support | sales | devops | finance | readonly
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'viewer',
  site_id uuid,
  active boolean not null default true,
  primary key (tenant_id, user_id)
);

-- ── Demos ────────────────────────────────────────────────────────────────────
create table if not exists public.demo_scenarios (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  niche text not null,
  size text not null default 'mediana',
  modules text[] not null default '{}',
  seed_data jsonb not null default '{}'::jsonb,
  star_flow text,
  kpi_label text,
  active boolean not null default true
);

create table if not exists public.demo_tenants (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid references public.demo_scenarios(id),
  prospect_name text,
  share_token text unique not null,
  expires_at timestamptz not null,
  status text not null default 'active', -- active | converted | expired
  visits integer not null default 0,
  tour_steps integer not null default 0,
  brand jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.demo_leads (
  id uuid primary key default gen_random_uuid(),
  demo_id uuid not null references public.demo_tenants(id) on delete cascade,
  name text,
  email text not null,
  company text,
  phone text,
  captured_at timestamptz not null default now()
);

-- ── Auditoría ────────────────────────────────────────────────────────────────
-- Tabla de solo inserción: no se actualiza ni se borra desde la aplicación.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid,
  actor_id uuid references public.profiles(id),
  actor_role text,
  action text not null,
  object_type text,
  object_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists audit_log_tenant_idx on public.audit_log(tenant_id, occurred_at desc);
create index if not exists audit_log_actor_idx on public.audit_log(actor_id, occurred_at desc);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Cada tabla operativa: el tenant_id se inyecta desde la sesión, nunca del cliente.
alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_modules enable row level security;
alter table public.tenant_flags enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.tenant_members enable row level security;
alter table public.audit_log enable row level security;

-- Los tenants solo pueden verse a sí mismos; el super admin gestiona metadatos.
drop policy if exists tenants_isolation on public.tenants;
create policy tenants_isolation on public.tenants
  for all to public
  using (id = public.current_tenant_id() or public.is_superadmin())
  with check (id = public.current_tenant_id() or public.is_superadmin());

drop policy if exists tenant_scoped on public.tenant_domains;
create policy tenant_scoped on public.tenant_domains
  for all to public
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists tenant_scoped on public.tenant_modules;
create policy tenant_scoped on public.tenant_modules
  for all to public
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists tenant_scoped on public.tenant_flags;
create policy tenant_scoped on public.tenant_flags
  for all to public
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists tenant_scoped on public.subscriptions;
create policy tenant_scoped on public.subscriptions
  for all to public
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists tenant_scoped on public.invoices;
create policy tenant_scoped on public.invoices
  for all to public
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists tenant_scoped on public.tenant_members;
create policy tenant_scoped on public.tenant_members
  for all to public
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log
  for select to public
  using (tenant_id = public.current_tenant_id() or public.is_superadmin());

-- El super admin no lee datos operativos por defecto: para entrar a un negocio
-- debe abrir una sesión de impersonación que fija app.tenant_id y escribe en audit_log.

-- ── Estado del prototipo (persistencia real del Super Admin) ──────────────────
-- Mientras las secciones operativas se normalizan, el estado de la consola se guarda
-- aquí como JSONB. Solo el super admin puede leerlo o escribirlo.
create table if not exists public.app_state (
  id text primary key default 'main',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_state enable row level security;
drop policy if exists app_state_admin on public.app_state;
create policy app_state_admin on public.app_state
  for all to public
  using (public.is_superadmin())
  with check (public.is_superadmin());
-- La primera fila la crea la app con su sesión de super admin (PUT /api/state).

-- ── FORCE RLS ────────────────────────────────────────────────────────────────
-- En Neon la app conecta como dueño de las tablas; sin FORCE, el dueño evadiría
-- todas las policies anteriores. FORCE obliga a que RLS se aplique también a él.
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert to public
  with check (public.is_superadmin() or tenant_id = public.current_tenant_id());

alter table public.tenants force row level security;
alter table public.tenant_domains force row level security;
alter table public.tenant_modules force row level security;
alter table public.tenant_flags force row level security;
alter table public.subscriptions force row level security;
alter table public.invoices force row level security;
alter table public.tenant_members force row level security;
alter table public.audit_log force row level security;
alter table public.app_state force row level security;

-- ── Normalización operativa (fase 2) ──────────────────────────────────────────
-- Correspondencia con el estado original del Super Admin. Los UUID son
-- deterministas (ver lib/state-sync.js), por lo que la migración es idempotente.
-- Esta sección solo añade objetos: no borra ni reescribe datos existentes.

alter table public.plans add column if not exists source_key text unique;
alter table public.modules add column if not exists source_key text unique;
alter table public.feature_flags add column if not exists source_key text unique;
alter table public.tenants add column if not exists source_key text unique;
alter table public.tenants add column if not exists country_name text;
alter table public.tenants add column if not exists mrr numeric(14,2) not null default 0;
alter table public.tenants add column if not exists users_count integer not null default 0;
alter table public.subscriptions add column if not exists source_key text unique;
alter table public.demo_scenarios add column if not exists source_key text unique;
alter table public.demo_scenarios add column if not exists icon text;
alter table public.demo_scenarios add column if not exists color text;
alter table public.demo_scenarios add column if not exists seed_text text;
alter table public.demo_scenarios add column if not exists notes text;
alter table public.demo_tenants add column if not exists source_key text unique;
alter table public.demo_tenants add column if not exists name text;
alter table public.demo_tenants add column if not exists icon text;
alter table public.demo_tenants add column if not exists color text;
alter table public.demo_tenants add column if not exists size text;
alter table public.demo_tenants add column if not exists language text;
alter table public.demo_tenants add column if not exists modules text[] not null default '{}';
alter table public.demo_tenants add column if not exists leads_count integer not null default 0;
alter table public.profiles add column if not exists source_key text unique;
alter table public.profiles add column if not exists scope text;
alter table public.profiles add column if not exists state text;

create table if not exists public.platform_config (
  id text primary key default 'main',
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.languages (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  code text unique not null,
  name text not null,
  native_name text,
  translated smallint not null default 0,
  state text
);

create table if not exists public.translations (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  key text unique not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  name text,
  email text,
  company text,
  phone text,
  demo text,
  captured_date date,
  created_at timestamptz not null default now()
);
create index if not exists leads_demo_idx on public.leads(demo);

-- Las tablas de catálogo las gestiona solo el Super Admin. Los tenant readings
-- se añadirán cuando se despliegue la app del cliente.
drop policy if exists superadmin_all on public.plans;
create policy superadmin_all on public.plans for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.modules;
create policy superadmin_all on public.modules for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.plan_modules;
create policy superadmin_all on public.plan_modules for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.plan_limits;
create policy superadmin_all on public.plan_limits for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.feature_flags;
create policy superadmin_all on public.feature_flags for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.plan_flags;
create policy superadmin_all on public.plan_flags for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.demo_scenarios;
create policy superadmin_all on public.demo_scenarios for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.demo_tenants;
create policy superadmin_all on public.demo_tenants for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.demo_leads;
create policy superadmin_all on public.demo_leads for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.profiles;
create policy superadmin_all on public.profiles for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.platform_config;
create policy superadmin_all on public.platform_config for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.languages;
create policy superadmin_all on public.languages for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.translations;
create policy superadmin_all on public.translations for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists superadmin_all on public.leads;
create policy superadmin_all on public.leads for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());

-- El Super Admin también sincroniza tablas por tenant desde la consola.
drop policy if exists tenant_scoped on public.tenant_domains;
create policy tenant_scoped on public.tenant_domains for all to public
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());
drop policy if exists tenant_scoped on public.tenant_modules;
create policy tenant_scoped on public.tenant_modules for all to public
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());
drop policy if exists tenant_scoped on public.tenant_flags;
create policy tenant_scoped on public.tenant_flags for all to public
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());
drop policy if exists tenant_scoped on public.subscriptions;
create policy tenant_scoped on public.subscriptions for all to public
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());
drop policy if exists tenant_scoped on public.invoices;
create policy tenant_scoped on public.invoices for all to public
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());
drop policy if exists tenant_scoped on public.tenant_members;
create policy tenant_scoped on public.tenant_members for all to public
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());

alter table public.plans enable row level security;
alter table public.modules enable row level security;
alter table public.plan_modules enable row level security;
alter table public.plan_limits enable row level security;
alter table public.feature_flags enable row level security;
alter table public.plan_flags enable row level security;
alter table public.demo_scenarios enable row level security;
alter table public.demo_tenants enable row level security;
alter table public.demo_leads enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_config enable row level security;
alter table public.languages enable row level security;
alter table public.translations enable row level security;
alter table public.leads enable row level security;

alter table public.plans force row level security;
alter table public.modules force row level security;
alter table public.plan_modules force row level security;
alter table public.plan_limits force row level security;
alter table public.feature_flags force row level security;
alter table public.plan_flags force row level security;
alter table public.demo_scenarios force row level security;
alter table public.demo_tenants force row level security;
alter table public.demo_leads force row level security;
alter table public.profiles force row level security;
alter table public.platform_config force row level security;
alter table public.languages force row level security;
alter table public.translations force row level security;
alter table public.leads force row level security;

-- La identidad también queda tras RLS. El rol administrador (BYPASSRLS) sigue
-- funcionando para migraciones; el rol de la app solo ve filas con contexto.
alter table auth.users enable row level security;
drop policy if exists superadmin_all on auth.users;
create policy superadmin_all on auth.users for all to public
  using (public.is_superadmin()) with check (public.is_superadmin());
alter table auth.users force row level security;

-- Las sesiones de tenant pueden leer el catálogo para mostrar su propio plan.
drop policy if exists catalog_read on public.plans;
create policy catalog_read on public.plans for select to public
  using (public.current_tenant_id() is not null or public.is_superadmin());
drop policy if exists catalog_read on public.modules;
create policy catalog_read on public.modules for select to public
  using (public.current_tenant_id() is not null or public.is_superadmin());
drop policy if exists catalog_read on public.plan_modules;
create policy catalog_read on public.plan_modules for select to public
  using (public.current_tenant_id() is not null or public.is_superadmin());
drop policy if exists catalog_read on public.plan_limits;
create policy catalog_read on public.plan_limits for select to public
  using (public.current_tenant_id() is not null or public.is_superadmin());
drop policy if exists catalog_read on public.feature_flags;
create policy catalog_read on public.feature_flags for select to public
  using (public.current_tenant_id() is not null or public.is_superadmin());
drop policy if exists catalog_read on public.plan_flags;
create policy catalog_read on public.plan_flags for select to public
  using (public.current_tenant_id() is not null or public.is_superadmin());
