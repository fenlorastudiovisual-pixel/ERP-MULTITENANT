// Sincronización del estado del Super Admin con las tablas operativas de Neon.
// Cada id lógico (t1, d7, inicio...) se convierte siempre en el mismo UUID,
// por lo que la migración es idempotente. Este módulo lo usan:
//   - /api/state (doble escritura: JSONB + tablas en la misma transacción)
//   - database/migrate-state.mjs (backfill inicial)
// Solo para servidor.

import { createHash } from "node:crypto";
import { MODULES, DEMOS } from "./data.js";

/** UUID v5 determinista a partir de una clave lógica. */
export function uuidFor(key) {
  const bytes = createHash("sha1").update(`erp-multitenant:${key}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versión 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20, 32),
  ].join("-");
}

const text = (value) => (value === undefined || value === null ? null : String(value));
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const timestamp = (value) => {
  const raw = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : null;
};
const day = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null);
const slugify = (value) =>
  String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "sin-nombre";

const COUNTRY_CODES = {
  "Colombia": "CO", "México": "MX", "España": "ES", "Chile": "CL", "Perú": "PE",
  "Argentina": "AR", "Rep. Dominicana": "DO", "Brasil": "BR", "Uruguay": "UY",
  "Guatemala": "GT",
};
const TENANT_STATUS = {
  "Activo": "active", "Prueba": "trial", "Suspendido": "suspended", "Archivado": "archived",
};
const TENANT_MODE = { "Pool": "pool", "Bridge": "bridge", "Silo": "silo" };
const USER_ROLES = {
  "Super Admin": "super_admin", "Ventas": "sales", "Soporte": "support",
  "Devops": "devops", "Solo lectura": "readonly",
};
const FLAG_LABELS = {
  tours: "Tours guiados", whatsapp: "WhatsApp", einvoice: "Facturación electrónica",
  api: "API pública", whiteLabel: "Marca blanca",
};
const MODULE_CATEGORY = { "Núcleo": "core", "Extendidos": "extended", "Otros": "industry" };

/**
 * Devuelve las consultas (ya etiquetadas con `tx`) necesarias para reflejar
 * `state` en las tablas operativas. El orden respeta las llaves foráneas.
 */
export function buildSyncQueries(tx, state = {}) {
  const queries = [];
  const json = (rows) => JSON.stringify(rows);
  const plans = Array.isArray(state.plans) ? state.plans : [];
  const tenants = Array.isArray(state.tenants) ? state.tenants : [];
  const demos = Array.isArray(state.demos) ? state.demos : [];
  const users = Array.isArray(state.users) ? state.users : [];
  const languages = Array.isArray(state.languages) ? state.languages : [];
  const translations = Array.isArray(state.translations) ? state.translations : [];
  const leads = Array.isArray(state.leads) ? state.leads : [];
  const currency = text(state.settings?.currency) || "COP";
  const planIds = new Map(plans.map((plan) => [String(plan.id), uuidFor(`plan:${plan.id}`)]));
  const knownModules = new Set(MODULES.map((module) => module.id));

  // ── Catálogo: planes ──────────────────────────────────────────────────────
  queries.push(tx`
    insert into public.plans
      (id, source_key, slug, name, tagline, price_monthly, currency, badge, color, active)
    select x.id::uuid, x.source_key, x.slug, x.name, x.tagline, x.price_monthly,
           x.currency, x.badge, x.color, x.active
    from jsonb_to_recordset(${json(plans.map((plan) => ({
      id: uuidFor(`plan:${plan.id}`),
      source_key: text(plan.id),
      slug: text(plan.id),
      name: text(plan.name) || text(plan.id),
      tagline: text(plan.tagline),
      price_monthly: number(plan.price),
      currency,
      badge: text(plan.badge) || null,
      color: text(plan.color),
      active: true,
    })))}::jsonb) as x(
      id text, source_key text, slug text, name text, tagline text,
      price_monthly numeric, currency text, badge text, color text, active boolean
    )
    on conflict (id) do update set
      source_key = excluded.source_key, slug = excluded.slug, name = excluded.name,
      tagline = excluded.tagline, price_monthly = excluded.price_monthly,
      currency = excluded.currency, badge = excluded.badge, color = excluded.color,
      active = excluded.active
  `);

  queries.push(tx`
    insert into public.plan_limits
      (plan_id, max_users, max_sites, max_products, max_invoices_month, storage_gb,
       api_calls_month, max_languages, max_currencies, audit_retention_days, support_level)
    select x.plan_id::uuid, x.max_users, x.max_sites, x.max_products, x.max_invoices_month,
           x.storage_gb, x.api_calls_month, x.max_languages, x.max_currencies,
           x.audit_retention_days, x.support_level
    from jsonb_to_recordset(${json(plans.map((plan) => {
      const limits = plan.limits || {};
      return {
        plan_id: planIds.get(String(plan.id)),
        max_users: number(limits.users, 5),
        max_sites: number(limits.sites, 1),
        max_products: number(limits.products, 500),
        max_invoices_month: number(limits.invoices, 100),
        storage_gb: number(limits.storage, 1),
        api_calls_month: number(limits.api, 10000),
        max_languages: number(limits.languages, 1),
        max_currencies: number(limits.currencies, 1),
        audit_retention_days: number(limits.auditDays, 30),
        support_level: text(limits.support) || "community",
      };
    }))}::jsonb) as x(
      plan_id text, max_users integer, max_sites integer, max_products integer,
      max_invoices_month integer, storage_gb integer, api_calls_month bigint,
      max_languages integer, max_currencies integer, audit_retention_days integer,
      support_level text
    )
    on conflict (plan_id) do update set
      max_users = excluded.max_users, max_sites = excluded.max_sites,
      max_products = excluded.max_products, max_invoices_month = excluded.max_invoices_month,
      storage_gb = excluded.storage_gb, api_calls_month = excluded.api_calls_month,
      max_languages = excluded.max_languages, max_currencies = excluded.max_currencies,
      audit_retention_days = excluded.audit_retention_days,
      support_level = excluded.support_level
  `);

  // ── Catálogo: módulos y su acceso por plan ───────────────────────────────
  queries.push(tx`
    insert into public.modules (id, source_key, code, label, category, version, active)
    select x.id::uuid, x.source_key, x.code, x.label, x.category, x.version, x.active
    from jsonb_to_recordset(${json(MODULES.map((module) => ({
      id: uuidFor(`module:${module.id}`),
      source_key: module.id,
      code: module.id,
      label: module.label,
      category: MODULE_CATEGORY[module.group] || "core",
      version: "1.0.0",
      active: true,
    })))}::jsonb) as x(
      id text, source_key text, code text, label text, category text,
      version text, active boolean
    )
    on conflict (id) do update set
      source_key = excluded.source_key, code = excluded.code, label = excluded.label,
      category = excluded.category, version = excluded.version, active = excluded.active
  `);

  const planModuleRows = [];
  for (const plan of plans) {
    for (const [code, access] of Object.entries(plan.modules || {})) {
      if (!knownModules.has(code)) continue;
      planModuleRows.push({
        plan_id: planIds.get(String(plan.id)),
        module_id: uuidFor(`module:${code}`),
        access: text(access) || "off",
      });
    }
  }
  queries.push(tx`
    insert into public.plan_modules (plan_id, module_id, access)
    select x.plan_id::uuid, x.module_id::uuid, x.access
    from jsonb_to_recordset(${json(planModuleRows)}::jsonb) as x(
      plan_id text, module_id text, access text
    )
    on conflict (plan_id, module_id) do update set access = excluded.access
  `);

  // ── Catálogo: banderas ────────────────────────────────────────────────────
  const flagCodes = new Set();
  for (const plan of plans) for (const code of Object.keys(plan.flags || {})) flagCodes.add(code);
  queries.push(tx`
    insert into public.feature_flags (id, source_key, code, label, enabled)
    select x.id::uuid, x.source_key, x.code, x.label, x.enabled
    from jsonb_to_recordset(${json([...flagCodes].map((code) => ({
      id: uuidFor(`flag:${code}`),
      source_key: code,
      code,
      label: FLAG_LABELS[code] || code,
      enabled: false,
    })))}::jsonb) as x(id text, source_key text, code text, label text, enabled boolean)
    on conflict (id) do update set
      source_key = excluded.source_key, code = excluded.code,
      label = excluded.label, enabled = excluded.enabled
  `);

  const planFlagRows = [];
  for (const plan of plans) {
    for (const [code, enabled] of Object.entries(plan.flags || {})) {
      planFlagRows.push({
        plan_id: planIds.get(String(plan.id)),
        flag_id: uuidFor(`flag:${code}`),
        enabled: Boolean(enabled),
      });
    }
  }
  queries.push(tx`
    insert into public.plan_flags (plan_id, flag_id, enabled)
    select x.plan_id::uuid, x.flag_id::uuid, x.enabled
    from jsonb_to_recordset(${json(planFlagRows)}::jsonb) as x(
      plan_id text, flag_id text, enabled boolean
    )
    on conflict (plan_id, flag_id) do update set enabled = excluded.enabled
  `);

  // ── Tenants ───────────────────────────────────────────────────────────────
  const tenantRows = tenants.map((tenant) => ({
    id: uuidFor(`tenant:${tenant.id}`),
    source_key: text(tenant.id),
    slug: `${slugify(tenant.name)}-${String(tenant.id).toLowerCase()}`,
    name: text(tenant.name) || text(tenant.id),
    niche: text(tenant.niche),
    plan_id: planIds.get(String(tenant.plan)) || null,
    country: COUNTRY_CODES[tenant.country] || null,
    country_name: text(tenant.country),
    city: text(tenant.city),
    status: TENANT_STATUS[tenant.status] || "trial",
    isolation_mode: TENANT_MODE[tenant.mode] || "pool",
    region: "america",
    health_score: number(tenant.health),
    brand: json({ color: tenant.color }),
    settings: json({ users: tenant.users, mrr: tenant.mrr, created: tenant.created }),
    mrr: number(tenant.mrr),
    users_count: number(tenant.users),
    created_at: timestamp(tenant.created),
  }));
  queries.push(tx`
    insert into public.tenants
      (id, source_key, slug, name, niche, plan_id, country, country_name, city,
       status, isolation_mode, region, health_score, brand, settings, mrr,
       users_count, created_at)
    select x.id::uuid, x.source_key, x.slug, x.name, x.niche, x.plan_id::uuid,
           x.country, x.country_name, x.city, x.status, x.isolation_mode, x.region,
           x.health_score::smallint, x.brand::jsonb, x.settings::jsonb, x.mrr,
           x.users_count, x.created_at::timestamptz
    from jsonb_to_recordset(${json(tenantRows)}::jsonb) as x(
      id text, source_key text, slug text, name text, niche text, plan_id text,
      country text, country_name text, city text, status text, isolation_mode text,
      region text, health_score integer, brand text, settings text, mrr numeric,
      users_count integer, created_at text
    )
    on conflict (id) do update set
      source_key = excluded.source_key, slug = excluded.slug, name = excluded.name,
      niche = excluded.niche, plan_id = excluded.plan_id, country = excluded.country,
      country_name = excluded.country_name, city = excluded.city, status = excluded.status,
      isolation_mode = excluded.isolation_mode, region = excluded.region,
      health_score = excluded.health_score, brand = excluded.brand,
      settings = excluded.settings, mrr = excluded.mrr,
      users_count = excluded.users_count, created_at = excluded.created_at
  `);

  const subscriptionRows = tenants
    .filter((tenant) => planIds.has(String(tenant.plan)))
    .map((tenant) => ({
      id: uuidFor(`subscription:${tenant.id}`),
      source_key: text(tenant.id),
      tenant_id: uuidFor(`tenant:${tenant.id}`),
      plan_id: planIds.get(String(tenant.plan)),
      starts_at: timestamp(tenant.created),
      status: TENANT_STATUS[tenant.status] || "trial",
    }));
  queries.push(tx`
    insert into public.subscriptions (id, source_key, tenant_id, plan_id, starts_at, status)
    select x.id::uuid, x.source_key, x.tenant_id::uuid, x.plan_id::uuid,
           x.starts_at::timestamptz, x.status
    from jsonb_to_recordset(${json(subscriptionRows)}::jsonb) as x(
      id text, source_key text, tenant_id text, plan_id text, starts_at text, status text
    )
    on conflict (id) do update set
      source_key = excluded.source_key, tenant_id = excluded.tenant_id,
      plan_id = excluded.plan_id, starts_at = excluded.starts_at, status = excluded.status
  `);

  // ── Escenarios de demo ────────────────────────────────────────────────────
  const scenarioRows = DEMOS.map((demo) => ({
    id: uuidFor(`demo-scenario:${demo.id}`),
    source_key: demo.id,
    code: demo.id,
    name: demo.name,
    niche: String(demo.name).split("/")[0].trim(),
    size: demo.size,
    modules: demo.modules || [],
    seed_data: json({ seed: demo.seed, kpi: demo.kpi, notes: demo.notes }),
    star_flow: demo.flow,
    kpi_label: demo.kpi,
    icon: demo.icon,
    color: demo.color,
    seed_text: demo.seed,
    notes: demo.notes,
    active: true,
  }));
  queries.push(tx`
    insert into public.demo_scenarios
      (id, source_key, code, name, niche, size, modules, seed_data, star_flow,
       kpi_label, icon, color, seed_text, notes, active)
    select x.id::uuid, x.source_key, x.code, x.name, x.niche, x.size,
           coalesce((select array_agg(m.value) from jsonb_array_elements_text(x.modules) m), '{}'::text[]),
           x.seed_data::jsonb, x.star_flow, x.kpi_label, x.icon, x.color,
           x.seed_text, x.notes, x.active
    from jsonb_to_recordset(${json(scenarioRows)}::jsonb) as x(
      id text, source_key text, code text, name text, niche text, size text,
      modules jsonb, seed_data text, star_flow text, kpi_label text,
      icon text, color text, seed_text text, notes text, active boolean
    )
    on conflict (id) do update set
      source_key = excluded.source_key, code = excluded.code, name = excluded.name,
      niche = excluded.niche, size = excluded.size, modules = excluded.modules,
      seed_data = excluded.seed_data, star_flow = excluded.star_flow,
      kpi_label = excluded.kpi_label, icon = excluded.icon, color = excluded.color,
      seed_text = excluded.seed_text, notes = excluded.notes, active = excluded.active
  `);

  // ── Demos generadas ───────────────────────────────────────────────────────
  const demoStatus = { "Activa": "active", "Convertida": "converted", "Expirada": "expired" };
  const demoTenantRows = demos.map((demo) => ({
    id: uuidFor(`demo-tenant:${demo.id}`),
    source_key: text(demo.id),
    scenario_id: DEMOS.some((item) => item.id === demo.demoId)
      ? uuidFor(`demo-scenario:${demo.demoId}`) : null,
    prospect_name: text(demo.prospect),
    share_token: String(demo.link || "").split("/").filter(Boolean).pop() || String(demo.id),
    expires_at: timestamp(demo.expires),
    status: demoStatus[demo.status] || "active",
    visits: number(demo.visits),
    tour_steps: number(demo.steps),
    brand: json({
      name: demo.name, icon: demo.icon, color: demo.color, size: demo.size,
      language: demo.language, modules: demo.modules,
    }),
    name: text(demo.name),
    icon: text(demo.icon),
    color: text(demo.color),
    size: text(demo.size),
    language: text(demo.language),
    modules: demo.modules || [],
    leads_count: number(demo.leads),
    created_at: timestamp(demo.created),
  }));
  queries.push(tx`
    insert into public.demo_tenants
      (id, source_key, scenario_id, prospect_name, share_token, expires_at, status,
       visits, tour_steps, brand, name, icon, color, size, language, modules,
       leads_count, created_at)
    select x.id::uuid, x.source_key, x.scenario_id::uuid, x.prospect_name,
           x.share_token, x.expires_at::timestamptz, x.status, x.visits, x.tour_steps,
           x.brand::jsonb, x.name, x.icon, x.color, x.size, x.language,
           coalesce((select array_agg(m.value) from jsonb_array_elements_text(x.modules) m), '{}'::text[]),
           x.leads_count, x.created_at::timestamptz
    from jsonb_to_recordset(${json(demoTenantRows)}::jsonb) as x(
      id text, source_key text, scenario_id text, prospect_name text, share_token text,
      expires_at text, status text, visits integer, tour_steps integer, brand text,
      name text, icon text, color text, size text, language text, modules jsonb,
      leads_count integer, created_at text
    )
    on conflict (id) do update set
      source_key = excluded.source_key, scenario_id = excluded.scenario_id,
      prospect_name = excluded.prospect_name, share_token = excluded.share_token,
      expires_at = excluded.expires_at, status = excluded.status, visits = excluded.visits,
      tour_steps = excluded.tour_steps, brand = excluded.brand, name = excluded.name,
      icon = excluded.icon, color = excluded.color, size = excluded.size,
      language = excluded.language, modules = excluded.modules,
      leads_count = excluded.leads_count, created_at = excluded.created_at
  `);

  // ── Idiomas y traducciones ────────────────────────────────────────────────
  queries.push(tx`
    insert into public.languages (id, source_key, code, name, native_name, translated, state)
    select x.id::uuid, x.source_key, x.code, x.name, x.native_name,
           x.translated::smallint, x.state
    from jsonb_to_recordset(${json(languages.map((item) => ({
      id: uuidFor(`language:${item.code}`),
      source_key: text(item.code),
      code: text(item.code),
      name: text(item.name),
      native_name: text(item.native),
      translated: number(item.translated),
      state: text(item.state),
    })))}::jsonb) as x(
      id text, source_key text, code text, name text, native_name text,
      translated integer, state text
    )
    on conflict (id) do update set
      source_key = excluded.source_key, code = excluded.code, name = excluded.name,
      native_name = excluded.native_name, translated = excluded.translated,
      state = excluded.state
  `);

  queries.push(tx`
    insert into public.translations (id, source_key, key, payload)
    select x.id::uuid, x.source_key, x.key, x.payload::jsonb
    from jsonb_to_recordset(${json(translations.map((item) => ({
      id: uuidFor(`translation:${item.key}`),
      source_key: text(item.key),
      key: text(item.key),
      payload: json({ es: item.es, en: item.en, pt: item.pt }),
    })))}::jsonb) as x(id text, source_key text, key text, payload text)
    on conflict (id) do update set
      source_key = excluded.source_key, key = excluded.key, payload = excluded.payload
  `);

  // ── Leads capturados ──────────────────────────────────────────────────────
  queries.push(tx`
    insert into public.leads (id, source_key, name, email, company, phone, demo, captured_date)
    select x.id::uuid, x.source_key, x.name, x.email, x.company, x.phone, x.demo,
           x.captured_date::date
    from jsonb_to_recordset(${json(leads.map((lead, index) => ({
      id: uuidFor(`lead:${lead.email || lead.demo || index}`),
      source_key: text(lead.email || `${lead.demo || "lead"}-${index}`),
      name: text(lead.name),
      email: text(lead.email),
      company: text(lead.company),
      phone: text(lead.phone),
      demo: text(lead.demo),
      captured_date: day(lead.date),
    })))}::jsonb) as x(
      id text, source_key text, name text, email text, company text, phone text,
      demo text, captured_date text
    )
    on conflict (id) do update set
      source_key = excluded.source_key, name = excluded.name, email = excluded.email,
      company = excluded.company, phone = excluded.phone, demo = excluded.demo,
      captured_date = excluded.captured_date
  `);

  // ── Configuración de marca ────────────────────────────────────────────────
  queries.push(tx`
    insert into public.platform_config (id, branding, settings, updated_at)
    values ('main', ${json(state.branding || {})}::jsonb,
            ${json(state.settings || {})}::jsonb, now())
    on conflict (id) do update set
      branding = excluded.branding, settings = excluded.settings, updated_at = now()
  `);

  // ── Usuarios de plataforma (identidad + perfil) ───────────────────────────
  const userRows = users.map((user) => ({
    id: uuidFor(`user:${String(user.email).toLowerCase()}`),
    source_key: text(user.email),
    full_name: text(user.name),
    email: text(user.email),
    global_role: USER_ROLES[user.role] || "readonly",
    mfa_enabled: Boolean(user.mfa),
    scope: text(user.scope),
    state: text(user.state),
  }));
  queries.push(tx`
    insert into auth.users (id, email, created_at)
    select x.id::uuid, x.email, now()
    from jsonb_to_recordset(${json(userRows)}::jsonb) as x(id text, email text)
    on conflict (email) do nothing
  `);
  queries.push(tx`
    insert into public.profiles
      (id, source_key, full_name, email, global_role, mfa_enabled, scope, state, created_at)
    select u.id, x.source_key, x.full_name, x.email, x.global_role, x.mfa_enabled,
           x.scope, x.state, now()
    from jsonb_to_recordset(${json(userRows)}::jsonb) as x(
      id text, source_key text, full_name text, email text, global_role text,
      mfa_enabled boolean, scope text, state text
    )
    join auth.users u on lower(u.email) = lower(x.email)
    on conflict (source_key) do update set
      full_name = excluded.full_name, email = excluded.email,
      global_role = excluded.global_role, mfa_enabled = excluded.mfa_enabled,
      scope = excluded.scope, state = excluded.state
  `);

  return queries;
}
